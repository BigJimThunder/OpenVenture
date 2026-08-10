import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import fc from "fast-check";
import { foldCapTable, accruedNoteValue } from "./engine";
import type { CapEventInput } from "./types";

/**
 * Golden-fixture corpus for the cap table engine. Every scenario is
 * hand-computed; the numbers in the assertions are the worked examples.
 * This suite is the hard CI gate on the Cap Table Lab.
 */

const alice = { id: "alice", name: "Alice", kind: "founder" as const };
const bob = { id: "bob", name: "Bob", kind: "founder" as const };
const fund = { id: "fund", name: "Seed Fund", kind: "fund" as const };
const angel = { id: "angel", name: "Angel One", kind: "angel" as const };
const angel2 = { id: "angel2", name: "Angel Two", kind: "angel" as const };

function ev(seq: number, payload: CapEventInput["payload"]): CapEventInput {
  return { seq, effectiveDate: "2026-01-15", payload };
}

function rowOf(state: ReturnType<typeof foldCapTable>, id: string) {
  const row = state.rows.find((r) => r.stakeholderId === id);
  if (!row) throw new Error(`No row for ${id}`);
  return row;
}

function pctSum(state: ReturnType<typeof foldCapTable>) {
  return state.rows.reduce((n, r) => n + r.pct, 0);
}

describe("founders only", () => {
  it("splits 60/40", () => {
    const state = foldCapTable([
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 6_000_000 }),
      ev(2, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 4_000_000 }),
    ]);
    expect(rowOf(state, "alice").pct).toBeCloseTo(0.6, 10);
    expect(rowOf(state, "bob").pct).toBeCloseTo(0.4, 10);
    expect(pctSum(state)).toBeCloseTo(1, 10);
  });
});

describe("single post-money SAFE ($500k at $5M post-money cap)", () => {
  // Founders 9M issued + 1M unissued pool. SAFE is promised exactly 10%
  // of the company capitalization (pre-new-money, pre-pool-increase).
  // Round: $8M pre, $2M new, no pool top-up.
  // C = 10M / 0.9 = 11,111,111.11 → SAFE gets 1,111,111.11 sh
  // PPS = 8M / 11,111,111.11 = $0.72 exactly
  // New investor: 2M / 0.72 = 2,777,777.78 sh → 20% post
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 9_000_000 }),
    ev(2, { kind: "pool_create", classId: "pool", shares: 1_000_000 }),
    ev(3, {
      kind: "safe_issue",
      instrumentId: "safe-1",
      stakeholder: angel,
      principal: 500_000,
      capType: "post_money",
      valuationCap: 5_000_000,
      mfn: false,
    }),
    ev(4, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 8_000_000,
      newMoney: 2_000_000,
      participations: [{ stakeholder: fund, amount: 2_000_000 }],
    }),
  ];

  it("converts the SAFE at exactly principal/cap of company capitalization", () => {
    const state = foldCapTable(events);
    const safeShares = new Decimal(rowOf(state, "angel").shares);
    expect(safeShares.toNumber()).toBeCloseTo(1_111_111.111111, 4);
  });

  it("prices the round at $0.72/sh and gives the investor 20%", () => {
    const state = foldCapTable(events);
    expect(Number(state.pricePerShare)).toBeCloseTo(0.72, 8);
    expect(rowOf(state, "fund").pct).toBeCloseTo(0.2, 8);
  });

  it("ownership sums to exactly 100%", () => {
    expect(pctSum(foldCapTable(events))).toBeCloseTo(1, 10);
  });
});

