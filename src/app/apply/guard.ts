import { createHash, createHmac, randomUUID, timingSafeEqual } from "crypto";
import { and, eq, gte, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { application, notificationLog } from "@/db/schema";

/**
 * Spam protection for the public application form, with no third-party
 * service: a signed render timestamp (bots submit instantly), a honeypot
 * (handled in the action), and rate limits counted in Postgres.
 */

const secret = () => process.env.BETTER_AUTH_SECRET ?? "dev-secret-do-not-use-in-prod";
const sign = (value: string) => createHmac("sha256", secret()).update(`apply:${value}`).digest("hex");

/** Fastest a person could plausibly fill the required fields. */
const MIN_FILL_MS = 4_000;
/** A form left open overnight should be re-rendered, not trusted forever. */
const MAX_AGE_MS = 24 * 3_600_000;

/** Rendered into the form so the server knows when this visitor first saw it. */
export function issueFormToken(now = Date.now()): string {
  return `${now}.${sign(String(now))}`;
}

export function checkFormToken(token: string, now = Date.now()): "ok" | "too_fast" | "stale" | "invalid" {
  const [issued, signature] = token.split(".");
  if (!issued || !signature) return "invalid";
  const expected = Buffer.from(sign(issued));
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return "invalid";
  const age = now - Number(issued);
  if (!Number.isFinite(age) || age > MAX_AGE_MS) return "stale";
  return age < MIN_FILL_MS ? "too_fast" : "ok";
}

/** Campus networks put a whole dorm behind one address, so this is generous. */
const PER_IP_PER_HOUR = 8;
const PER_EMAIL_PER_DAY = 2;
/** Backstop against a distributed flood (and the club's daily email quota). */
const TOTAL_PER_DAY = 80;

/** Addresses are only ever stored as a salted hash. */
export function hashIp(ip: string): string {
  return createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 24);
}

export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export type RateVerdict = "ok" | "ip" | "email" | "busy";

export async function checkRateLimit(orgId: string, ipHash: string, email: string): Promise<RateVerdict> {
  const now = Date.now();
  const hourAgo = new Date(now - 3_600_000);
  const dayAgo = new Date(now - 24 * 3_600_000);
  const attempts = and(eq(notificationLog.orgId, orgId), eq(notificationLog.kind, "apply_attempt"));
  const count = sql<number>`count(*)::int`;
  const [[fromIp], [total], [fromEmail]] = await Promise.all([
    db
      .select({ n: count })
      .from(notificationLog)
      .where(and(attempts, like(notificationLog.key, `${ipHash}:%`), gte(notificationLog.sentAt, hourAgo))),
    db.select({ n: count }).from(notificationLog).where(and(attempts, gte(notificationLog.sentAt, dayAgo))),
    db
      .select({ n: count })
      .from(application)
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.applicantEmail, email),
          gte(application.createdAt, dayAgo)
        )
      ),
  ]);
  if ((fromIp?.n ?? 0) >= PER_IP_PER_HOUR) return "ip";
  if ((fromEmail?.n ?? 0) >= PER_EMAIL_PER_DAY) return "email";
  if ((total?.n ?? 0) >= TOTAL_PER_DAY) return "busy";
  return "ok";
}

/** Rows are pruned by the daily job after two days. */
export async function recordAttempt(orgId: string, ipHash: string): Promise<void> {
  await db.insert(notificationLog).values({
    orgId,
    kind: "apply_attempt",
    key: `${ipHash}:${randomUUID()}`,
  });
}
