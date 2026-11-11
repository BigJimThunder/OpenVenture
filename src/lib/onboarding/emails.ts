import type { MemberRole, organization } from "@/db/schema";
import { appUrl, emailLayout, escapeHtml } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";

/**
 * Every onboarding email: the invite, its reminder, due-date nudges and the
 * note to the admin who invited someone. All built on the one email layout.
 */

type Org = Pick<typeof organization.$inferSelect, "name" | "schoolName" | "settings">;
type Email = { to: string; subject: string; html: string; replyTo?: string };

const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a";
const p = (text: string) => `<p style="${P}">${escapeHtml(text)}</p>`;
const ROLE_PHRASE: Record<MemberRole, string> = {
  admin: "an admin",
  partner: "a partner",
  analyst: "an analyst",
  read_only: "a read-only member",
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

function steps(lines: string[]): string {
  return `<ol style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#27272a">${lines
    .map((l) => `<li style="margin:0 0 4px">${escapeHtml(l)}</li>`)
    .join("")}</ol>`;
}

/** One sentence on what the club is, in the club's own words when it has written them. */
function aboutClub(org: Org): string {
  const mission = orgSettings(org).reports.mission.trim();
  if (mission) return mission;
  return `${org.name} is a student-run fund${org.schoolName ? ` at ${org.schoolName}` : ""}. We read applications from student founders, meet them, write a short memo and vote on a grant.`;
}

export type OnboardingPlan = { requiredCount: number; minutes: number; dueAt: Date | null };

function dueLine(dueAt: Date | null): string {
  if (!dueAt) return "";
  return ` Please finish by ${dueAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.`;
}

export function inviteEmail(opts: {
  org: Org;
  inviterName: string;
  inviterEmail?: string;
  to: { email: string; displayName: string; role: MemberRole };
  plan: OnboardingPlan | null;
  reminder?: boolean;
}): Email {
  const { org, to, plan } = opts;
  const next = [
    "Sign in with this email address. There is no password; we email you a link and a six-digit code.",
    "Confirm your name, class year and major.",
    ...(plan && plan.requiredCount > 0
      ? [
          `Work through ${plural(plan.requiredCount, "short item")} the club asks every new member to do${
            plan.minutes > 0 ? ` (about ${plural(plan.minutes, "minute")})` : ""
          }. You can stop and pick up where you left off.`,
        ]
      : []),
    "You're in. We show you what to do first.",
  ];
  return {
    to: to.email,
    subject: opts.reminder
      ? `Reminder: your invite to ${org.name}`
      : `${opts.inviterName} invited you to ${org.name}`,
    ...(opts.inviterEmail ? { replyTo: opts.inviterEmail } : {}),
    html: emailLayout({
      orgName: org.name,
      heading: opts.reminder
        ? `Your invite to ${org.name} is still open`
        : `${firstName(to.displayName)}, welcome to ${org.name}`,
      bodyHtml:
        p(`${opts.inviterName} added you as ${ROLE_PHRASE[to.role]}. ${aboutClub(org)}`) +
        `<p style="${P};margin-bottom:6px;font-weight:600">The next five minutes</p>` +
        steps(next) +
        (plan?.dueAt ? p(dueLine(plan.dueAt).trim()) : ""),
      cta: { label: "Get started", url: appUrl("/login") },
      footer: `Sent because ${opts.inviterName} invited ${to.email} to ${org.name}. If that's a mistake, ignore this email and nothing happens.`,
    }),
  };
}

export function nudgeEmail(opts: {
  org: Org;
  to: { email: string; displayName: string };
  kind: "due_soon" | "overdue" | "manual";
  /** Admin who pressed "Send a nudge", for manual ones. */
  fromName?: string;
  remaining: number;
  nextTitle: string | null;
  minutesLeft: number;
  dueAt: Date | null;
}): Email {
  const { org, to, remaining } = opts;
  const left =
    remaining > 0
      ? `You have ${plural(remaining, "required item")} left${opts.minutesLeft > 0 ? `, about ${plural(opts.minutesLeft, "minute")}` : ""}.${
          opts.nextTitle ? ` Next up: ${opts.nextTitle}.` : ""
        }`
      : "You still need to confirm your details. It takes a minute.";
  const lead =
    opts.kind === "overdue"
      ? `Your onboarding for ${org.name} is past its due date.`
      : opts.kind === "due_soon"
        ? `Your onboarding for ${org.name} is due soon.${dueLine(opts.dueAt)}`
        : `${opts.fromName ?? "An admin"} asked us to remind you about your onboarding for ${org.name}.`;
  return {
    to: to.email,
    subject:
      opts.kind === "overdue"
        ? `Onboarding overdue: ${plural(remaining, "item")} left`
        : `Finish your ${org.name} onboarding`,
    html: emailLayout({
      orgName: org.name,
      heading: `${firstName(to.displayName)}, pick up where you left off`,
      bodyHtml: p(lead) + p(`${left} Until it's done the rest of the app stays closed to you.`),
      cta: { label: "Continue onboarding", url: appUrl("/start") },
      footer: `You're getting this because you were invited to ${org.name} and haven't finished onboarding.`,
    }),
  };
}

export type AdminNoticeRow = { name: string; kind: "completed" | "overdue"; detail: string };

export function adminNoticeEmail(opts: {
  org: Org;
  to: { email: string; displayName: string };
  rows: AdminNoticeRow[];
}): Email {
  const done = opts.rows.filter((r) => r.kind === "completed");
  const late = opts.rows.filter((r) => r.kind === "overdue");
  const list = (rows: AdminNoticeRow[]) =>
    `<ul style="margin:0 0 14px;padding-left:20px;font-size:15px;line-height:1.6;color:#27272a">${rows
      .map((r) => `<li><strong>${escapeHtml(r.name)}</strong> — ${escapeHtml(r.detail)}</li>`)
      .join("")}</ul>`;
  const subject =
    late.length === 0
      ? done.length === 1
        ? `${done[0].name} finished onboarding`
        : `${done.length} members finished onboarding`
      : late.length === 1
        ? `${late[0].name} is a week past due on onboarding`
        : `${late.length} members are a week past due on onboarding`;
  return {
    to: opts.to.email,
    subject,
    html: emailLayout({
      orgName: opts.org.name,
      heading: subject,
      bodyHtml:
        (done.length > 0 ? p("Finished every required item:") + list(done) : "") +
        (late.length > 0
          ? p("More than a week past the due date. Reminders have gone out; a message from you usually works better.") +
            list(late)
          : ""),
      cta: { label: "Open the onboarding board", url: appUrl("/onboarding") },
      footer: `You're getting this because you invited these members to ${opts.org.name}, or you're an admin.`,
    }),
  };
}
