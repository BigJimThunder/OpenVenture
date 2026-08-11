import type { StageKind } from "@/db/schema";

/**
 * Pure stage-gate checks — kept free of DB imports so they can be unit-tested
 * in isolation (same shape as grants/budget.ts and votes/redact.ts).
 *
 * Semantics: a stage's flags describe work done DURING that stage, enforced
 * when an application advances PAST it. Entry-gating the flagged stage itself
 * would deadlock — you could never enter Decision to run the vote Decision
 * requires. Backward moves and moves into lost/parked stages are exempt
 * (the decline path has its own decline-reason gate).
 */

export type GateStage = {
  id: string;
  name: string;
  /** numeric(12,6) comes back from Drizzle as a string. */
  position: string;
  kind: StageKind;
  minAttendees: number | null;
  requiresMemo: boolean;
  requiresVote: boolean;
};

export type GateEvidence = {
  /** A memo for the application with status circulated or decided. */
  hasCirculatedMemo: boolean;
  /** A vote round for the application with status revealed. */
  hasRevealedVote: boolean;
  /** Max over the application's coffee chats of attendees with a recorded verdict. */
  maxVerdictAttendees: number;
};

export type GateResult = { ok: true } | { ok: false; message: string };

export function checkStageGates(
  fromStage: GateStage,
  toStage: GateStage,
  activeStages: GateStage[],
  evidence: GateEvidence
): GateResult {
  // Decline/park paths are exempt — the decline-reason gate covers lost moves.
  if (toStage.kind === "lost" || toStage.kind === "parked") return { ok: true };

  const fromPos = Number(fromStage.position);
  const toPos = Number(toStage.position);
  if (toPos <= fromPos) return { ok: true };

  // Every active stage being advanced past — including the one being left,
  // and any skipped in between — must have its gate satisfied.
  const gated = activeStages
    .filter((s) => s.kind === "active")
    .filter((s) => {
      const pos = Number(s.position);
      return pos >= fromPos && pos < toPos;
    })
    .sort((a, b) => Number(a.position) - Number(b.position));

  for (const stage of gated) {
    if (stage.minAttendees != null && evidence.maxVerdictAttendees < stage.minAttendees) {
      const n = stage.minAttendees;
      return {
        ok: false,
        message: `A coffee chat with ${n} recorded verdict${n === 1 ? "" : "s"} is needed before advancing past ${stage.name}`,
      };
    }
    if (stage.requiresMemo && !evidence.hasCirculatedMemo) {
      return {
        ok: false,
        message: `Circulate a memo before advancing past ${stage.name}`,
      };
    }
    if (stage.requiresVote && !evidence.hasRevealedVote) {
      return {
        ok: false,
        message: `Reveal an IC vote before advancing past ${stage.name}`,
      };
    }
  }

  return { ok: true };
}
