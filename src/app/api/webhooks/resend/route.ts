import { NextResponse } from "next/server";
import { and, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { activity, member } from "@/db/schema";
import { deliveryProblem, verifyResendWebhook } from "@/lib/resend-webhook";

/**
 * Bounces and spam complaints from Resend. Optional: it does nothing until
 * RESEND_WEBHOOK_SECRET is set (ADMIN_RUNBOOK.md → Email).
 *
 * A hard bounce pauses the club's scheduled email to that member and says so
 * in the activity log, so an admin can fix the address. A complaint switches
 * the digest and reminders off for them. Sign-in email is never blocked: a
 * member must always be able to get back in.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 404 });

  const body = await req.text();
  const verified = verifyResendWebhook(
    secret,
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body
  );
  if (!verified) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Not JSON" }, { status: 400 });
  }
  const problem = deliveryProblem(event);
  if (!problem) return NextResponse.json({ ok: true, ignored: true });

  const affected = await db
    .select({ id: member.id, orgId: member.orgId, displayName: member.displayName, prefs: member.emailPrefs })
    .from(member)
    .where(and(inArray(sql`lower(${member.email})`, problem.addresses), isNull(member.offboardedAt)));

  for (const m of affected) {
    // Deliveries can repeat; only the first one changes anything.
    const already =
      problem.kind === "bounced"
        ? Boolean(m.prefs.undeliverableSince)
        : m.prefs.digest === false && m.prefs.reminders === false;
    if (already) continue;
    const patch =
      problem.kind === "bounced"
        ? { undeliverableSince: new Date().toISOString() }
        : { digest: false, reminders: false };
    await db
      .update(member)
      .set({ emailPrefs: sql`${member.emailPrefs} || ${JSON.stringify(patch)}::jsonb`, updatedAt: new Date() })
      .where(sql`${member.id} = ${m.id}`);
    await db.insert(activity).values({
      orgId: m.orgId,
      actorType: "integration",
      verb: problem.kind === "bounced" ? "member.email_bounced" : "member.email_complaint",
      entityType: "member",
      entityId: m.id,
      entityLabel: m.displayName,
      summary:
        problem.kind === "bounced"
          ? `Email to ${m.displayName} bounced. Scheduled email to them is paused until the address is fixed.`
          : `${m.displayName} marked a club email as spam. The digest and reminders are switched off for them.`,
    });
  }
  return NextResponse.json({ ok: true, members: affected.length });
}
