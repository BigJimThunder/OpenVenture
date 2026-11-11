import { describe, expect, it } from "vitest";
import { nextAction, type NextActionInput } from "./next-action";

const base: NextActionInput = {
  status: "open",
  stage: { name: "Screening", minAttendees: null, requiresMemo: false, requiresVote: false },
  nextStageName: "Coffee Chat",
  memoStatus: null,
  round: null,
  maxVerdicts: 0,
  hasCriteria: true,
  viewerHasScored: false,
  grantStatus: null,
};
const kind = (over: Partial<NextActionInput>) => nextAction({ ...base, ...over }).kind;

describe("nextAction", () => {
  it("walks the happy path in order", () => {
    expect(kind({})).toBe("score");
    expect(kind({ viewerHasScored: true })).toBe("advance");
    const chat = { name: "Coffee Chat", minAttendees: 2, requiresMemo: false, requiresVote: false };
    expect(kind({ stage: chat, viewerHasScored: true })).toBe("coffee_chat");
    expect(kind({ stage: chat, maxVerdicts: 2, viewerHasScored: true })).toBe("advance");
    const pitched = { name: "Pitched Group", minAttendees: null, requiresMemo: true, requiresVote: false };
    expect(kind({ stage: pitched })).toBe("start_memo");
    expect(kind({ stage: pitched, memoStatus: "draft" })).toBe("finish_memo");
    expect(kind({ stage: pitched, memoStatus: "circulated" })).toBe("open_vote");
    expect(kind({ memoStatus: "circulated", round: { status: "open", outcome: null } })).toBe("vote");
    expect(kind({ memoStatus: "circulated", round: { status: "closed", outcome: null } })).toBe("reveal");
    expect(kind({ memoStatus: "circulated", round: { status: "revealed", outcome: null } })).toBe("decide");
  });

  it("says how many verdicts are missing", () => {
    const a = nextAction({
      ...base,
      stage: { name: "Coffee Chat", minAttendees: 2, requiresMemo: false, requiresVote: false },
      maxVerdicts: 1,
    });
    expect(a.title).toBe("Finish the coffee chat verdicts");
    expect(a.detail).toContain("1 to go");
  });

  it("offers a new round after an inconclusive vote", () => {
    const a = nextAction({ ...base, memoStatus: "circulated", round: { status: "revealed", outcome: "revisit" } });
    expect(a.kind).toBe("open_vote");
    expect(a.detail).toContain("new round");
  });

  it("tracks the grant once funded", () => {
    expect(kind({ status: "funded" })).toBe("propose_grant");
    expect(kind({ status: "funded", grantStatus: "proposed" })).toBe("grant_pending");
    expect(kind({ status: "funded", grantStatus: "issued" })).toBe("grant_tracking");
  });

  it("is closed for declined and withdrawn applications", () => {
    expect(nextAction({ ...base, status: "declined" })).toMatchObject({ kind: "closed", title: "Declined" });
    expect(kind({ status: "withdrawn" })).toBe("closed");
  });
});
