import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationLog, organization } from "@/db/schema";
import { sendEmail } from "@/lib/email";

/**
 * Outbound notifications: one email layout, Slack, and the idempotency guard
 * scheduled jobs rely on.
 *
 * Delivery rule: never fire-and-forget. On serverless, work that is still
 * pending when the response returns can be frozen and dropped. Either `await`
 * the send, or hand it to `after()` from `next/server`, which keeps the
 * function alive until it settles:
 *
 *   after(() => notifyMany(recipients.map((r) => () => sendEmailSafe({ … }))));
 */

export function appUrl(path = ""): string {
  const base = (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${base}${path.startsWith("/") || path === "" ? path : `/${path}`}`;
}

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text (with blank-line paragraphs) → escaped HTML paragraphs. */
export function textToHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`
    )
    .join("");
}

/**
 * The single email layout. `bodyHtml` is trusted HTML — build it from
 * `textToHtml` / `escapeHtml`, never from raw user input.
 */
export function emailLayout(opts: {
  orgName: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Small gray line under the body, e.g. why the recipient got this. */
  footer?: string;
}): string {
  const cta = opts.cta
    ? `<p style="margin:22px 0 6px"><a href="${escapeHtml(opts.cta.url)}" style="display:inline-block;background:#2f4ad6;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">${escapeHtml(opts.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f6;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:540px;margin:0 auto">
    <div style="font-size:13px;font-weight:600;color:#52525b;padding:0 4px 10px">${escapeHtml(opts.orgName)}</div>
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:26px 26px 22px">
      <h1 style="margin:0 0 14px;font-size:19px;line-height:1.3;color:#18181b;letter-spacing:-0.01em">${escapeHtml(opts.heading)}</h1>
      ${opts.bodyHtml}
      ${cta}
    </div>
    <div style="font-size:12px;line-height:1.5;color:#8b8b94;padding:12px 4px 0">${escapeHtml(opts.footer ?? `Sent by ${opts.orgName} via OpenVenture.`)}</div>
  </div></body></html>`;
}

/** Send, but never throw — returns whether it went out. */
export async function sendEmailSafe(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  try {
    await sendEmail(opts);
    return true;
  } catch (e) {
    console.error(`[notify] email to ${opts.to} failed`, e);
    return false;
  }
}

/** Run sends with bounded concurrency (Resend rate-limits bursts). */
export async function notifyMany(tasks: (() => Promise<unknown>)[], concurrency = 4): Promise<void> {
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      for (let task = queue.shift(); task; task = queue.shift()) {
        await task().catch((e) => console.error("[notify] task failed", e));
      }
    })
  );
}

/** Post to the club's Slack incoming webhook, if one is configured. */
export async function postSlack(
  org: Pick<typeof organization.$inferSelect, "slackWebhookUrl">,
  text: string
): Promise<boolean> {
  if (!org.slackWebhookUrl) return false;
  try {
    const res = await fetch(org.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("[notify] slack post failed", e);
    return false;
  }
}

/**
 * Idempotency guard. Claims (kind, key) for the org; runs `send` only if this
 * call won the claim. If `send` throws or returns false the claim is released
 * so the next run retries.
 */
export async function sendOnce(
  claim: { orgId: string; kind: string; key: string; recipient?: string; summary?: string },
  send: () => Promise<boolean | void>
): Promise<boolean> {
  const inserted = await db
    .insert(notificationLog)
    .values(claim)
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (inserted.length === 0) return false;
  let ok = false;
  try {
    ok = (await send()) !== false;
  } catch (e) {
    console.error(`[notify] ${claim.kind}:${claim.key} failed`, e);
  }
  if (!ok) {
    await db
      .delete(notificationLog)
      .where(and(eq(notificationLog.id, inserted[0].id)));
  }
  return ok;
}