describe("pre-money SAFE with the option pool shuffle", () => {
  // Founders 10M, no pool. SAFE $250k at $2.5M pre-money cap.
  // Round: $6M pre, $2M new, 10% post pool target.
  // Original-YC pre-money convention: conversion price = cap / company
  // capitalization, where company cap = issued FD + pool INCLUDING the
  // increase, EXCLUDING converting securities → the SAFE shares
  // pool-shuffle dilution, unlike a post-money SAFE.
  // Solved by hand: poolAdd = 1,718,750 → SAFE shares = 0.1·(10M + 1,718,750)
  // = 1,171,875 ; post-round total = 17,187,500 ; SAFE pct = 3/44 ≈ 6.818%.
  // Investor = 2M/(6M+2M) = 25% post. Pool unissued = 10% post.
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 10_000_000 }),
    ev(2, {
      kind: "safe_issue",
      instrumentId: "safe-pre",
      stakeholder: angel,
      principal: 250_000,
      capType: "pre_money",
      valuationCap: 2_500_000,
      mfn: false,
    }),
    ev(3, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 6_000_000,
      newMoney: 2_000_000,
      targetPoolPctPost: 0.1,
      participations: [{ stakeholder: fund, amount: 2_000_000 }],
    }),
  ];

  it("gives the investor exactly newMoney/postMoney = 25%", () => {
    const state = foldCapTable(events);
    expect(rowOf(state, "fund").pct).toBeCloseTo(0.25, 8);
  });

  it("leaves the unissued pool at exactly 10% of post-round FD", () => {
    const state = foldCapTable(events);
    const pool = state.rows.find((r) => r.stakeholderId === "__pool__")!;
    expect(pool.pct).toBeCloseTo(0.1, 8);
  });

  it("SAFE converts at cap ÷ company capitalization → 1,171,875 sh = 6.818% post", () => {
    const state = foldCapTable(events);
    expect(new Decimal(rowOf(state, "angel").shares).toNumber()).toBeCloseTo(1_171_875, 0);
    expect(rowOf(state, "angel").pct).toBeCloseTo(3 / 44, 8);
  });

  it("ownership sums to 100%", () => {
    expect(pctSum(foldCapTable(events))).toBeCloseTo(1, 10);
  });
});

describe("two stacked post-money SAFEs into a priced round with pool top-up", () => {
  // The capwave/YC worked example shape: $500k @ $8M post cap (6.25%) and
  // $750k @ $12M post cap (6.25%). Founders 8M sh. Round: $20M pre, $4M new
  // ($24M post), 10% post pool.
  // Company capitalization C = 8M / (1 − 0.125) = 9,142,857.14
  // Each SAFE: 0.0625 · C = 571,428.57 sh
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 8_000_000 }),
    ev(2, {
      kind: "safe_issue",
      instrumentId: "safe-a",
      stakeholder: angel,
      principal: 500_000,
      capType: "post_money",
      valuationCap: 8_000_000,
      mfn: false,
    }),
    ev(3, {
      kind: "safe_issue",
      instrumentId: "safe-b",
      stakeholder: angel2,
      principal: 750_000,
      capType: "post_money",
      valuationCap: 12_000_000,
      mfn: false,
    }),
    ev(4, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 20_000_000,
      newMoney: 4_000_000,
      targetPoolPctPost: 0.1,
      closeDate: "2026-06-01",
      participations: [{ stakeholder: fund, amount: 4_000_000 }],
    }),
  ];

  it("each SAFE converts to exactly its promised fraction of company capitalization", () => {
    const state = foldCapTable(events);
    const sA = new Decimal(rowOf(state, "angel").shares);
    const sB = new Decimal(rowOf(state, "angel2").shares);
    expect(sA.toNumber()).toBeCloseTo(571_428.5714, 2);
    expect(sB.toNumber()).toBeCloseTo(571_428.5714, 2);
  });

  it("investor gets 4/24 = 16.67% and pool is 10%", () => {
    const state = foldCapTable(events);
    expect(rowOf(state, "fund").pct).toBeCloseTo(4 / 24, 8);
    const pool = state.rows.find((r) => r.stakeholderId === "__pool__")!;
    expect(pool.pct).toBeCloseTo(0.1, 8);
  });

  it("founder dilution matches the hand-solved 35.83%", () => {
    const state = foldCapTable(events);
    // Solved by hand: poolAdd = 1,246,753.25 → post-round FD = 12,467,532.47
    // → founders hold 8M/12,467,532.47 = 64.1667%.
    const founderPct = rowOf(state, "alice").pct;
    expect(founderPct).toBeCloseTo(0.641667, 5);
    expect(1 - founderPct).toBeGreaterThan(0.25);
    expect(1 - founderPct).toBeLessThan(0.4);
  });

  it("ownership sums to 100%", () => {
    expect(pctSum(foldCapTable(events))).toBeCloseTo(1, 10);
  });
});

