import { eq } from "drizzle-orm";
import { db } from "@/db";
import { application, company, member, organization } from "@/db/schema";
import { orgSettings } from "@/lib/org-settings";
import { emailLayout, sendEmailSafe, sendOnce, textToHtml } from "@/lib/notify";
import { formatMoney } from "@/lib/utils";

/**
 * The three moments a founder hears from the club: we received your
 * application, we're not funding it, we are funding it.
 *
 * Each kind is switched on per club (Settings → Founder emails). "Received"
 * defaults on; "declined" and "funded" default off because they carry a
 * decision and a club should opt in to automating those. Every send is
 * deduped per application, so re-running a job or re-saving a stage can never
 * email a founder twice.
 *
 * Call from a server action via `after(() => sendFounderEmail(...))`.
 */
export type FounderEmailKind = "received" | "declined" | "funded";

export type FounderEmailOptions = {
  /**
   * Member-reviewed text that replaces the default body (plain text, blank
   * lines between paragraphs). Used for a personalised decline letter.
   */
  customBody?: string;
  /** Awarded amount, for the funded email. */
  amount?: string | number | null;
  /** Send even if the club has this kind switched off (explicit member action). */
  force?: boolean;
};

export function defaultFounderEmail(
  kind: FounderEmailKind,
  ctx: { orgName: string; companyName: string; firstName: string; amount?: string | number | null }
): { subject: string; body: string } {
  const hi = ctx.firstName ? `Hi ${ctx.firstName},` : "Hi,";
  if (kind === "received") {
    return {
      subject: `We received your application — ${ctx.orgName}`,
      body: [
        hi,
        `Thanks for applying to ${ctx.orgName} with ${ctx.companyName}. Your application is in, and a member of the club will read it this week.`,
        "Here is what happens next: we screen every application, and if it looks like a fit two members will reach out to set up a short coffee chat. After that, promising companies pitch to the full club and we vote.",
        "You don't need to do anything right now. If something material changes — you launch, sign a customer, or no longer need the grant — just reply to this email.",
        `— ${ctx.orgName}`,
      ].join("\n\n"),
    };
  }
  if (kind === "declined") {
    return {
      subject: `An update on your ${ctx.orgName} application`,
      body: [
        hi,
        `Thank you for applying to ${ctx.orgName} with ${ctx.companyName}, and for the time you put into it. After discussing it as a club, we've decided not to fund this application.`,
        "Our budget is small and we say no to far more companies than we'd like to, so please don't read this as a verdict on the idea. You're welcome to apply again when things have moved forward.",
        "If it would help to hear what we talked about, reply to this email and one of us will follow up.",
        `— ${ctx.orgName}`,
      ].join("\n\n"),
    };
  }
  const amount = ctx.amount != null ? formatMoney(ctx.amount) : null;
  return {
    subject: `${ctx.companyName} — your ${ctx.orgName} grant`,
    body: [
      hi,
      `Good news: ${ctx.orgName} has voted to fund ${ctx.companyName}${amount ? ` with a grant of ${amount}` : ""}. This is a grant, not an investment — we take no equity and there is nothing to pay back.`,
      "One of our officers will be in touch shortly to sort out how you'd like to be paid. We'll ask you to keep receipts for what the grant covers, and we'll check in once a term to see how things are going.",
      "Congratulations, and thank you for building this.",
      `— ${ctx.orgName}`,
    ].join("\n\n"),
  };
}

/** Returns true if an email was actually sent. Never throws. */
export async function sendFounderEmail(
  kind: FounderEmailKind,
  applicationId: string,
  opts: FounderEmailOptions = {}
): Promise<boolean> {
  try {
    const [row] = await db
      .select({
        app: application,
        companyName: company.name,
        org: organization,
        ownerEmail: member.email,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(organization, eq(application.orgId, organization.id))
      .leftJoin(member, eq(application.ownerMemberId, member.id))
      .where(eq(application.id, applicationId))
      .limit(1);
    if (!row?.app.applicantEmail) return false;

    const settings = orgSettings(row.org);
    if (!opts.force && !settings.founderEmails[kind]) return false;

    const firstName = (row.app.applicantName ?? "").trim().split(/\s+/)[0] ?? "";
    const fallback = defaultFounderEmail(kind, {
      orgName: row.org.name,
      companyName: row.companyName,
      firstName,
      amount: opts.amount,
    });
    const body = opts.customBody?.trim() || fallback.body;
    const to = row.app.applicantEmail;

    return await sendOnce(
      {
        orgId: row.org.id,
        kind: `founder_${kind}`,
        key: row.app.id,
        recipient: to,
        summary: `${fallback.subject} → ${row.companyName}`,
      },
      () =>
        sendEmailSafe({
          to,
          subject: fallback.subject,
          replyTo: settings.founderEmails.replyTo || row.ownerEmail || undefined,
          html: emailLayout({
            orgName: row.org.name,
            heading: fallback.subject.split(" — ")[0],
            bodyHtml: textToHtml(body),
            footer: `You're receiving this because you applied to ${row.org.name}.`,
          }),
        })
    );
  } catch (e) {
    console.error(`[founder-email] ${kind} for ${applicationId} failed`, e);
    return false;
  }
}
