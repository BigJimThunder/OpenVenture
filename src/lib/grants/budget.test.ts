import { describe, it, expect } from "vitest";
import { summarizePool, canApprove } from "./budget";

const pool = { totalBudget: "10000", rolloverFromPrior: "850" };

describe("summarizePool", () => {
  it("derives committed vs deployed vs remaining", () => {
    const s = summarizePool(pool, [
      { status: "proposed", amountAwarded: "9999" }, // ignored
      { status: "approved", amountAwarded: "1500" },
      { status: "issued", amountAwarded: "2000" },
      { status: "cashed", amountAwarded: "750" },
      { status: "reconciled", amountAwarded: "1200" },
      { status: "cancelled", amountAwarded: "4000" }, // ignored
    ]);
    expect(s.total).toBe(10850);
    expect(s.committed).toBe(1500);
    expect(s.deployed).toBe(3950);
    expect(s.remaining).toBe(10850 - 1500 - 3950);
    expect(s.grantCount).toBe(4);
  });

  it("handles decimal cents without float drift", () => {
    const s = summarizePool({ totalBudget: "100.10", rolloverFromPrior: "0" }, [
      { status: "issued", amountAwarded: "33.37" },
      { status: "issued", amountAwarded: "33.37" },
      { status: "issued", amountAwarded: "33.36" },
    ]);
    expect(s.remaining).toBe(0);
  });
});

describe("canApprove (the overdraw guard)", () => {
  it("approves when the pool covers it", () => {
    const r = canApprove(pool, [{ status: "issued", amountAwarded: "9000" }], "1850");
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(1850);
  });

  it("rejects with the exact shortfall when it would overdraw", () => {
    const r = canApprove(pool, [{ status: "issued", amountAwarded: "9000" }], "2000");
    expect(r.ok).toBe(false);
    expect(r.shortfall).toBe(150);
  });

  it("proposed grants don't reserve budget", () => {
    const r = canApprove(pool, [{ status: "proposed", amountAwarded: "99999" }], "10850");
    expect(r.ok).toBe(true);
  });
});
