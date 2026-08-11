import Decimal from "decimal.js";
import type { GrantStatus } from "@/db/schema";

/**
 * Pure budget derivations — remaining budget is NEVER stored, always derived.
 * Kept free of DB imports so it can be unit-tested in isolation.
 */

/** Statuses that count against the pool. Proposed grants do not. */
export const COMMITTED_STATUSES: readonly GrantStatus[] = [
  "approved",
  "issued",
  "cashed",
  "reconciled",
];

export type GrantAmountRow = { status: GrantStatus; amountAwarded: string };

export function poolTotals(pool: {
  totalBudget: string;
  rolloverFromPrior: string;
}): { total: Decimal } {
  return { total: new Decimal(pool.totalBudget).add(pool.rolloverFromPrior) };
}

export function summarizePool(
  pool: { totalBudget: string; rolloverFromPrior: string },
  grants: GrantAmountRow[]
) {
  const { total } = poolTotals(pool);
  let committed = new Decimal(0); // approved but not yet issued
  let deployed = new Decimal(0); // issued/cashed/reconciled
  let count = 0;
  for (const g of grants) {
    if (!COMMITTED_STATUSES.includes(g.status)) continue;
    count++;
    if (g.status === "approved") committed = committed.add(g.amountAwarded);
    else deployed = deployed.add(g.amountAwarded);
  }
  const remaining = total.sub(committed).sub(deployed);
  return {
    total: total.toNumber(),
    committed: committed.toNumber(),
    deployed: deployed.toNumber(),
    remaining: remaining.toNumber(),
    grantCount: count,
  };
}

/**
 * The approve guard: can this grant be approved without overdrawing the pool?
 * `grants` should include all grants in the pool EXCEPT the one being approved.
 */
export function canApprove(
  pool: { totalBudget: string; rolloverFromPrior: string },
  grants: GrantAmountRow[],
  amountAwarded: string
): { ok: boolean; remaining: number; shortfall: number } {
  const { remaining } = summarizePool(pool, grants);
  const after = new Decimal(remaining).sub(amountAwarded);
  return {
    ok: after.gte(0),
    remaining,
    shortfall: after.lt(0) ? after.neg().toNumber() : 0,
  };
}
