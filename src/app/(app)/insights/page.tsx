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
import { formatPct, seasonLabel, seasonStartYear } from "@/lib/utils";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { StatStrip, StatStripItem } from "@/components/patterns/data-stat-strip";
import { InsightsCharts } from "@/components/insights/insights-charts";
import { SectionNav } from "@/components/insights/section-nav";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const SECTIONS: [string, string][] = [
  ["funnel", "Funnel"],
  ["sourcing", "Sourcing"],
  ["money", "Money"],
  ["composition", "Composition"],
  ["portfolio", "Portfolio"],
];

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
        meta={`All time · ${seasonLabel(seasonStartYear(new Date()))} season`}
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/members/me/insights">My investor profile</Link>
          </Button>
        }
      />

      <div id="insights-scroll" className="flex-1 overflow-y-auto">
        <StatStrip>
          <StatStripItem label="Applications" value={totalApps} hint="received, all time" />
          <StatStripItem
            label="Funded"
            value={funded}
            hint={totalApps > 0 ? `${formatPct(funded / totalApps, 0)} of applicants` : "none yet"}
          />
          <StatStripItem
            label="Portfolio"
            value={portfolio.totalCompanies}
            hint={portfolio.totalCompanies === 1 ? "company funded" : "companies funded"}
          />
          <StatStripItem
            label="Meaningful outcomes"
            value={portfolio.hitRate != null ? formatPct(portfolio.hitRate, 0) : "—"}
            hint="reached revenue or better"
          />
        </StatStrip>

        <SectionNav sections={SECTIONS} />

        <div className="px-4 pt-5 pb-12 md:px-5">
          <InsightsCharts
            funnel={funnel}
            sourcing={sourcing}
            money={money}
            composition={composition}
            portfolio={portfolio}
          />
        </div>
      </div>
    </div>
  );
}
