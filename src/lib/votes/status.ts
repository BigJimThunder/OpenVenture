import type { VoteRoundStatus } from "@/db/schema";

/**
 * How a round should BEHAVE right now. A daily job flips `status` to closed
 * once `closesAt` passes, but until it runs the row still says "open" — the
 * UI and actions must not offer a ballot in that window. Everything that
 * branches on "is voting open?" goes through here.
 */
export type RoundTiming = { status: VoteRoundStatus; closesAt: Date | string | null };

export function effectiveRoundStatus(round: RoundTiming, now: Date = new Date()): VoteRoundStatus {
  if (round.status === "open" && round.closesAt && new Date(round.closesAt).getTime() <= now.getTime()) {
    return "closed";
  }
  return round.status;
}

export function isVotingOpen(round: RoundTiming, now: Date = new Date()): boolean {
  return effectiveRoundStatus(round, now) === "open";
}

/** Ballots exist but nobody has seen them yet: open or closed, not revealed. */
export function isAwaitingReveal(round: RoundTiming, now: Date = new Date()): boolean {
  const s = effectiveRoundStatus(round, now);
  return s === "open" || s === "closed";
}
