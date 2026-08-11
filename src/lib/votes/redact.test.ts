import { describe, it, expect } from "vitest";
import { redactVoteResults, type BallotRow, type EligibilityRow } from "./redact";

const eligibility: EligibilityRow[] = [
  { memberId: "a", memberName: "Alice", isRecused: false },
  { memberId: "b", memberName: "Bob", isRecused: false },
  { memberId: "c", memberName: "Cara", isRecused: false },
  { memberId: "r", memberName: "Rex", isRecused: true },
];

const ballots: BallotRow[] = [
  {
    memberId: "a",
    memberName: "Alice",
    decision: "fund",
    conviction: 4,
    suggestedAmount: "1500",
    rationale: "Strong team",
    submittedAt: "2026-08-01T00:00:00Z",
  },
  {
    memberId: "b",
    memberName: "Bob",
    decision: "decline",
    conviction: 2,
    suggestedAmount: null,
    rationale: "Too early",
    submittedAt: "2026-08-01T01:00:00Z",
  },
  // Rex is recused; a stray ballot from him must never count or leak.
  {
    memberId: "r",
    memberName: "Rex",
    decision: "fund",
    conviction: 5,
    suggestedAmount: null,
    rationale: "conflict!",
    submittedAt: "2026-08-01T02:00:00Z",
  },
];

const openRound = { status: "open" as const, revealedAt: null };
const revealedRound = { status: "revealed" as const, revealedAt: "2026-08-02T00:00:00Z" };

describe("pre-reveal (blind)", () => {
  it("exposes only counts — no ballots, no missing list", () => {
    const r = redactVoteResults(openRound, ballots, eligibility, "c");
    expect(r.revealed).toBe(false);
    expect(r.submittedCount).toBe(2);
    expect(r.eligibleCount).toBe(3);
    expect(r.recusedCount).toBe(1);
    expect(r.ballots).toEqual([]);
    expect(r.missing).toEqual([]);
    expect(r.myBallot).toBeNull();
  });

  it("a voter sees only their own ballot", () => {
    const r = redactVoteResults(openRound, ballots, eligibility, "a");
    expect(r.myBallot?.decision).toBe("fund");
    expect(r.ballots).toEqual([]);
  });

  it("the chair/admin gets no special access before reveal", () => {
    // Redaction is viewer-independent pre-reveal by construction: the only
    // per-viewer field is myBallot.
    const asAdmin = redactVoteResults(openRound, ballots, eligibility, "admin-not-voter");
    expect(asAdmin.ballots).toEqual([]);
    expect(asAdmin.myBallot).toBeNull();
  });

  it("'closed' still hides ballots until an explicit reveal", () => {
    const r = redactVoteResults(
      { status: "closed", revealedAt: null },
      ballots,
      eligibility,
      "a"
    );
    expect(r.revealed).toBe(false);
    expect(r.ballots).toEqual([]);
  });

  it("status 'revealed' without a timestamp is still blind (defense in depth)", () => {
    const r = redactVoteResults(
      { status: "revealed", revealedAt: null },
      ballots,
      eligibility,
      "a"
    );
    expect(r.revealed).toBe(false);
    expect(r.ballots).toEqual([]);
  });
});

describe("viewer flags", () => {
  it("flags a recused viewer pre-reveal and post-reveal", () => {
    const pre = redactVoteResults(openRound, ballots, eligibility, "r");
    expect(pre.viewerIsRecused).toBe(true);
    expect(pre.viewerIsEligible).toBe(true);
    const post = redactVoteResults(revealedRound, ballots, eligibility, "r");
    expect(post.viewerIsRecused).toBe(true);
  });

  it("a non-recused voter is eligible, not recused", () => {
    const r = redactVoteResults(openRound, ballots, eligibility, "a");
    expect(r.viewerIsRecused).toBe(false);
    expect(r.viewerIsEligible).toBe(true);
  });

  it("a viewer outside the eligibility list is neither", () => {
    const r = redactVoteResults(openRound, ballots, eligibility, "stranger");
    expect(r.viewerIsRecused).toBe(false);
    expect(r.viewerIsEligible).toBe(false);
  });
});

describe("post-reveal", () => {
  it("exposes ballots sorted by conviction (outliers first) and the missing list", () => {
    const r = redactVoteResults(revealedRound, ballots, eligibility, "c");
    expect(r.revealed).toBe(true);
    expect(r.ballots.map((b) => b.memberId)).toEqual(["b", "a"]);
    expect(r.missing).toEqual(["Cara"]);
  });

  it("recused members' ballots never appear, even post-reveal", () => {
    const r = redactVoteResults(revealedRound, ballots, eligibility, "a");
    expect(r.ballots.some((b) => b.memberId === "r")).toBe(false);
    expect(r.submittedCount).toBe(2);
  });
});
