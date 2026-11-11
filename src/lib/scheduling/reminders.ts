import type { Term } from "./terms";
import { addDays, daysBetween, type IsoDay } from "./time";

/**
 * When to ask a member for their new class schedule. Pure.
 *
 * The window opens three days before a term starts and closes two weeks in:
 * by then schedules have settled and anyone still missing needs a person,
 * not a third email. Inside the window a member who has not confirmed gets at
 * most two reminders, one per phase, never on consecutive days.
 */

export const REMINDER_KIND = "schedule_reminder";
/** An admin pressing "Remind" — at most one per member per day. */
export const MANUAL_REMINDER_KIND = "schedule_reminder_manual";

export const REMINDER_LEAD_DAYS = 3;
export const REMINDER_WINDOW_DAYS = 14;
const SECOND_PHASE_FROM_DAY = 6;
const MIN_GAP_DAYS = 3;

export type ReminderPhase = 1 | 2;

/** Terms whose reminder window contains `today`. Terms never overlap, so at most two. */
export function termsInReminderWindow(terms: readonly Term[], today: IsoDay): Term[] {
  return terms.filter(
    (t) => today >= addDays(t.start, -REMINDER_LEAD_DAYS) && today < addDays(t.start, REMINDER_WINDOW_DAYS) && today <= t.end
  );
}

export function reminderKey(termKey: string, memberId: string, phase: ReminderPhase): string {
  return `${termKey}:${memberId}:${phase}`;
}

export function manualReminderKey(termKey: string, memberId: string, today: IsoDay): string {
  return `${termKey}:${memberId}:${today}`;
}

export function scheduleReminderDue(args: {
  term: Pick<Term, "start" | "end">;
  today: IsoDay;
  confirmed: boolean;
  /** Club-time day of the last reminder for this term, automatic or manual. */
  lastReminderDay?: IsoDay | null;
}): ReminderPhase | null {
  if (args.confirmed) return null;
  if (termsInReminderWindow([{ key: "", name: "", ...args.term }], args.today).length === 0) return null;
  if (args.lastReminderDay && daysBetween(args.lastReminderDay, args.today) < MIN_GAP_DAYS) return null;
  return daysBetween(args.term.start, args.today) >= SECOND_PHASE_FROM_DAY ? 2 : 1;
}
