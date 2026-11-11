import type { MemberRole } from "@/db/schema";

/**
 * What each role may do, in one place. This mirrors the `minRole` on the
 * matching server actions — it does NOT replace them. Server actions stay the
 * only enforcement; this exists so the UI can hide or disable a control
 * instead of offering it and answering with a "no permission" toast.
 *
 * When you change a `minRole` in src/lib/actions/*, change it here too.
 */
const ROLE_RANK: Record<MemberRole, number> = { read_only: 0, analyst: 1, partner: 2, admin: 3 };

export const CAPABILITIES = {
  /** Anything that writes: notes, scores, memos, coffee chats, stage moves. */
  contribute: "analyst",
  /** Cast a ballot in an IC vote. */
  vote: "analyst",
  /** Open, close and reveal votes; record the club's decision. */
  runVotes: "partner",
  /** Write the LP letter commentary, mark grants cashed / reconciled. */
  partnerWork: "partner",
  /** Approve and issue money, create pools. */
  manageMoney: "admin",
  /** Invite, promote and offboard members. */
  manageMembers: "admin",
  /** Club settings, stages, lookups, automations, exports. */
  manageClub: "admin",
} as const satisfies Record<string, MemberRole>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: MemberRole, capability: Capability): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[CAPABILITIES[capability]];
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: "Admin",
  partner: "Partner",
  analyst: "Analyst",
  read_only: "Read-only",
};

/** One-line explanation used in tooltips on disabled controls. */
export function whoCan(capability: Capability): string {
  const min = CAPABILITIES[capability];
  if (min === "admin") return "Admins only";
  if (min === "partner") return "Partners and admins only";
  return "Read-only members can't make changes";
}
