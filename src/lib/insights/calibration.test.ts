import { describe, it, expect } from "vitest";
import { yesRate, calibration, contrarianRecord, type OutcomeBallot } from "./calibration";

function b(
  roundId: string,
  memberId: string,
  decision: "fund" | "decline" | "abstain",
  conviction: number,
  outcomeTier: OutcomeBallot["outcomeTier"],
  companyId = `co-${roundId}`
): OutcomeBallot {
  return { roundId, companyId, memberId, decision, conviction, outcomeTier };
}

const ballots: OutcomeBallot[] = [
  // Round 1: company reached revenue. Alice fund@5, Bob decline@2, Cara fund@4.
  b("r1", "alice", "fund", 5, "revenue"),
  b("r1", "bob", "decline", 2, "revenue"),
  b("r1", "cara", "fund", 4, "revenue"),
  // Round 2: dormant. Alice fund@2, Bob decline@4, Cara decline@3.
  b("r2", "alice", "fund", 2, "dormant"),
  b("r2", "bob", "decline", 4, "dormant"),
  b("r2", "cara", "decline", 3, "dormant"),
  // Round 3: raised a round. Alice fund@4, Bob fund@3, Cara abstain.
  b("r3", "alice", "fund", 4, "raised_round"),
  b("r3", "bob", "fund", 3, "raised_round"),
  b("r3", "cara", "abstain", 3, "raised_round"),
];

describe("yesRate", () => {
  it("computes member vs club fund-rate, excluding abstains", () => {
    const r = yesRate(ballots, "alice");
    expect(r.mine).toBeCloseTo(1.0); // alice: 3 fund / 3 decided
    // club: decided = 8 (one abstain excluded), funds = 5
    expect(r.club).toBeCloseTo(5 / 8);
    expect(r.myVotes).toBe(3);
  });

  it("null for a member with no decided votes", () => {
    expect(yesRate(ballots, "nobody").mine).toBeNull();
  });
});

describe("calibration", () => {
  it("alice is well-calibrated: high conviction on winners, low on dormant", () => {
    const c = calibration(ballots, "alice");
    expect(c.onWinners).toBeCloseTo((5 + 4) / 2); // r1, r3
    expect(c.onDormant).toBeCloseTo(2); // r2
    expect(c.spread).toBeCloseTo(2.5);
  });

  it("bob is anti-calibrated: negative spread", () => {
    const c = calibration(ballots, "bob");
    expect(c.onWinners).toBeCloseTo((2 + 3) / 2);
    expect(c.onDormant).toBeCloseTo(4);
    expect(c.spread).toBeCloseTo(-1.5);
  });

  it("null spread when either side has no data", () => {
    const c = calibration([b("r9", "zoe", "fund", 5, "revenue")], "zoe");
    expect(c.onDormant).toBeNull();
    expect(c.spread).toBeNull();
  });
});

describe("contrarianRecord", () => {
  it("bob's r1 decline against a fund majority is not vindicated (company won)", () => {
    const r = contrarianRecord(ballots, "bob");
    const r1 = r.find((x) => x.roundId === "r1");
    expect(r1).toBeDefined();
    expect(r1!.myVote).toBe("decline");
    expect(r1!.vindicated).toBe(false);
  });

  it("alice's r2 fund against a decline majority is not vindicated (dormant)", () => {
    const r = contrarianRecord(ballots, "alice");
    const r2 = r.find((x) => x.roundId === "r2");
    expect(r2).toBeDefined();
    expect(r2!.vindicated).toBe(false);
  });

  it("a vindicated contrarian: decline against the crowd on a dormant company", () => {
    const rows = [
      b("r5", "dee", "decline", 1, "dormant"),
      b("r5", "x", "fund", 4, "dormant"),
      b("r5", "y", "fund", 4, "dormant"),
    ];
    const r = contrarianRecord(rows, "dee");
    expect(r).toHaveLength(1);
    expect(r[0].vindicated).toBe(true);
  });

  it("no majority (tie) yields no contrarian entry", () => {
    const rows = [
      b("r6", "a", "fund", 3, "dormant"),
      b("r6", "b", "decline", 3, "dormant"),
    ];
    expect(contrarianRecord(rows, "a")).toHaveLength(0);
  });

  it("pending outcomes are marked null, not guessed", () => {
    const rows = [
      b("r7", "a", "decline", 2, null),
      b("r7", "x", "fund", 4, null),
      b("r7", "y", "fund", 4, null),
    ];
    const r = contrarianRecord(rows, "a");
    expect(r[0].vindicated).toBeNull();
  });
});