describe("uncapped SAFE with a 20% discount", () => {
  // Founders 10M. SAFE $100k uncapped, 20% discount.
  // Round $4M pre, $1M new. Closed form:
  // conv = 100k/(0.8·PPS) = 125,000/PPS
  // PPS·(10M + 125,000/PPS) = 4M ⇒ PPS = 3,875,000/10,000,000 = $0.3875
  // conv = 125,000/0.3875 = 322,580.645
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 10_000_000 }),
    ev(2, {
      kind: "safe_issue",
      instrumentId: "safe-disc",
      stakeholder: angel,
      principal: 100_000,
      capType: "uncapped",
      discount: 0.2,
      mfn: false,
    }),
    ev(3, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 4_000_000,
      newMoney: 1_000_000,
      participations: [{ stakeholder: fund, amount: 1_000_000 }],
    }),
  ];

  it("solves the circular PPS to $0.3875", () => {
    const state = foldCapTable(events);
    expect(Number(state.pricePerShare)).toBeCloseTo(0.3875, 8);
  });

  it("converts at the discounted price", () => {
    const state = foldCapTable(events);
    expect(new Decimal(rowOf(state, "angel").shares).toNumber()).toBeCloseTo(322_580.6452, 2);
  });
});

describe("convertible note with accrued interest at a cap", () => {
  // Note $100k, 6% simple, exactly one 365-day year → $106k value.
  // Cap $5.3M pre-money. Founders 10M, no pool, no top-up. Round $10M pre.
  // Company cap for the note's price = 10M (excludes converting securities)
  // ⇒ price = 5.3M/10M = $0.53 ⇒ conv = 106,000/0.53 = 200,000 sh exactly.
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 10_000_000 }),
    ev(2, {
      kind: "note_issue",
      instrumentId: "note-1",
      stakeholder: angel,
      principal: 100_000,
      interestRate: 0.06,
      issueDate: "2025-06-01",
      capType: "pre_money",
      valuationCap: 5_300_000,
    }),
    ev(3, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 10_000_000,
      newMoney: 2_000_000,
      closeDate: "2026-06-01",
      participations: [{ stakeholder: fund, amount: 2_000_000 }],
    }),
  ];

  it("accrues simple interest correctly", () => {
    const value = accruedNoteValue(
      {
        instrumentId: "n",
        stakeholderId: "a",
        stakeholderName: "a",
        stakeholderKind: "angel",
        principal: new Decimal(100_000),
        interestRate: new Decimal(0.06),
        issueDate: "2025-06-01",
        capType: "pre_money",
      },
      "2026-06-01"
    );
    expect(value.toNumber()).toBeCloseTo(106_000, 0);
  });

  it("converts note value (principal + interest) at the cap price", () => {
    const state = foldCapTable(events);
    expect(new Decimal(rowOf(state, "angel").shares).toNumber()).toBeCloseTo(200_000, 1);
  });
});

describe("MFN resolution", () => {
  // SAFE1: $100k uncapped + MFN. SAFE2 (later): $200k @ $4M post-money cap.
  // MFN → SAFE1 adopts the $4M post-money cap: F1 = 2.5%, F2 = 5%.
  // Founders 8M. C = 8M/0.925 = 8,648,648.65
  const events: CapEventInput[] = [
    ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 8_000_000 }),
    ev(2, {
      kind: "safe_issue",
      instrumentId: "safe-mfn",
      stakeholder: angel,
      principal: 100_000,
      capType: "uncapped",
      mfn: true,
    }),
    ev(3, {
      kind: "safe_issue",
      instrumentId: "safe-capped",
      stakeholder: angel2,
      principal: 200_000,
      capType: "post_money",
      valuationCap: 4_000_000,
      mfn: false,
    }),
    ev(4, {
      kind: "priced_round",
      name: "Seed",
      classId: "seed-preferred",
      preMoneyValuation: 12_000_000,
      newMoney: 3_000_000,
      participations: [{ stakeholder: fund, amount: 3_000_000 }],
    }),
  ];

  it("the MFN SAFE adopts the better cap from the later SAFE", () => {
    const state = foldCapTable(events);
    const s1 = new Decimal(rowOf(state, "angel").shares);
    const s2 = new Decimal(rowOf(state, "angel2").shares);
    expect(s1.toNumber()).toBeCloseTo(216_216.2162, 2);
    expect(s2.toNumber()).toBeCloseTo(432_432.4324, 2);
    // Same terms → half the money buys exactly half the shares.
    expect(s2.div(s1).toNumber()).toBeCloseTo(2, 8);
  });
});

