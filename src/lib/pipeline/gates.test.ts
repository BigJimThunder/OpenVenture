import { describe, expect, it } from "vitest";
import { checkStageGates, type GateEvidence, type GateStage } from "./gates";

/** The seeded default pipeline (src/lib/defaults.ts). */
const stage = (over: Partial<GateStage> & Pick<GateStage, "id" | "name" | "position">): GateStage => ({
  kind: "active",
  minAttendees: null,
  requiresMemo: false,
  requiresVote: false,
  ...over,
});

const applied = stage({ id: "s1", name: "Applied", position: "1" });
const screening = stage({ id: "s2", name: "Screening", position: "2" });
const coffeeChat = stage({ id: "s3", name: "Coffee Chat", position: "3", minAttendees: 2 });
const pitched = stage({ id: "s4", name: "Pitched Group", position: "4", requiresMemo: true });
const decision = stage({ id: "s5", name: "Decision", position: "5", requiresVote: true });
const funded = stage({ id: "s6", name: "Funded", position: "6", kind: "won" });
const declined = stage({ id: "s7", name: "Declined", position: "7", kind: "lost" });
const parked = stage({ id: "s8", name: "Parked", position: "8", kind: "parked" });

const ALL = [applied, screening, coffeeChat, pitched, decision, funded, declined, parked];

const none: GateEvidence = {
  hasCirculatedMemo: false,
  hasRevealedVote: false,
  maxVerdictAttendees: 0,
};
const all: GateEvidence = {
  hasCirculatedMemo: true,
  hasRevealedVote: true,
  maxVerdictAttendees: 2,
};

describe("checkStageGates", () => {
  it("allows ungated forward moves", () => {
    expect(checkStageGates(applied, screening, ALL, none)).toEqual({ ok: true });
    expect(checkStageGates(screening, coffeeChat, ALL, none)).toEqual({ ok: true });
  });

  it("blocks leaving Coffee Chat without enough recorded verdicts", () => {
    const res = checkStageGates(coffeeChat, pitched, ALL, none);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/coffee chat with 2 recorded verdicts/i);
  });

  it("counts only verdict-recorded attendees toward minAttendees", () => {
    const one = { ...none, maxVerdictAttendees: 1 };
    expect(checkStageGates(coffeeChat, pitched, ALL, one).ok).toBe(false);
    const two = { ...none, maxVerdictAttendees: 2 };
    expect(checkStageGates(coffeeChat, pitched, ALL, two).ok).toBe(true);
  });

  it("blocks leaving Pitched Group without a circulated memo", () => {
    const res = checkStageGates(pitched, decision, ALL, { ...all, hasCirculatedMemo: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/memo.*Pitched Group/i);
  });

  it("blocks moving into a won stage without a revealed vote", () => {
    const res = checkStageGates(decision, funded, ALL, { ...all, hasRevealedVote: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/vote.*Decision/i);
  });

  it("accumulates gates across skipped stages", () => {
    // Screening → Funded must pass Coffee Chat, Pitched Group and Decision gates.
    const res = checkStageGates(screening, funded, ALL, none);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Coffee Chat/);

    const chatted = { ...none, maxVerdictAttendees: 2 };
    const res2 = checkStageGates(screening, funded, ALL, chatted);
    if (!res2.ok) expect(res2.message).toMatch(/Pitched Group/);

    const memoed = { ...chatted, hasCirculatedMemo: true };
    const res3 = checkStageGates(screening, funded, ALL, memoed);
    if (!res3.ok) expect(res3.message).toMatch(/Decision/);

    expect(checkStageGates(screening, funded, ALL, all)).toEqual({ ok: true });
  });

  it("exempts backward moves", () => {
    expect(checkStageGates(decision, screening, ALL, none)).toEqual({ ok: true });
    expect(checkStageGates(pitched, coffeeChat, ALL, none)).toEqual({ ok: true });
  });

  it("exempts moves to lost and parked stages", () => {
    expect(checkStageGates(coffeeChat, declined, ALL, none)).toEqual({ ok: true });
    expect(checkStageGates(coffeeChat, parked, ALL, none)).toEqual({ ok: true });
  });

  it("reports the earliest unsatisfied stage first", () => {
    const res = checkStageGates(applied, funded, ALL, none);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/Coffee Chat/);
  });

  it("handles fractional positions from stage reordering", () => {
    const inserted = stage({ id: "s9", name: "Deep Dive", position: "4.5", requiresMemo: true });
    const withInserted = [...ALL, inserted];
    // Leaving Pitched Group past Deep Dive requires the memo gate on both.
    const res = checkStageGates(pitched, decision, withInserted, {
      ...all,
      hasCirculatedMemo: false,
    });
    expect(res.ok).toBe(false);
  });
});
