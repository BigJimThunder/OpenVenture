import { createHash, randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNull, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { member, notificationLog, organization, user } from "@/db/schema";
import { breakGlassEmail } from "@/lib/env";

/**
 * Who may sign in — decided before any email is sent or any account exists.
 *
 * The club is invite-only, so the only addresses that should ever receive a
 * sign-in email (or get an auth account) are:
 *   - anyone, while the deployment has no club yet (first-run setup);
 *   - a member who is invited or active;
 *   - the break-glass address, while BOOTSTRAP_ADMIN_EMAIL is set.
 *
 * Everyone else gets the same "check your email" screen and no email. That
 * keeps strangers from spending the club's daily email allowance, from
 * creating accounts, and from learning who is a member.
 */
export async function maySignIn(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return false;

  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) {
    // First run. With BOOTSTRAP_ADMIN_EMAIL set, only that person may claim
    // a fresh deployment; without it, the first person in sets the club up.
    const reserved = breakGlassEmail();
    return reserved ? reserved === email : true;
  }
  if (breakGlassEmail() === email) return true;

  const [invited] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        sql`lower(${member.email}) = ${email}`,
        inArray(member.status, ["invited", "active"]),
        isNull(member.offboardedAt)
      )
    )
    .limit(1);
  if (invited) return true;

  // A member whose roster email differs from the address they sign in with.
  const [linked] = await db
    .select({ id: member.id })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(sql`lower(${user.email}) = ${email}`, eq(member.status, "active"), isNull(member.offboardedAt)))
    .limit(1);
  return Boolean(linked);
}

/** Sign-in emails one address may trigger per hour (link + code count as one). */
const PER_ADDRESS_PER_HOUR = 6;

/**
 * Counted in Postgres so the limit holds across serverless instances. Returns
 * false when this address has had enough for now; the caller sends nothing.
 */
export async function claimSignInMail(rawEmail: string, kind: "link" | "code"): Promise<boolean> {
  const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
  if (!org) return true; // first run: nothing to count against yet
  const who = createHash("sha256").update(rawEmail.trim().toLowerCase()).digest("hex").slice(0, 24);
  const logKind = `signin_${kind}`;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, org.id),
        eq(notificationLog.kind, logKind),
        like(notificationLog.key, `${who}:%`),
        gte(notificationLog.sentAt, new Date(Date.now() - 3_600_000))
      )
    );
  if ((row?.n ?? 0) >= PER_ADDRESS_PER_HOUR) return false;
  await db.insert(notificationLog).values({ orgId: org.id, kind: logKind, key: `${who}:${randomUUID()}` });
  return true;
}