describe("stock split then round", () => {
  it("2-for-1 split doubles counts without changing ownership", () => {
    const base: CapEventInput[] = [
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 1_000_000 }),
      ev(2, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 1_000_000 }),
    ];
    const before = foldCapTable(base);
    const after = foldCapTable([
      ...base,
      ev(3, { kind: "stock_split", numerator: 2, denominator: 1 }),
    ]);
    expect(new Decimal(after.totalFullyDiluted).toNumber()).toBe(
      new Decimal(before.totalFullyDiluted).mul(2).toNumber()
    );
    expect(rowOf(after, "alice").pct).toBeCloseTo(rowOf(before, "alice").pct, 10);
  });
});

describe("secondary transfer", () => {
  it("moves shares without changing the total", () => {
    const state = foldCapTable([
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 6_000_000 }),
      ev(2, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 4_000_000 }),
      ev(3, {
        kind: "share_transfer",
        fromStakeholderId: "alice",
        toStakeholder: fund,
        classId: "common",
        shares: 1_000_000,
      }),
    ]);
    expect(new Decimal(rowOf(state, "alice").shares).toNumber()).toBe(5_000_000);
    expect(new Decimal(rowOf(state, "fund").shares).toNumber()).toBe(1_000_000);
    expect(new Decimal(state.totalFullyDiluted).toNumber()).toBe(10_000_000);
  });

  it("rejects overdrawn transfers", () => {
    expect(() =>
      foldCapTable([
        ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 100 }),
        ev(2, {
          kind: "share_transfer",
          fromStakeholderId: "alice",
          toStakeholder: fund,
          classId: "common",
          shares: 200,
        }),
      ])
    ).toThrow(/exceeds/);
  });
});

describe("option grants draw down the pool", () => {
  it("grant moves shares from unissued pool to the holder", () => {
    const state = foldCapTable([
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 9_000_000 }),
      ev(2, { kind: "pool_create", classId: "pool", shares: 1_000_000 }),
      ev(3, {
        kind: "option_grant",
        stakeholder: { id: "emp1", name: "First Hire", kind: "employee" },
        classId: "pool",
        shares: 250_000,
      }),
    ]);
    expect(new Decimal(state.poolUnissued).toNumber()).toBe(750_000);
    expect(new Decimal(rowOf(state, "emp1").shares).toNumber()).toBe(250_000);
    expect(pctSum(state)).toBeCloseTo(1, 10);
  });

  it("rejects grants exceeding the pool", () => {
    expect(() =>
      foldCapTable([
        ev(1, { kind: "pool_create", classId: "pool", shares: 100 }),
        ev(2, {
          kind: "option_grant",
          stakeholder: { id: "e", name: "E", kind: "employee" },
          classId: "pool",
          shares: 200,
        }),
      ])
    ).toThrow(/exceeds unissued pool/);
  });
});

describe("the Lab presets — accelerator deal", () => {
  // "$125K for 7%" — modeled as a post-money SAFE at 125k/0.07 ≈ $1.7857M cap.
  it("accelerator gets exactly 7% pre-financing", () => {
    const cap = 125_000 / 0.07;
    const state = foldCapTable([
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 8_500_000 }),
      ev(2, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 1_500_000 }),
      ev(3, {
        kind: "safe_issue",
        instrumentId: "acc",
        stakeholder: { id: "acc", name: "Accelerator", kind: "accelerator" },
        principal: 125_000,
        capType: "post_money",
        valuationCap: cap,
        mfn: false,
      }),
      ev(4, {
        kind: "priced_round",
        name: "Seed",
        classId: "seed-preferred",
        preMoneyValuation: 8_000_000,
        newMoney: 2_000_000,
        participations: [{ stakeholder: fund, amount: 2_000_000 }],
      }),
    ]);
    // 7% of company capitalization, then diluted 20% by new money → 5.6%
    expect(rowOf(state, "acc").pct).toBeCloseTo(0.07 * 0.8, 6);
  });
});

