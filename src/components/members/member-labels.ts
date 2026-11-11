import type { MemberRole } from "@/db/schema";

export const ROLE_BADGE: Record<MemberRole, "default" | "info" | "neutral" | "outline"> = {
  admin: "default",
  partner: "info",
  analyst: "neutral",
  read_only: "outline",
};

/** What each role can do, in one line — shown wherever a role is chosen. */
export const ROLE_HINT: Record<MemberRole, string> = {
  admin: "Runs the club: members, settings, money.",
  partner: "Everything an analyst does, plus opening and revealing votes.",
  analyst: "Screens, takes coffee chats, writes memos, votes.",
  read_only: "Can look at everything, can't change anything.",
};

export function classOf(classYear: number | null): string | null {
  return classYear ? `’${String(classYear).slice(2)}` : null;
}
