import type { PoolSummary } from "@/lib/queries/grants";
import { cn, formatMoney, formatPct } from "@/lib/utils";
import { SegmentBar, SegmentLegend, type Segment } from "@/components/patterns/data-segment-bar";

/**
 * The pool at a glance: what is left, and where the rest went. Remaining is
 * the headline because it is the number every grant decision is made against;
 * it is derived by the query on every load, never stored.
 */
export function PoolSummaryBand({ summary }: { summary: PoolSummary }) {
  const rollover = Number(summary.pool.rolloverFromPrior);
  const overdrawn = summary.remaining < 0;
  const segments: Segment[] = [
    {
      key: "deployed",
      label: "Deployed",
      fraction: summary.shares.deployed,
      color: "var(--cat-1)",
      value: formatMoney(summary.deployed),
    },
    {
      key: "committed",
      label: "Committed, not yet paid",
      fraction: summary.shares.committed,
      color: "var(--cat-3)",
      value: formatMoney(summary.committed),
    },
    {
      key: "remaining",
      label: "Remaining",
      fraction: summary.shares.remaining,
      color: "var(--border-strong)",
      value: formatMoney(summary.remaining),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-panel p-4 shadow-xs">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="text-xs text-fg-muted">Remaining in {summary.pool.name}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={cn("tnum text-xl font-semibold tracking-tight", overdrawn && "text-danger")}
            >
              {formatMoney(summary.remaining)}
            </span>
            <span className="tnum text-sm text-fg-muted">of {formatMoney(summary.total)}</span>
          </div>
        </div>
        <div className="tnum text-xs text-fg-subtle sm:text-right">
          <div>
            {formatPct(summary.shares.deployed + summary.shares.committed, 0)} spoken for across{" "}
            {summary.grantCount} {summary.grantCount === 1 ? "grant" : "grants"}
          </div>
          {rollover > 0 && <div>Pool includes {formatMoney(rollover)} rolled over from last year</div>}
        </div>
      </div>
      <SegmentBar segments={segments} label="How the pool is allocated" className="mt-3.5" />
      <SegmentLegend segments={segments} className="mt-2.5" />
    </section>
  );
}
