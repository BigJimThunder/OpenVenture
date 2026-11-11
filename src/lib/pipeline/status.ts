import type { ApplicationStatus, StageKind } from "@/db/schema";

/**
 * What a stage move does to an application's status and decision fields —
 * pure, so the reopen rule is testable without a database.
 *
 * The stage's KIND decides the status, never the other way round: an
 * application sitting in an active stage must be `open` or the board and
 * inbox (which both filter on status) lose it. That is the "reopened
 * applications vanish" bug this module exists to prevent.
 */
export type StatusPatch = {
  status: ApplicationStatus;
  /** set → stamp decidedAt; clear → null it; keep → leave as is. */
  decidedAt: "set" | "clear" | "keep";
  /** Null out declineReason / declineNote. */
  clearDecline: boolean;
  /** A closed application is going back into play. */
  reopened: boolean;
};

const CLOSED: readonly ApplicationStatus[] = ["funded", "declined", "withdrawn"];

export function statusPatchForMove(current: ApplicationStatus, toKind: StageKind): StatusPatch {
  if (toKind === "lost") {
    return { status: "declined", decidedAt: "set", clearDecline: false, reopened: false };
  }
  if (toKind === "won") {
    return { status: "funded", decidedAt: "set", clearDecline: true, reopened: false };
  }
  const wasClosed = CLOSED.includes(current);
  return {
    status: toKind === "parked" ? "on_hold" : "open",
    decidedAt: wasClosed ? "clear" : "keep",
    clearDecline: wasClosed,
    reopened: wasClosed,
  };
}
