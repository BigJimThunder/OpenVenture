import type { VoteDecision, VoteRoundStatus } from "@/db/schema";

/**
 * The blind-vote invariant, as pure logic. This is the ONLY place that
 * decides what vote data a viewer may see; the DB accessor
 * (getVoteRoundResults) must pass everything through here and return its
 * output verbatim. Never ship unrevealed votes to the client and hide them
 * in CSS.
 *
 * Rules:
 * - Before reveal, NOBODY sees ballots — chair and admins included. A voter
 *   sees only their own submitted ballot (so the form can re-render it).
 * - Before reveal, only participation counts are visible.
 * - After reveal, everything is visible to eligible viewers.
 */

export type BallotRow = {
  memberId: string;
  memberName: string;
  decision: VoteDecision | null;
  conviction: number | null;
  suggestedAmount: string | null;
  rationale: string | null;
  submittedAt: Date | string;
};

export type EligibilityRow = {
  memberId: string;
  memberName: string;
  isRecused: boolean;
};

export type RoundMeta = {
  status: VoteRoundStatus;
  revealedAt: Date | string | null;
};

export type RedactedResults = {
  revealed: boolean;
  submittedCount: number;
  eligibleCount: number;
  recusedCount: number;
  /** The viewer is recused from this round — show a notice, never a ballot form. */
  viewerIsRecused: boolean;
  /** The viewer appears in the round's eligibility list (recused or not). */
  viewerIsEligible: boolean;
  /** Only present pre-reveal: the viewer's own ballot, if any. */
  myBallot: BallotRow | null;
  /** Empty until revealed. */
  ballots: BallotRow[];
  /** Members who haven't voted — only exposed AFTER reveal (pre-reveal it
   *  would leak who's holding out and invite pressure). */
  missing: string[];
};

export function redactVoteResults(
  round: RoundMeta,
  ballots: BallotRow[],
  eligibility: EligibilityRow[],
  viewerMemberId: string
): RedactedResults {
  const eligible = eligibility.filter((e) => !e.isRecused);
  const recused = eligibility.filter((e) => e.isRecused);
  const submitted = ballots.filter((b) =>
    eligible.some((e) => e.memberId === b.memberId)
  );
  const revealed = round.status === "revealed" && round.revealedAt != null;

  const base = {
    revealed,
    submittedCount: submitted.length,
    eligibleCount: eligible.length,
    recusedCount: recused.length,
    viewerIsRecused: recused.some((e) => e.memberId === viewerMemberId),
    viewerIsEligible: eligibility.some((e) => e.memberId === viewerMemberId),
  };

  if (!revealed) {
    return {
      ...base,
      myBallot: submitted.find((b) => b.memberId === viewerMemberId) ?? null,
      ballots: [],
      missing: [],
    };
  }

  const votedIds = new Set(submitted.map((b) => b.memberId));
  return {
    ...base,
    myBallot: submitted.find((b) => b.memberId === viewerMemberId) ?? null,
    ballots: [...submitted].sort((a, b) => (a.conviction ?? 0) - (b.conviction ?? 0)),
    missing: eligible.filter((e) => !votedIds.has(e.memberId)).map((e) => e.memberName),
  };
}
