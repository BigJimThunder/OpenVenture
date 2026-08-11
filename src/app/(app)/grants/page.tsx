import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3Icon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import {
  getPools,
  getPoolSummary,
  getGrantsList,
  getGrantableApplications,
} from "@/lib/queries/grants";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { GrantsTable } from "@/components/grants/grants-table";
import { NewGrantDialog } from "@/components/grants/new-grant-dialog";
import { NewPoolDialog } from "@/components/grants/new-pool-dialog";
import { PoolSelector } from "@/components/grants/pool-selector";
import { currentFiscalQuarter } from "@/lib/queries/reports";

export const metadata: Metadata = { title: "Grants" };
export const dynamic = "force-dynamic";

export default async function GrantsPage({ searchParams }: PageProps<"/grants">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const pools = await getPools(ctx.org.id);

  if (pools.length === 0) {
    const isAdmin = ctx.member.role === "admin";
    const { fiscalYear } = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
    return (
      <div>
        <PageHeader
          title="Grants"
          actions={isAdmin ? <NewPoolDialog defaultFiscalYear={fiscalYear} /> : undefined}
        />
        <div className="px-6">
          <EmptyState
            title="No grant pool yet"
            description={
              isAdmin
                ? "Create the fiscal-year pool to start granting."
                : "An admin can create the fiscal-year pool from Settings."
            }
          />
        </div>
      </div>
    );
  }

  const poolId =
    typeof params.pool === "string" && pools.some((p) => p.id === params.pool)
      ? params.pool
      : pools[0].id;

  const [summary, grants, grantable] = await Promise.all([
    getPoolSummary(ctx.org.id, poolId),
    getGrantsList(ctx.org.id, poolId),
    getGrantableApplications(ctx.org.id),
  ]);

  return (
    <div className="pb-10">
      <PageHeader
        title="Grants"
        description="Propose → approve → issue → reconcile. Approvals are budget-guarded."
        actions={
          <>
            <PoolSelector pools={pools} currentPoolId={poolId} />
            <Button variant="secondary" size="sm" asChild>
              <Link href="/grants/budget">
                <BarChart3Icon />
                Budget
              </Link>
            </Button>
            <NewGrantDialog pools={pools} defaultPoolId={poolId} applications={grantable} />
          </>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-4">
          <StatCard
            label="Budget"
            value={formatMoney(summary.total)}
            hint={
              Number(summary.pool.rolloverFromPrior) > 0
                ? `incl. ${formatMoney(summary.pool.rolloverFromPrior)} rollover`
                : summary.pool.name
            }
          />
          <StatCard
            label="Committed"
            value={formatMoney(summary.committed)}
            hint="approved, not yet issued"
          />
          <StatCard
            label="Deployed"
            value={formatMoney(summary.deployed)}
            hint="issued, cashed, reconciled"
          />
          <StatCard
            label="Remaining"
            value={formatMoney(summary.remaining)}
            hint={`${summary.grantCount} grants against this pool`}
          />
        </div>
      )}

      <div className="px-6">
        {grants.length === 0 ? (
          <EmptyState
            title="No grants in this pool yet"
            description="Propose a grant from a late-stage application — the group decides, you record it here."
          />
        ) : (
          <GrantsTable grants={grants} viewerRole={ctx.member.role} />
        )}
      </div>
    </div>
  );
}
