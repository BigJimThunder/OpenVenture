import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifying Resend's webhooks (they are signed with Svix's scheme):
 *   signature = base64(HMAC-SHA256(secret, `${id}.${timestamp}.${body}`))
 * where the secret is the base64 part of `whsec_…`, and the header may carry
 * several space-separated `v1,<signature>` values (during a secret rotation).
 */

const TOLERANCE_SECONDS = 5 * 60;

export function verifyResendWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now: number = Date.now()
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const provided = Buffer.from(value, "base64");
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
}

export type DeliveryProblem = { kind: "bounced" | "complained"; addresses: string[] };

/** The two events that mean "stop sending scheduled email here". */
export function deliveryProblem(event: unknown): DeliveryProblem | null {
  if (typeof event !== "object" || event === null) return null;
  const { type, data } = event as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } };
  if (type !== "email.bounced" && type !== "email.complained") return null;
  // A soft bounce (full mailbox, greylisting) sorts itself out.
  if (type === "email.bounced" && typeof data?.bounce?.type === "string" && /transient|soft/i.test(data.bounce.type)) {
    return null;
  }
  const to = Array.isArray(data?.to) ? data.to : typeof data?.to === "string" ? [data.to] : [];
  const addresses = to.filter((a): a is string => typeof a === "string").map((a) => a.trim().toLowerCase());
  if (addresses.length === 0) return null;
  return { kind: type === "email.bounced" ? "bounced" : "complained", addresses };
}
