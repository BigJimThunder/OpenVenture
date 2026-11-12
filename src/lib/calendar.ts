import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { orgSettings } from "@/lib/org-settings";

/**
 * The calendar feed is a capability URL: calendar apps cannot sign in, so the
 * link itself is the key. Anyone who has it can read the club's meeting
 * times and titles, which is why it can be reset (Settings → Data) — for
 * instance after someone leaves.
 */

/** The original link: HMAC of a fixed label with the org's signing secret. */
export function calendarToken(secret: string) {
  return createHmac("sha256", secret).update("calendar").digest("hex").slice(0, 32);
}

export function newCalendarFeedToken(): string {
  return randomBytes(20).toString("hex");
}

type OrgLike = { ingestSecret: string | null; settings: unknown };

/** The token the club's feed currently answers to, or null if it has none yet. */
export function calendarFeedToken(org: OrgLike): string | null {
  const stored = orgSettings(org).calendar.feedToken;
  if (stored) return stored;
  return org.ingestSecret ? calendarToken(org.ingestSecret) : null;
}

export function calendarFeedMatches(org: OrgLike, provided: string): boolean {
  const expected = calendarFeedToken(org);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
