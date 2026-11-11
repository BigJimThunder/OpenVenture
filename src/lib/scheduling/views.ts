import type { MemberRole } from "@/db/schema";
import type { Combination, CommitmentKind, GroupTimes, Heatmap, Presence, TeamTimes } from "./engine";
import { zonedParts, type IsoDay } from "./time";

/**
 * What the finder sends to the browser. The engine works with full
 * commitments, class names included; these shapes are what a given viewer is
 * allowed to see. Pure.
 */

export type FinderMember = { id: string; name: string; role: MemberRole };

export type ConflictView = {
  kind: CommitmentKind;
  /** Null when the viewer may only know "busy". */
  label: string | null;
  startMinute: number;
  endMinute: number;
};

export type PersonView = {
  memberId: string;
  state: Presence["state"];
  soft: boolean;
  conflict: ConflictView | null;
};

export type Viewer = { memberId: string; isAdmin: boolean };

/**
 * A member's class and job labels are private to them and the club's admins.
 * Club meetings and coffee chats are on everyone's calendar already.
 */
export function viewPresence(presence: Presence, viewer: Viewer, timeZone: string): PersonView {
  const c = presence.conflict;
  const mayRead = c && (c.kind === "meeting" || c.kind === "coffee_chat" || viewer.isAdmin || viewer.memberId === presence.memberId);
  return {
    memberId: presence.memberId,
    state: presence.state,
    soft: presence.soft,
    conflict: c
      ? {
          kind: c.kind,
          label: mayRead ? c.label : null,
          startMinute: zonedParts(c.rawStart, timeZone).minute,
          endMinute: zonedParts(c.rawEnd - 1, timeZone).minute + 1,
        }
      : null,
  };
}

export type FinderMeta = {
  timeZone: string;
  /** "Eastern Time (EST)" */
  zone: string;
  orgName: string;
  members: FinderMember[];
  /** False until an admin sets up terms: nobody's schedule can be trusted yet. */
  hasTerms: boolean;
  fromDay: IsoDay;
  toDay: IsoDay;
};

export type GroupResult = FinderMeta & GroupTimes & { heatmap: Heatmap };

export type TeamResult = FinderMeta & TeamTimes & { ownerId: string | null; companyName: string | null };

export type AtResult = FinderMeta & {
  day: IsoDay;
  startMinute: number;
  durationMinutes: number;
  /** ISO instant. */
  start: string;
  people: PersonView[];
  combinations: Combination[];
  availableCount: number;
  ownerId: string | null;
};
