import type { AgendaItemKind, AttendanceStatus, MeetingKind, MeetingStatus } from "@/db/schema";

/** Display names for the meeting enums — one place, so lists and dialogs agree. */

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  general: "General",
  ic: "Investment committee",
  sourcing: "Sourcing",
  training: "Training",
  social: "Social",
  other: "Other",
};

export const MEETING_STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const MEETING_STATUS_BADGE: Record<MeetingStatus, "neutral" | "warning" | "success" | "outline"> = {
  scheduled: "neutral",
  in_progress: "warning",
  completed: "success",
  cancelled: "outline",
};

export const AGENDA_KIND_LABEL: Record<AgendaItemKind, string> = {
  application_review: "Application review",
  pitch: "Pitch",
  ic_vote: "Vote",
  update: "Update",
  training: "Training",
  admin: "Admin",
  other: "Discussion",
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  remote: "Remote",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
};

/** Present, remote and late all count as having attended. */
export const ATTENDED: readonly AttendanceStatus[] = ["present", "remote", "late"];

/** Value for an `<input type="datetime-local">` in the browser's own timezone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
