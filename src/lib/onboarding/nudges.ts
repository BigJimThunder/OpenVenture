import type { Stage } from "./progress";

/**
 * When the daily job speaks up about onboarding. Pure: the job loads the
 * rows, this decides, `sendOnce` makes each decision stick.
 */

const DAY = 86_400_000;

/** A never-signed-in invite gets one reminder, this long after the invite. */
export const INVITE_REMINDER_DAYS = 3;
/** Members hear about a due date this many days ahead… */
export const DUE_SOON_DAYS = 3;
/** …and never more often than this. */
export const NUDGE_GAP_DAYS = 3;
/** The inviting admin is told once when someone is this far past due. */
export const ESCALATE_OVERDUE_DAYS = 7;
/** Completions older than this are history, not news. */
export const COMPLETION_NEWS_DAYS = 7;

export type NudgeSubject = {
  memberId: string;
  stage: Stage;
  invitedAt: Date;
  dueAt: Date | null;
  /** When onboarding was finished, if it has been. */
  completedAt: Date | null;
  /** The last due-date reminder this member was sent, if any. */
  lastNudgeAt: Date | null;
};

export type MemberNudge = {
  kind: "invite_reminder" | "due_soon" | "overdue";
  /** notification_log key. */
  key: string;
};

export function memberNudge(s: NudgeSubject, now: Date, today: string): MemberNudge | null {
  if (s.stage === "complete") return null;
  if (s.stage === "invited") {
    // Once, ever: the key carries no date.
    return now.getTime() - s.invitedAt.getTime() >= INVITE_REMINDER_DAYS * DAY
      ? { kind: "invite_reminder", key: `invite:${s.memberId}` }
      : null;
  }
  if (!s.dueAt) return null;
  if (s.lastNudgeAt && now.getTime() - s.lastNudgeAt.getTime() < NUDGE_GAP_DAYS * DAY) return null;
  const untilDue = s.dueAt.getTime() - now.getTime();
  if (untilDue < 0) return { kind: "overdue", key: `due:${s.memberId}:${today}` };
  if (untilDue <= DUE_SOON_DAYS * DAY) return { kind: "due_soon", key: `due:${s.memberId}:${today}` };
  return null;
}

export type AdminNotice = { kind: "completed" | "overdue"; key: string };

/** What the inviting admin should hear about this member, at most once each. */
export function adminNotice(s: NudgeSubject, now: Date): AdminNotice | null {
  if (s.stage === "complete") {
    return s.completedAt && now.getTime() - s.completedAt.getTime() <= COMPLETION_NEWS_DAYS * DAY
      ? { kind: "completed", key: `completed:${s.memberId}` }
      : null;
  }
  if (s.dueAt && now.getTime() - s.dueAt.getTime() >= ESCALATE_OVERDUE_DAYS * DAY) {
    return { kind: "overdue", key: `overdue:${s.memberId}` };
  }
  return null;
}
