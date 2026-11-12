import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { member, notificationLog } from "@/db/schema";
import { clientIp, hashIp } from "@/app/apply/guard";
import { auth, linkCapture } from "@/lib/auth";
import { DEMO_EMAIL, demoMode } from "@/lib/demo";
import { loadSoleOrg } from "@/lib/intake";

/**
 * "Explore the demo": sign the visitor in as the demo club's admin, without
 * an email. Public by design, and only does anything when the deployment is
 * in demo mode — the environment switch AND seeded demo data (src/lib/demo.ts).
 * Everything the visitor then tries to change is refused.
 *
 * The sign-in is better-auth's own: a link is requested the ordinary way,
 * collected instead of emailed, and verified here in the same request. No
 * session is forged, and the one-time token never reaches the browser.
 */

export const dynamic = "force-dynamic";

const PER_ADDRESS_PER_HOUR = 30;

const back = (req: Request, query = "") => NextResponse.redirect(new URL(`/login${query}`, req.url), 303);

export async function POST(req: Request) {
  const org = await loadSoleOrg();
  if (!org || !demoMode(org)) return back(req);

  const [demoMember] = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.orgId, org.id), eq(member.email, DEMO_EMAIL), eq(member.status, "active")))
    .limit(1);
  if (!demoMember) return back(req);

  // Each entry creates a session row; keep one address from creating thousands.
  const who = hashIp(clientIp(req.headers));
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, org.id),
        eq(notificationLog.kind, "demo_entry"),
        like(notificationLog.key, `${who}:%`),
        gte(notificationLog.sentAt, new Date(Date.now() - 3_600_000))
      )
    );
  if ((recent?.n ?? 0) >= PER_ADDRESS_PER_HOUR) return back(req, "?demo=busy");
  await db.insert(notificationLog).values({ orgId: org.id, kind: "demo_entry", key: `${who}:${randomUUID()}` });

  const capture: { url?: string } = {};
  await linkCapture.run(capture, () =>
    auth.api.signInMagicLink({ body: { email: DEMO_EMAIL, callbackURL: "/inbox" }, headers: req.headers })
  );
  const token = capture.url ? new URL(capture.url).searchParams.get("token") : null;
  if (!token) return back(req);

  // better-auth answers with the session cookie and a redirect to the app.
  return auth.api.magicLinkVerify({
    query: { token, callbackURL: "/inbox" },
    headers: req.headers,
    asResponse: true,
  });
}
