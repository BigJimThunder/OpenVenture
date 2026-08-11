import type { Metadata } from "next";
import { requireCtx } from "@/lib/actions/context";
import {
  getPools,
  getPoolSummary,
  getDeploymentSeries,
  getUseOfFundsBreakdown,
} from "@/lib/queries/grants";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { PoolSelector } from "@/components/grants/pool-selector";
import { BudgetCharts } from "@/components/grants/budget-charts";

export const metadata: Metadata = { title: "Budget" };
export const dynamic = "force-dynamic";

export default async function BudgetPage({ searchParams }: PageProps<"/grants/budget">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const pools = await getPools(ctx.org.id);
  if (pools.length === 0) {
    return (
      <div>
        <PageHeader title="Budget" />
        <div className="px-6">
          <EmptyState title="No grant pool yet" description="Create one from Settings." />
        </div>
      </div>
    );
  }

  const poolId =
    typeof params.pool === "string" && pools.some((p) => p.id === params.pool)
      ? params.pool
      : pools[0].id;

  const [summary, series, breakdown] = await Promise.all([
    getPoolSummary(ctx.org.id, poolId),
    getDeploymentSeries(ctx.org.id, poolId),
    getUseOfFundsBreakdown(ctx.org.id, poolId),
  ]);
  if (!summary) return null;

  // Fiscal year window from org config (e.g. start month 7 → Jul 1..Jun 30).
  const fyStartMonth = ctx.org.fiscalYearStartMonth;
  const fyStart = new Date(Date.UTC(summary.pool.fiscalYear, fyStartMonth - 1, 1));
  const fyEnd = new Date(Date.UTC(summary.pool.fiscalYear + 1, fyStartMonth - 1, 1));

  return (
    <div className="pb-10">
      <PageHeader
        title="Budget"
        description={`${summary.pool.name} · fiscal year ${summary.pool.fiscalYear}`}
        actions={<PoolSelector pools={pools} currentPoolId={poolId} />}
      />
      <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-4">
        <StatCard label="Budget" value={formatMoney(summary.total)} />
        <StatCard label="Committed" value={formatMoney(summary.committed)} />
        <StatCard label="Deployed" value={formatMoney(summary.deployed)} />
        <StatCard
          label="Remaining"
          value={formatMoney(summary.remaining)}
          hint={`${Math.round(((summary.total - summary.remaining) / summary.total) * 100)}% of pool used`}
        />
      </div>
      <div className="px-6">
        <BudgetCharts
          total={summary.total}
          series={series.map((s) => ({
            issuedAt: s.issuedAt.toISOString(),
            amount: Number(s.amountAwarded),
          }))}
          breakdown={breakdown.map((b) => ({
            useOfFunds: b.useOfFunds,
            total: Number(b.total),
            count: b.count,
          }))}
          fyStart={fyStart.toISOString()}
          fyEnd={fyEnd.toISOString()}
        />
      </div>
    </div>
  );
}
