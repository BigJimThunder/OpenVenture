import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { availabilityConfirmation, organization } from "@/db/schema";
import { appUrl, emailLayout, escapeHtml, sendEmailSafe, sendOnce } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { getLastReminders } from "@/lib/queries/availability";
import {
  MANUAL_REMINDER_KIND,
  manualReminderKey,
  REMINDER_KIND,
  reminderKey,
  scheduleReminderDue,
  termsInReminderWindow,
} from "@/lib/scheduling/reminders";
import type { Term } from "@/lib/scheduling/terms";
import { formatDayShort, zonedParts } from "@/lib/scheduling/time";
import type { JobSummary, Roster } from "./jobs";

type Org = typeof organization.$inferSelect;

const P = "margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a";
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Where the reminder sends people: their schedule, on the right term. */
export function scheduleUrl(termKey: string): string {
  return appUrl(`/schedule?term=${encodeURIComponent(termKey)}`);
}

export function scheduleReminderEmail(opts: {
  org: Pick<Org, "name">;
  to: { email: string; displayName: string };
  term: Term;
  /** The second ask is shorter. */
  second?: boolean;
  /** Set when an admin pressed "Remind" rather than the daily job. */
  fromName?: string;
}): { to: string; subject: string; html: string } {
  const { org, to, term } = opts;
  const lead = opts.fromName
    ? `${opts.fromName} asked us to remind you: we don't have your class schedule for ${term.name} yet.`
    : opts.second
      ? `We still don't have your class schedule for ${term.name}.`
      : `${term.name} runs ${formatDayShort(term.start)} to ${formatDayShort(term.end)}, and we need your class schedule for it.`;
  const body = [
    `<p style="${P}">Hi ${escapeHtml(firstName(to.displayName))},</p>`,
    `<p style="${P}">${escapeHtml(lead)}</p>`,
    `<p style="${P}">It takes about two minutes: paste your classes, upload your calendar file, or copy last term and fix what changed. Once it is in, meetings and coffee chats get scheduled around it without a group chat asking when everyone is free.</p>`,
    `<p style="${P}">Only you and the club's admins can see what your classes are. Everyone else sees busy or free.</p>`,
  ].join("");
  return {
    to: to.email,
    subject: opts.second ? `Still needed: your ${term.name} schedule` : `Add your ${term.name} class schedule`,
    html: emailLayout({
      orgName: org.name,
      heading: `Your ${term.name} schedule`,
      bodyHtml: body,
      cta: { label: "Enter my schedule", url: scheduleUrl(term.key) },
      footer: `You're getting this because you're a member of ${org.name}. An admin can switch these emails off in Settings → Automations.`,
    }),
  };
}

/**
 * Start-of-term schedule reminders, once a day. From three days before a term
 * starts until two weeks in, each active member who has not confirmed a
 * schedule for it gets at most two emails (see src/lib/scheduling/reminders.ts
 * for the timing). Every send is claimed in notification_log first.
 */
export async function scheduleReminders(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const today = zonedParts(now, org.timezone).day;
  const terms = termsInReminderWindow(orgSettings(org).scheduling.terms, today);
  if (terms.length === 0) return { emails: 0, items: 0, note: "No term is starting" };

  let emails = 0;
  for (const term of terms) {
    const [confirmations, lastReminders] = await Promise.all([
      db
        .select({ memberId: availabilityConfirmation.memberId })
        .from(availabilityConfirmation)
        .where(and(eq(availabilityConfirmation.orgId, org.id), eq(availabilityConfirmation.termKey, term.key))),
      getLastReminders(org.id, term.key),
    ]);
    const confirmed = new Set(confirmations.map((c) => c.memberId));

    for (const m of roster.members) {
      const last = lastReminders.get(m.id);
      const phase = scheduleReminderDue({
        term,
        today,
        confirmed: confirmed.has(m.id),
        lastReminderDay: last ? zonedParts(last, org.timezone).day : null,
      });
      if (!phase) continue;
      const sent = await sendOnce(
        {
          orgId: org.id,
          kind: REMINDER_KIND,
          key: reminderKey(term.key, m.id, phase),
          recipient: m.email,
          summary: `${term.name} schedule, reminder ${phase} of 2`,
        },
        () =>
          sendEmailSafe({
            ...scheduleReminderEmail({ org, to: m, term, second: phase === 2 }),
            audience: { memberId: m.id, category: "reminders", prefs: m.emailPrefs },
          })
      );
      if (sent) emails++;
    }
  }
  return { emails, items: emails };
}

/**
 * An admin's "Remind" button: the same email, at most once per member per
 * club day however many times it is pressed. Returns whether it went out.
 */
export async function sendManualScheduleReminder(opts: {
  org: Org;
  to: { id: string; email: string; displayName: string };
  term: Term;
  fromName: string;
  now: Date;
}): Promise<boolean> {
  const today = zonedParts(opts.now, opts.org.timezone).day;
  return sendOnce(
    {
      orgId: opts.org.id,
      kind: MANUAL_REMINDER_KIND,
      key: manualReminderKey(opts.term.key, opts.to.id, today),
      recipient: opts.to.email,
      summary: `${opts.term.name} schedule, reminded by ${opts.fromName}`,
    },
    () => sendEmailSafe(scheduleReminderEmail({ org: opts.org, to: opts.to, term: opts.term, fromName: opts.fromName }))
  );
}
