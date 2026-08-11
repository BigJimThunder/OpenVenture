import type { Metadata } from "next";
import Link from "next/link";
import { UserIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import {
  getFunnel,
  getSourcing,
  getMoneyMix,
  getComposition,
  getPortfolioConstruction,
} from "@/lib/queries/insights";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { Button } from "@/components/ui/button";
import { InsightsCharts } from "@/components/insights/insights-charts";
import { formatPct } from "@/lib/utils";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

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
    <div className="pb-10">
      <PageHeader
        title="Insights"
        description="Where deal flow comes from, what the club says yes to, and how the portfolio is really doing."
        actions={
          <Button variant="secondary" size="sm" asChild>
            <Link href="/members/me/insights">
              <UserIcon />
              My investor profile
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-4">
        <StatCard label="Applications" value={totalApps} hint="all time" />
        <StatCard
          label="Funded"
          value={funded}
          hint={totalApps > 0 ? `${formatPct(funded / totalApps)} of applicants` : undefined}
        />
        <StatCard label="Portfolio companies" value={portfolio.totalCompanies} />
        <StatCard
          label="Hit rate"
          value={portfolio.hitRate != null ? formatPct(portfolio.hitRate, 0) : "—"}
          hint="reached revenue, a round, or an accelerator"
        />
      </div>

      <div className="px-6">
        <InsightsCharts
          funnel={funnel}
          sourcing={sourcing}
          money={money}
          composition={composition}
          portfolio={portfolio}
        />
      </div>
    </div>
  );
}
