import { Resend } from "resend";

/**
 * All outbound email goes through here. Resend free tier caps at 100/day —
 * batch notifications into digests rather than sending per-event.
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM = process.env.EMAIL_FROM ?? "OpenVenture <onboarding@resend.dev>";

export async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!resend) {
    // Dev without a key: log instead of failing, so magic links are usable
    // from the server console.
    console.info(`[email:dev] To: ${opts.to} — ${opts.subject}\n${opts.html}`);
    return;
  }
  const { error } = await resend.emails.send({ from: FROM, ...opts });
  if (error) throw new Error(`Email send failed: ${error.message}`);
}

export function magicLinkEmail(url: string, otp?: string) {
  return `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="font-size:18px;margin:0 0 12px">Sign in to OpenVenture</h2>
    <p style="color:#555;font-size:14px;line-height:1.5">Click the button below to sign in. This link expires in 15 minutes.</p>
    <p style="margin:20px 0">
      <a href="${url}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px">Sign in</a>
    </p>
    ${
      otp
        ? `<p style="color:#555;font-size:13px">Or enter this code: <strong style="font-size:16px;letter-spacing:2px">${otp}</strong></p>`
        : ""
    }
    <p style="color:#999;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}
