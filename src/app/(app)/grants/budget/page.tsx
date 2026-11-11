import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon, PiggyBankIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import {
  getPools,
  getPoolSummary,
  getDeploymentSeries,
  getUseOfFundsBreakdown,
  getCheckStats,
} from "@/lib/queries/grants";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatStrip, StatStripItem } from "@/components/patterns/data-stat-strip";
import { Button } from "@/components/ui/button";
import { PoolSelector } from "@/components/grants/pool-selector";
import { PoolSummaryBand } from "@/components/grants/pool-summary";
import { NewPoolDialog } from "@/components/grants/new-pool-dialog";
import { BudgetCharts } from "@/components/grants/budget-charts";

export const metadata: Metadata = { title: "Budget" };
export const dynamic = "force-dynamic";

const backToGrants = (
  <Link href="/grants" className="inline-flex items-center gap-1 hover:text-fg">
    <ArrowLeftIcon className="size-3" />
    Grants
  </Link>
);

export default async function BudgetPage({ searchParams }: PageProps<"/grants/budget">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const pools = await getPools(ctx.org.id);
  if (pools.length === 0) {
    const canMoney = can(ctx.member.role, "manageMoney");
    const { fiscalYear } = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
    return (
      <div className="pb-10">
        <PageHeader eyebrow={backToGrants} title="Budget" />
        <div className="px-4 md:px-6">
          <EmptyState
            icon={<PiggyBankIcon />}
            title="No pool to budget against yet"
            description="Once a fiscal-year pool exists, this page shows how fast it is being used and what it is being spent on."
            action={canMoney ? <NewPoolDialog defaultFiscalYear={fiscalYear} /> : undefined}
          />
        </div>
      </div>
    );
  }

  const poolId =
    typeof params.pool === "string" && pools.some((p) => p.id === params.pool)
      ? params.pool
      : pools[0].id;

  const [summary, series, breakdown, checks] = await Promise.all([
    getPoolSummary(ctx.org.id, poolId),
    getDeploymentSeries(ctx.org.id, poolId),
    getUseOfFundsBreakdown(ctx.org.id, poolId),
    getCheckStats(ctx.org.id, poolId),
  ]);
  if (!summary) return null;

  // Fiscal year window from org config (e.g. start month 7 → Jul 1..Jun 30).
  const fyStartMonth = ctx.org.fiscalYearStartMonth;
  const fyStart = new Date(Date.UTC(summary.pool.fiscalYear, fyStartMonth - 1, 1));
  const fyEnd = new Date(Date.UTC(summary.pool.fiscalYear + 1, fyStartMonth - 1, 1));

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={backToGrants}
        title="Budget"
        description={`${summary.pool.name} · fiscal year ${summary.pool.fiscalYear}. Every figure is derived from the grants ledger.`}
        actions={
          <>
            <PoolSelector pools={pools} currentPoolId={poolId} />
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/grants?pool=${poolId}`}>Open the ledger</Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3 px-4 md:px-6">
        <PoolSummaryBand summary={summary} />
        <StatStrip variant="card">
          <StatStripItem
            label="Grants approved"
            value={checks.count}
            hint={
              summary.lifecycle.proposed.count > 0
                ? `${summary.lifecycle.proposed.count} more proposed`
                : "none waiting for approval"
            }
          />
          <StatStripItem
            label="Average check"
            value={checks.average ? formatMoney(checks.average) : "—"}
            hint="across approved grants"
          />
          <StatStripItem
            label="Largest check"
            value={checks.largest ? formatMoney(checks.largest) : "—"}
            hint={checks.smallest ? `smallest ${formatMoney(checks.smallest)}` : undefined}
          />
          <StatStripItem
            label="Awaiting reconciliation"
            value={summary.lifecycle.issued.count + summary.lifecycle.cashed.count}
            hint="paid, receipts not yet matched"
            tone={
              summary.lifecycle.issued.count + summary.lifecycle.cashed.count > 0
                ? "warning"
                : "default"
            }
          />
        </StatStrip>
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
