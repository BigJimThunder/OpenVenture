import type { ApplicationStatus, GrantStatus, MemoStatus, VoteOutcome, VoteRoundStatus } from "@/db/schema";

/**
 * The one thing an application needs next, derived from where it is — so the
 * record page can lead with a single obvious action instead of making an
 * untrained member work out the process from a wall of cards.
 *
 * Pure: reads statuses only (never ballots), returns what to show.
 */
export type NextActionKind =
  | "score"
  | "coffee_chat"
  | "start_memo"
  | "finish_memo"
  | "open_vote"
  | "vote"
  | "reveal"
  | "decide"
  | "advance"
  | "propose_grant"
  | "grant_pending"
  | "grant_tracking"
  | "closed";

export type NextAction = { kind: NextActionKind; title: string; detail: string };

export type NextActionInput = {
  status: ApplicationStatus;
  stage: {
    name: string;
    minAttendees: number | null;
    requiresMemo: boolean;
    requiresVote: boolean;
  } | null;
  /** The next active stage in pipeline order, if any. */
  nextStageName: string | null;
  /** Latest non-archived memo. */
  memoStatus: MemoStatus | null;
  /** Latest vote round, with expiry already applied (see votes/status). */
  round: { status: VoteRoundStatus; outcome: VoteOutcome | null } | null;
  /** Most verdicts recorded on any one coffee chat. */
  maxVerdicts: number;
  hasCriteria: boolean;
  viewerHasScored: boolean;
  /** Status of the application's non-cancelled grant, if any. */
  grantStatus: GrantStatus | null;
};

export function nextAction(input: NextActionInput): NextAction {
  const { status, stage, round } = input;

  if (status === "funded") {
    if (!input.grantStatus) {
      return {
        kind: "propose_grant",
        title: "Propose the grant",
        detail: "This application is funded but has no grant yet. Propose one so the treasurer can approve it.",
      };
    }
    if (input.grantStatus === "proposed") {
      return {
        kind: "grant_pending",
        title: "Waiting on grant approval",
        detail: "An admin approves the grant against the pool's remaining budget, then issues the payment.",
      };
    }
    return {
      kind: "grant_tracking",
      title: "Grant in progress",
      detail: "Payment, receipts and check-ins are tracked on the grant.",
    };
  }
  if (status !== "open") {
    return {
      kind: "closed",
      title: status === "declined" ? "Declined" : status === "withdrawn" ? "Withdrawn" : "On hold",
      detail: "Nothing is due. Reopen it if the founder comes back with something new.",
    };
  }

  // A live vote outranks everything else on the record.
  if (round && !round.outcome) {
    if (round.status === "revealed") {
      return {
        kind: "decide",
        title: "Record the club's decision",
        detail: "The ballots are revealed. One step records the outcome, moves the application and proposes the grant.",
      };
    }
    if (round.status === "closed") {
      return {
        kind: "reveal",
        title: "Reveal the vote",
        detail: "Voting has closed. A partner reveals every ballot to the club at once.",
      };
    }
    if (round.status === "open") {
      return {
        kind: "vote",
        title: "Vote is open",
        detail: "Ballots are blind until a partner reveals them.",
      };
    }
  }

  if (input.memoStatus === "circulated" || input.memoStatus === "decided") {
    return {
      kind: "open_vote",
      title: "Open the vote",
      detail:
        round?.outcome === "revisit" || round?.outcome === "no_quorum"
          ? "The last vote didn't settle it. A partner can open a new round from the memo."
          : "The memo is circulated. A partner opens a blind vote from the memo.",
    };
  }
  if (input.memoStatus === "draft" || input.memoStatus === "in_review") {
    return {
      kind: "finish_memo",
      title: "Finish the memo",
      detail: "Circulate it when it's ready — that unlocks the vote.",
    };
  }

  if (stage?.minAttendees != null && input.maxVerdicts < stage.minAttendees) {
    const missing = stage.minAttendees - input.maxVerdicts;
    return {
      kind: "coffee_chat",
      title: input.maxVerdicts === 0 ? "Log the coffee chat" : "Finish the coffee chat verdicts",
      detail: `${stage.name} needs ${stage.minAttendees} members' verdicts on one chat before this can advance — ${missing} to go.`,
    };
  }
  if (stage?.requiresMemo || stage?.requiresVote) {
    return {
      kind: "start_memo",
      title: "Start the memo",
      detail: "The memo is what the club reads before it votes. Start from the template.",
    };
  }
  if (input.hasCriteria && !input.viewerHasScored) {
    return {
      kind: "score",
      title: "Score this application",
      detail: "Five taps. Your scores are averaged with everyone else's.",
    };
  }
  return {
    kind: "advance",
    title: input.nextStageName ? `Move to ${input.nextStageName}` : "Keep it moving",
    detail: input.nextStageName
      ? `Nothing is blocking ${stage?.name ?? "this stage"}. Advance it when you're ready, or decline with a reason.`
      : "This is the last stage before a decision.",
  };
}
