import { OUTCOME_TIERS, type OutcomeTier } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { TIER_META, FIRST_MEANINGFUL_TIER } from "./tiers";

/**
 * The outcome ladder, top rung first. There is no equity, so there is no
 * multiple to report — success is how far up a company climbed. Two colors
 * carry the one distinction that matters: above or below "meaningful".
 */
export function TierLadder({
  distribution,
  className,
}: {
  distribution: { tier: OutcomeTier; count: number; dollars: number }[];
  className?: string;
}) {
  const byTier = new Map(distribution.map((d) => [d.tier, d]));
  const max = Math.max(1, ...distribution.map((d) => d.count));
  const lineAt = OUTCOME_TIERS.indexOf(FIRST_MEANINGFUL_TIER);
  const rungs = [...OUTCOME_TIERS].reverse();

  return (
    <ol className={cn("flex flex-col", className)}>
      {rungs.map((tier) => {
        const d = byTier.get(tier);
        const count = d?.count ?? 0;
        const meaningful = OUTCOME_TIERS.indexOf(tier) >= lineAt;
        return (
          <li key={tier}>
            <div className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 px-3.5 py-2 sm:grid-cols-[minmax(0,13rem)_1fr_auto]">
              <div className="min-w-0">
                <div className={cn("truncate text-sm", count > 0 ? "font-medium" : "text-fg-muted")}>
                  {TIER_META[tier].label}
                </div>
                <div className="truncate text-2xs text-fg-subtle">{TIER_META[tier].blurb}</div>
              </div>
              <div className="h-2 rounded-full bg-bg-subtle">
                {count > 0 && (
                  <div
                    className="h-full min-w-[3px] rounded-full"
                    style={{
                      width: `${(count / max) * 100}%`,
                      background: meaningful ? "var(--cat-1)" : "var(--cat-10)",
                    }}
                  />
                )}
              </div>
              <div className="tnum w-24 text-right text-xs text-fg-muted">
                <span className={cn("font-medium", count > 0 ? "text-fg" : "text-fg-subtle")}>{count}</span>
                {d && d.dollars > 0 && <span> · {formatMoney(d.dollars)}</span>}
              </div>
            </div>
            {tier === FIRST_MEANINGFUL_TIER && (
              <div className="flex items-center gap-2 px-3.5 py-1" aria-hidden>
                <span className="h-px flex-1 border-t border-dashed border-border-strong" />
                <span className="text-2xs text-fg-subtle">above this line counts as a meaningful outcome</span>
                <span className="h-px flex-1 border-t border-dashed border-border-strong" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
