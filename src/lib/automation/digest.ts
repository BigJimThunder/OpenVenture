import { escapeHtml } from "@/lib/notify";
import { formatRef } from "@/lib/refs";
import { daysBetween } from "./rules";

/**
 * Email bodies for the scheduled jobs. Pure string building: the jobs load
 * the rows, these decide what is worth saying and how it reads. Everything
 * returned here is trusted HTML for `emailLayout`, so every dynamic value is
 * escaped on the way in.
 */

export type EmailRow = {
  title: string;
  /** Quiet second line: stage, age, due date. */
  meta?: string;
  href?: string;
  /** Short flag on the right, e.g. "3 days over". */
  flag?: string;
};

const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a";

export function paragraph(text: string): string {
  return `<p style="${P}">${escapeHtml(text)}</p>`;
}

export function sectionHeading(text: string): string {
  return `<p style="margin:20px 0 6px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#71717a">${escapeHtml(text)}</p>`;
}

export function rowList(rows: EmailRow[]): string {
  const items = rows
    .map((r) => {
      const title = r.href
        ? `<a href="${escapeHtml(r.href)}" style="color:#18181b;text-decoration:none;font-weight:600">${escapeHtml(r.title)}</a>`
        : `<span style="color:#18181b;font-weight:600">${escapeHtml(r.title)}</span>`;
      const flag = r.flag
        ? ` <span style="color:#b45309;font-size:12px;font-weight:600;white-space:nowrap">· ${escapeHtml(r.flag)}</span>`
        : "";
      const meta = r.meta
        ? `<div style="font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(r.meta)}</div>`
        : "";
      return `<tr><td style="padding:9px 0;border-top:1px solid #ececf0;font-size:14px;line-height:1.45">${title}${flag}${meta}</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px">${items}</table>`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatWhen(date: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(date);
  }
}

// ——— Weekly digest ———

export type DigestApplication = {
  id: string;
  ref: number;
  companyName: string;
  stageName: string;
  enteredStageAt: Date;
  slaDays: number | null;
  nextStep: string | null;
  nextStepDue: Date | null;
};

export type DigestInput = {
  firstName: string;
  applications: DigestApplication[];
  /** Open rounds this member is eligible for. Never says whether they voted. */
  votes: { title: string; memoId: string | null; closesAt: Date | null }[];
  actionItems: { ref: number; title: string; dueAt: Date | null }[];
  nextMeeting: { id: string; title: string; scheduledAt: Date } | null;
  club: {
    newApplications: number;
    /** Preformatted; null when the club has no pool yet. */
    budgetRemaining: string | null;
  };
};

/**
 * A digest is worth sending when something needs this member, or the club
 * moved this week. A member with no work and a quiet club gets nothing.
 */
export function digestHasContent(input: DigestInput): boolean {
  return (
    input.applications.length > 0 ||
    input.votes.length > 0 ||
    input.actionItems.length > 0 ||
    input.nextMeeting != null ||
    input.club.newApplications > 0
  );
}

export function applicationRow(a: DigestApplication, now: Date, url: (path: string) => string): EmailRow {
  const days = daysBetween(a.enteredStageAt, now);
  const over = a.slaDays ? days - a.slaDays : 0;
  const stepOverdue = a.nextStepDue != null && a.nextStepDue.getTime() < now.getTime();
  const step = a.nextStep
    ? ` · Next: ${a.nextStep}${stepOverdue ? " (overdue)" : ""}`
    : " · No next step set";
  return {
    title: `${formatRef("application", a.ref)} ${a.companyName}`,
    meta: `${a.stageName}, ${plural(days, "day")}${step}`,
    href: url(`/pipeline/${a.id}`),
    flag: over > 0 ? `${plural(over, "day")} over` : undefined,
  };
}

export function renderDigest(
  input: DigestInput,
  opts: { now: Date; timeZone: string; url: (path: string) => string }
): { subject: string; bodyHtml: string } {
  const { now, timeZone, url } = opts;
  const parts: string[] = [];
  const needs: string[] = [];

  if (input.votes.length) needs.push(plural(input.votes.length, "open vote"));
  if (input.applications.length) needs.push(plural(input.applications.length, "application"));
  if (input.actionItems.length) needs.push(plural(input.actionItems.length, "action item"));

  parts.push(
    paragraph(
      `${input.firstName ? `Hi ${input.firstName}. ` : ""}${
        needs.length
          ? `Here is what needs you this week: ${needs.join(", ")}.`
          : "Nothing is waiting on you this week. Here is where the club stands."
      }`
    )
  );

  if (input.votes.length) {
    parts.push(sectionHeading("Votes open"));
    parts.push(
      rowList(
        input.votes.map((v) => ({
          title: v.title,
          meta: `${
            v.closesAt ? `Closes ${formatWhen(v.closesAt, timeZone)}. ` : ""
          }If you haven't voted yet, it takes two minutes.`,
          href: url(v.memoId ? `/memos/${v.memoId}/vote` : "/memos"),
        }))
      )
    );
  }

  if (input.applications.length) {
    parts.push(sectionHeading("Your applications"));
    parts.push(rowList(input.applications.map((a) => applicationRow(a, now, url))));
  }

  if (input.actionItems.length) {
    parts.push(sectionHeading("Your action items"));
    parts.push(
      rowList(
        input.actionItems.map((t) => ({
          title: `${formatRef("actionItem", t.ref)} ${t.title}`,
          meta: t.dueAt ? `Due ${formatWhen(t.dueAt, timeZone)}` : "No due date",
          href: url("/my-work"),
          flag: t.dueAt && t.dueAt.getTime() < now.getTime() ? "overdue" : undefined,
        }))
      )
    );
  }

  if (input.nextMeeting) {
    parts.push(sectionHeading("Next meeting"));
    parts.push(
      rowList([
        {
          title: input.nextMeeting.title,
          meta: formatWhen(input.nextMeeting.scheduledAt, timeZone),
          href: url(`/meetings/${input.nextMeeting.id}`),
        },
      ])
    );
  }

  parts.push(sectionHeading("The club this week"));
  parts.push(
    paragraph(
      `${plural(input.club.newApplications, "new application")} in the last seven days.${
        input.club.budgetRemaining ? ` ${input.club.budgetRemaining} left in this year's pool.` : ""
      }`
    )
  );

  return {
    subject: needs.length ? `This week: ${needs.join(", ")}` : "This week at the club",
    bodyHtml: parts.join(""),
  };
}
