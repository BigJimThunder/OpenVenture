import { createHmac, timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import type { EmailCategory, EmailPrefs } from "@/db/schema";
import { deriveKey } from "@/lib/env";

/**
 * All outbound email goes through here. Resend free tier caps at 100/day —
 * batch notifications into digests rather than sending per-event.
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM ?? "OpenVenture <onboarding@resend.dev>";

function baseUrl(): string {
  // Kept local (notify.ts imports this module).
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
}

/**
 * Who a scheduled email is for and which kind it is. Giving an email an
 * audience makes it optional: it is skipped if the member has switched that
 * kind off (or their address is bouncing), and it carries a one-click
 * unsubscribe. Sign-in mail and mail a person sent on purpose have none.
 */
export type EmailAudience = {
  memberId: string;
  category: EmailCategory;
  prefs?: EmailPrefs | null;
};

export type SendResult = "sent" | "logged" | "skipped";

// ——— unsubscribe links ———

function unsubscribeSignature(memberId: string, category: EmailCategory): string {
  return createHmac("sha256", deriveKey("unsubscribe")).update(`${memberId}:${category}`).digest("hex").slice(0, 32);
}

/** `page` is the link people click; `oneClick` is what mail clients POST to (RFC 8058). */
export function unsubscribeUrl(memberId: string, category: EmailCategory, kind: "page" | "oneClick" = "page"): string {
  const query = new URLSearchParams({ m: memberId, c: category, s: unsubscribeSignature(memberId, category) });
  return `${baseUrl()}${kind === "page" ? "/unsubscribe" : "/api/email/unsubscribe"}?${query}`;
}

export function verifyUnsubscribe(memberId: string, category: string, signature: string): category is EmailCategory {
  if (category !== "digest" && category !== "reminders") return false;
  const expected = Buffer.from(unsubscribeSignature(memberId, category));
  const provided = Buffer.from(signature);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const CATEGORY_LABEL: Record<EmailCategory, string> = {
  digest: "the weekly digest",
  reminders: "reminder emails",
};

/** A readable plain-text version: some clients and every spam filter want one. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      const url = href.replace(/&amp;/g, "&");
      return !text || text === url ? url : `${text}: ${url}`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Rate limits and provider hiccups are worth another try; a bad address is not. */
function retryable(error: { name?: string; statusCode?: number | null; message?: string }): boolean {
  const status = error.statusCode ?? 0;
  return status === 429 || status >= 500 || error.name === "rate_limit_exceeded" || error.name === "application_error";
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  audience?: EmailAudience;
}): Promise<SendResult> {
  const { audience } = opts;
  if (audience?.prefs && (audience.prefs[audience.category] === false || audience.prefs.undeliverableSince)) {
    return "skipped";
  }

  let html = opts.html;
  const headers: Record<string, string> = {};
  if (audience) {
    const url = unsubscribeUrl(audience.memberId, audience.category);
    headers["List-Unsubscribe"] = `<${unsubscribeUrl(audience.memberId, audience.category, "oneClick")}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    const line = `<div style="max-width:540px;margin:0 auto;font-size:12px;line-height:1.5;color:#8b8b94;padding:6px 4px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Don't want ${CATEGORY_LABEL[audience.category]}? <a href="${url.replace(/&/g, "&amp;")}" style="color:#8b8b94">Turn them off</a>.</div>`;
    html = html.includes("</body>") ? html.replace("</body>", `${line}</body>`) : `${html}${line}`;
  }

  if (!resend) {
    // No key: log instead of failing, so sign-in links are usable from the
    // server log on a deployment that has not connected email yet.
    console.info(`[email:dev] To: ${opts.to} — ${opts.subject}\n${html}`);
    return "logged";
  }

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await resend.emails.send({
      from: FROM,
      to: opts.to,
      subject: opts.subject,
      html,
      text: htmlToText(html),
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
    });
    if (!error) return "sent";
    lastError = error.message;
    if (attempt === 3 || !retryable(error)) break;
    // Resend allows a couple of requests a second; a short pause clears a burst.
    await wait(attempt * 700);
  }
  throw new Error(`Email send failed: ${lastError}`);
}

export function magicLinkEmail(url: string, otp?: string) {
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="font-size:18px;margin:0 0 12px">Sign in to OpenVenture</h2>
    <p style="color:#555;font-size:14px;line-height:1.5">Click the button below to sign in. This link expires in 15 minutes.</p>
    <p style="margin:20px 0">
      <a href="${url}" style="background:#2f4ad6;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">Sign in</a>
    </p>
    ${
      otp
        ? `<p style="color:#555;font-size:13px">Or enter this code: <strong style="font-size:16px;letter-spacing:2px">${otp}</strong></p>`
        : ""
    }
    <p style="color:#999;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}
