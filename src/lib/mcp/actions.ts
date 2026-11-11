import { randomUUID } from "crypto";
import { z } from "zod";
import { and, gte, like, sql, eq } from "drizzle-orm";
import { db } from "@/db";
import { notificationLog } from "@/db/schema";
import type { Ctx } from "@/lib/actions/context";
import { ActionError, authedAction } from "@/lib/actions/safe-action";
import { runDaily } from "@/lib/automation/run";
import { appUrl, emailLayout, sendEmailSafe, textToHtml } from "@/lib/notify";
import { buildMemberDigest } from "./digest";
import { resolveActiveMember, ToolError } from "./resolve";

/**
 * Mutations that exist only for assistants: sending email and running the
 * automations. They go through `authedAction` like every other mutation
 * (role check, read-token refusal, activity log) but are NOT server actions —
 * this file has no "use server", so nothing here is reachable except through
 * the MCP endpoint.
 *
 * Email limits are counted in notification_log, not in memory, so they hold
 * across serverless instances and restarts.
 */

export const EMAIL_LIMITS = {
  /** email_me: messages to the token owner per rolling 24 hours. */
  mcp_email_me: 10,
  /** email_member: messages to other members per rolling 24 hours. */
  mcp_email_member: 20,
  /** send_me_digest with deliver "email". */
  mcp_digest: 5,
} as const;

type EmailKind = keyof typeof EMAIL_LIMITS;

async function assertEmailBudget(ctx: Ctx, kind: EmailKind) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, ctx.org.id),
        eq(notificationLog.kind, kind),
        like(notificationLog.key, `${ctx.member.id}:%`),
        gte(notificationLog.sentAt, new Date(Date.now() - 86_400_000))
      )
    );
  if ((row?.n ?? 0) >= EMAIL_LIMITS[kind]) {
    throw new ActionError(
      `Daily limit reached: ${EMAIL_LIMITS[kind]} of these emails per member per 24 hours. Try again tomorrow.`
    );
  }
}

async function recordEmail(ctx: Ctx, kind: EmailKind, recipient: string, summary: string) {
  await db.insert(notificationLog).values({
    orgId: ctx.org.id,
    kind,
    key: `${ctx.member.id}:${randomUUID()}`,
    recipient,
    summary: summary.slice(0, 200),
  });
}

const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Without a mail provider, sends are printed to the server log; say so. */
function deliveryNote(): string | undefined {
  return emailConfigured()
    ? undefined
    : "No email provider is configured on this deployment, so the message was written to the server log instead of being delivered.";
}

const message = {
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(10_000),
};

export const emailMe = authedAction({
  minRole: "analyst",
  input: z.object(message),
  handler: async (input, ctx) => {
    await assertEmailBudget(ctx, "mcp_email_me");
    const sent = await sendEmailSafe({
      to: ctx.member.email,
      subject: input.subject,
      html: emailLayout({
        orgName: ctx.org.name,
        heading: input.subject,
        bodyHtml: textToHtml(input.body),
        cta: { label: "Open OpenVenture", url: appUrl("/inbox") },
        footer: `Sent to you by your own assistant, through an access token you created. Revoke it at ${appUrl("/connect")}.`,
      }),
    });
    if (!sent) throw new ActionError("The email could not be sent. Nothing was delivered.");
    await recordEmail(ctx, "mcp_email_me", ctx.member.email, input.subject);
    return { data: { sent_to: ctx.member.email, note: deliveryNote() } };
  },
});

export const emailMember = authedAction({
  minRole: "partner",
  input: z.object({ memberId: z.string().uuid(), ...message }),
  handler: async (input, ctx) => {
    let recipient;
    try {
      recipient = await resolveActiveMember(ctx.org.id, input.memberId);
    } catch (e) {
      throw new ActionError(e instanceof ToolError ? e.message : "Member not found");
    }
    if (recipient.id === ctx.member.id) throw new ActionError("That is you. Use email_me.");
    await assertEmailBudget(ctx, "mcp_email_member");

    const sender = ctx.member.displayName;
    const sent = await sendEmailSafe({
      to: recipient.email,
      replyTo: ctx.member.email,
      subject: `${input.subject} — from ${sender}`,
      html: emailLayout({
        orgName: ctx.org.name,
        heading: input.subject,
        bodyHtml: textToHtml(input.body),
        footer: `Sent by ${sender} (${ctx.org.name}) through their assistant, via OpenVenture. Reply to reach ${sender} directly.`,
      }),
    });
    if (!sent) throw new ActionError("The email could not be sent. Nothing was delivered.");
    await recordEmail(ctx, "mcp_email_member", recipient.email, input.subject);
    return {
      data: { sent_to: recipient.displayName, note: deliveryNote() },
      activity: {
        verb: "member.emailed",
        entityType: "member",
        entityId: recipient.id,
        entityLabel: recipient.displayName,
        summary: `${sender} emailed ${recipient.displayName} through their assistant: ${input.subject}`,
      },
    };
  },
});

export const emailMyDigest = authedAction({
  minRole: "analyst",
  input: z.object({}),
  handler: async (_input, ctx) => {
    await assertEmailBudget(ctx, "mcp_digest");
    const digest = await buildMemberDigest(ctx);
    const sent = await sendEmailSafe({
      to: ctx.member.email,
      subject: `${ctx.org.name} — ${digest.subject}`,
      html: emailLayout({
        orgName: ctx.org.name,
        heading: "Your week at the club",
        bodyHtml: digest.bodyHtml,
        cta: { label: "Open your work", url: appUrl("/my-work") },
        footer: `You asked your assistant for this. It came through an access token you created; revoke it at ${appUrl("/connect")}.`,
      }),
    });
    if (!sent) throw new ActionError("The email could not be sent. Nothing was delivered.");
    await recordEmail(ctx, "mcp_digest", ctx.member.email, digest.subject);
    return { data: { sent_to: ctx.member.email, subject: digest.subject, digest: digest.text, note: deliveryNote() } };
  },
});

export const runAutomations = authedAction({
  minRole: "admin",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const report = await runDaily();
    return {
      data: report,
      activity: {
        verb: "automation.run",
        entityType: "organization",
        entityId: ctx.org.id,
        entityLabel: ctx.org.name,
        summary: `${ctx.member.displayName} ran the daily automations through their assistant`,
      },
    };
  },
});
