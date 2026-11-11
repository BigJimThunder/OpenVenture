import { describe, expect, it } from "vitest";
import { medianAmount, suggestGrantAmount } from "./suggest";

describe("medianAmount", () => {
  it("takes the middle of an odd set and the mean of the middle pair of an even set", () => {
    expect(medianAmount(["500", "1200", "2000"])).toBe("1200.00");
    expect(medianAmount(["500", "1000", "1500", "4000"])).toBe("1250.00");
  });
  it("ignores blanks, zero and junk", () => {
    expect(medianAmount([null, "", "0", "abc", "750.50"])).toBe("750.50");
    expect(medianAmount([null, ""])).toBeNull();
  });
  it("does not pick up float error", () => {
    expect(medianAmount(["0.10", "0.20"])).toBe("0.15");
  });
});

describe("suggestGrantAmount", () => {
  const base = { memoProposedAmount: "1500.00", amountRequested: "2000.00" };

  it("prefers the median of fund ballots, ignoring decline and abstain suggestions", () => {
    expect(
      suggestGrantAmount({
        ...base,
        ballots: [
          { decision: "fund", suggestedAmount: "1000" },
          { decision: "fund", suggestedAmount: "1400" },
          { decision: "decline", suggestedAmount: "50" },
          { decision: "abstain", suggestedAmount: "9999" },
          { decision: "fund", suggestedAmount: null },
        ],
      })
    ).toEqual({ amount: "1200.00", source: "ballots", basis: 2 });
  });

  it("falls back to the memo, then the ask, then nothing", () => {
    expect(suggestGrantAmount({ ...base, ballots: [] })).toEqual({
      amount: "1500.00",
      source: "memo",
      basis: 0,
    });
    expect(suggestGrantAmount({ ballots: [], memoProposedAmount: null, amountRequested: "2000" })).toEqual({
      amount: "2000.00",
      source: "ask",
      basis: 0,
    });
    expect(suggestGrantAmount({ ballots: [], memoProposedAmount: null, amountRequested: null })).toBeNull();
  });
});
