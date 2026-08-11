import { createHmac } from "crypto";

/** Capability token for the iCal feed: HMAC of a fixed label with the org's ingest secret. */
export function calendarToken(secret: string) {
  return createHmac("sha256", secret).update("calendar").digest("hex").slice(0, 32);
}
