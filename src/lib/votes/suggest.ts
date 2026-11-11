import Decimal from "decimal.js";

/**
 * The amount the decision dialog starts from. In order: the median of what
 * fund voters suggested (revealed ballots only — callers pass what
 * getVoteRoundResults returned), the memo's proposed amount, the founder's
 * ask. Decimal throughout; money is never a float.
 */
export type AmountSuggestion = {
  amount: string;
  source: "ballots" | "memo" | "ask";
  /** How many ballots the median is over (ballots source only). */
  basis: number;
};

function positive(value: string | null | undefined): Decimal | null {
  if (value == null || value === "") return null;
  try {
    const d = new Decimal(value);
    return d.isFinite() && d.gt(0) ? d : null;
  } catch {
    return null;
  }
}

export function medianAmount(values: (string | null | undefined)[]): string | null {
  const sorted = values
    .map(positive)
    .filter((d): d is Decimal => d !== null)
    .sort((a, b) => a.cmp(b));
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : sorted[mid - 1].add(sorted[mid]).div(2);
  return median.toDecimalPlaces(2).toFixed(2);
}

export function suggestGrantAmount(input: {
  ballots: { decision: string | null; suggestedAmount: string | null }[];
  memoProposedAmount: string | null;
  amountRequested: string | null;
}): AmountSuggestion | null {
  const fundSuggestions = input.ballots
    .filter((b) => b.decision === "fund" && positive(b.suggestedAmount))
    .map((b) => b.suggestedAmount);
  const median = medianAmount(fundSuggestions);
  if (median) return { amount: median, source: "ballots", basis: fundSuggestions.length };

  const memo = positive(input.memoProposedAmount);
  if (memo) return { amount: memo.toFixed(2), source: "memo", basis: 0 };

  const ask = positive(input.amountRequested);
  if (ask) return { amount: ask.toFixed(2), source: "ask", basis: 0 };

  return null;
}