describe("validation and failure modes", () => {
  it("rejects duplicate seq", () => {
    expect(() =>
      foldCapTable([
        ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 100 }),
        ev(1, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 100 }),
      ])
    ).toThrow(/Duplicate/);
  });

  it("rejects post-money SAFE stacks promising ≥ 100%", () => {
    expect(() =>
      foldCapTable([
        ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 1000 }),
        ev(2, {
          kind: "safe_issue",
          instrumentId: "s1",
          stakeholder: angel,
          principal: 1_000_000,
          capType: "post_money",
          valuationCap: 1_000_000,
          mfn: false,
        }),
        ev(3, {
          kind: "priced_round",
          name: "Doom",
          classId: "pref",
          preMoneyValuation: 5_000_000,
          newMoney: 1_000_000,
          participations: [{ stakeholder: fund, amount: 1_000_000 }],
        }),
      ])
    ).toThrow(/100%/);
  });

  it("rejects a pool target that consumes the entire pre-money", () => {
    // t/(1−t)·newMoney = (0.25/0.75)·$3.1M > $1M pre-money ⇒ no valid PPS.
    expect(() =>
      foldCapTable([
        ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 1_000_000 }),
        ev(2, {
          kind: "priced_round",
          name: "Impossible",
          classId: "pref",
          preMoneyValuation: 1_000_000,
          newMoney: 3_100_000,
          targetPoolPctPost: 0.25,
          participations: [{ stakeholder: fund, amount: 3_100_000 }],
        }),
      ])
    ).toThrow(/no valid price/);
  });

  it("respects throughSeq (time travel)", () => {
    const events: CapEventInput[] = [
      ev(1, { kind: "founding_issuance", stakeholder: alice, classId: "common", shares: 100 }),
      ev(2, { kind: "founding_issuance", stakeholder: bob, classId: "common", shares: 100 }),
    ];
    const at1 = foldCapTable(events, { throughSeq: 1 });
    expect(at1.rows).toHaveLength(1);
    expect(rowOf(at1, "alice").pct).toBe(1);
  });
});

describe("property: ownership always sums to 1", () => {
  it("holds for arbitrary founder/pool/SAFE/round combinations", () => {
    fc.assert(
      fc.property(
        fc.record({
          founderShares: fc.integer({ min: 1_000_000, max: 20_000_000 }),
          poolShares: fc.integer({ min: 0, max: 5_000_000 }),
          safePrincipal: fc.integer({ min: 10_000, max: 1_000_000 }),
          safeCapMultiple: fc.integer({ min: 2, max: 40 }), // cap = principal · multiple ⇒ F ≤ 50%
          preMoney: fc.integer({ min: 1_000_000, max: 50_000_000 }),
          newMoney: fc.integer({ min: 100_000, max: 10_000_000 }),
          poolTargetPct: fc.option(fc.integer({ min: 5, max: 25 }), { nil: undefined }),
        }),
        (r) => {
          // Feasibility: a pool target of t of post-round FD needs
          // t/(1−t)·newMoney < preMoney, or no positive share price exists
          // (the engine rejects that case with a clear error — tested below).
          if (r.poolTargetPct) {
            const t = r.poolTargetPct / 100;
            fc.pre((t / (1 - t)) * r.newMoney < r.preMoney * 0.9);
          }
          const events: CapEventInput[] = [
            ev(1, {
              kind: "founding_issuance",
              stakeholder: alice,
              classId: "common",
              shares: r.founderShares,
            }),
            ...(r.poolShares > 0
              ? [ev(2, { kind: "pool_create" as const, classId: "pool", shares: r.poolShares })]
              : []),
            ev(3, {
              kind: "safe_issue",
              instrumentId: "s",
              stakeholder: angel,
              principal: r.safePrincipal,
              capType: "post_money",
              valuationCap: r.safePrincipal * r.safeCapMultiple,
              mfn: false,
            }),
            ev(4, {
              kind: "priced_round",
              name: "Seed",
              classId: "pref",
              preMoneyValuation: r.preMoney,
              newMoney: r.newMoney,
              targetPoolPctPost: r.poolTargetPct ? r.poolTargetPct / 100 : undefined,
              participations: [{ stakeholder: fund, amount: r.newMoney }],
            }),
          ];
          const state = foldCapTable(events);
          const sum = state.rows.reduce((n, row) => n + row.pct, 0);
          expect(sum).toBeCloseTo(1, 9);
          // No negative positions, ever.
          for (const row of state.rows) {
            expect(new Decimal(row.shares).gte(0)).toBe(true);
          }
          // Post-money SAFE keeps its promise: after the round the investor
          // holds exactly newMoney/(pre+new).
          const investorPct = state.rows.find((x) => x.stakeholderId === "fund")!.pct;
          expect(investorPct).toBeCloseTo(r.newMoney / (r.preMoney + r.newMoney), 6);
        }
      ),
      { numRuns: 100 }
    );
  });
});
