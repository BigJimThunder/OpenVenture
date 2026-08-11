import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/actions/context";
import {
  getFunnel,
  getSourcing,
  getMoneyMix,
  getComposition,
  getPortfolioConstruction,
} from "@/lib/queries/insights";
import { formatPct } from "@/lib/utils";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { InsightsCharts } from "@/components/insights/insights-charts";
import { SectionNav } from "@/components/insights/section-nav";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  ["funnel", "Funnel"],
  ["sourcing", "Sourcing"],
  ["money", "Money"],
  ["composition", "Composition"],
  ["portfolio", "Portfolio"],
] as const;

export default async function InsightsPage() {
  const ctx = await requireCtx();
  const [funnel, sourcing, money, composition, portfolio] = await Promise.all([
    getFunnel(ctx.org.id),
    getSourcing(ctx.org.id),
    getMoneyMix(ctx.org.id),
    getComposition(ctx.org.id),
    getPortfolioConstruction(ctx.org.id),
  ]);

  const totalApps = funnel.stages[0]?.reached ?? 0;
  const funded = funnel.stages.find((s) => s.kind === "won")?.reached ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader
        title="Insights"
        meta={`${seasonLabel()} season`}
        actions={
          <>
            <Kbd>⌘K</Kbd>
            <Link
              href="/members/me/insights"
              className="flex h-6.5 items-center rounded-[5px] border border-border px-2 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
            >
              My investor profile
            </Link>
          </>
        }
      />

      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Stat label="Applications">
          <div className="mt-[3px] flex items-center gap-2.5">
            <span className="tnum text-[15px] font-semibold">{totalApps}</span>
            <Sparkline points={funnel.monthly.map((m) => m.count)} />
          </div>
        </Stat>
        <Divider />
        <Stat label="Funded">
          <div className="tnum mt-[3px] text-[15px] font-semibold">
            {funded}
            {totalApps > 0 && (
              <span className="ml-1 text-2xs font-normal text-fg-subtle">
                · {formatPct(funded / totalApps)} of applicants
              </span>
            )}
          </div>
        </Stat>
        <Divider />
        <Stat label="Portfolio">
          <div className="tnum mt-[3px] text-[15px] font-semibold">
            {portfolio.totalCompanies}
            <span className="ml-1 text-2xs font-normal text-fg-subtle">companies</span>
          </div>
        </Stat>
        <Divider />
        <Stat label="Hit rate">
          <div className="tnum mt-[3px] text-[15px] font-semibold">
            {portfolio.hitRate != null ? formatPct(portfolio.hitRate, 0) : "—"}
            <span className="ml-1 text-2xs font-normal text-fg-subtle">
              · revenue, round, or accelerator
            </span>
          </div>
        </Stat>
      </div>

      <SectionNav sections={SECTIONS.map(([id, label]) => [id, label])} />

      <main className="flex-1 overflow-y-auto px-4 pt-4 pb-12">
        <InsightsCharts
          funnel={funnel}
          sourcing={sourcing}
          money={money}
          composition={composition}
          portfolio={portfolio}
        />
      </main>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-4 first:pl-0 last:pr-0">
      <div className="text-[10.5px] font-medium tracking-[0.06em] uppercase text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-7 w-px shrink-0 bg-border" />;
}

/**
 * Trend at a glance, no axes. Deliberately unlabelled — the exact monthly
 * numbers live in the "Applications per month" chart below.
 */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 36 - ((p - min) / span) * 32;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width="72"
      height="18"
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden
      className="shrink-0"
    >
      <polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="3" />
    </svg>
  );
}

/** Academic year, e.g. "2025–26" — the club's unit of time. */
function seasonLabel(now = new Date()) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}
