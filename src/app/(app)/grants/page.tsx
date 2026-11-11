import type { Metadata } from "next";
import Link from "next/link";
import { BanknoteIcon, BarChart3Icon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import {
  getPools,
  getPoolSummary,
  getGrantsList,
  getReceiptsByGrant,
  getGrantableApplications,
} from "@/lib/queries/grants";
import { currentFiscalQuarter } from "@/lib/queries/reports";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { GrantsTable } from "@/components/grants/grants-table";
import { NewGrantDialog } from "@/components/grants/new-grant-dialog";
import { NewPoolDialog } from "@/components/grants/new-pool-dialog";
import { PoolSelector } from "@/components/grants/pool-selector";
import { PoolSummaryBand } from "@/components/grants/pool-summary";

export const metadata: Metadata = { title: "Grants" };
export const dynamic = "force-dynamic";

const LIFECYCLE_STEPS = [
  "Anyone on the team proposes a grant from an application the club voted to fund.",
  "An admin approves it. That reserves the money, and is blocked if it would overdraw the pool.",
  "An admin issues the payment and records the check number or transfer ID.",
  "A partner marks it cashed, files the founder's receipts and reconciles it against the bank statement.",
];

export default async function GrantsPage({ searchParams }: PageProps<"/grants">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const pools = await getPools(ctx.org.id);
  const canMoney = can(ctx.member.role, "manageMoney");
  const canContribute = can(ctx.member.role, "contribute");

  if (pools.length === 0) {
    const { fiscalYear } = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
    return (
      <div className="pb-10">
        <PageHeader title="Grants" description="Every dollar the club gives away, from proposal to reconciled." />
        <div className="px-4 md:px-6">
          <EmptyState
            icon={<BanknoteIcon />}
            title="Start with this year's pool"
            description={
              canMoney
                ? "A pool is the year's budget. Every grant is approved against it, and what remains is always worked out from the grants themselves."
                : "A pool is the year's budget, and grants are approved against it. An admin needs to create the first one before anything can be proposed."
            }
            steps={LIFECYCLE_STEPS}
            action={canMoney ? <NewPoolDialog defaultFiscalYear={fiscalYear} /> : undefined}
            secondaryAction={
              canMoney ? undefined : (
                <Button asChild variant="secondary">
                  <Link href="/members">See who the admins are</Link>
                </Button>
              )
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

  const [summary, grants, receipts, grantable] = await Promise.all([
    getPoolSummary(ctx.org.id, poolId),
    getGrantsList(ctx.org.id, poolId),
    getReceiptsByGrant(ctx.org.id, poolId),
    canContribute ? getGrantableApplications(ctx.org.id) : [],
  ]);
  if (!summary) return null;

  const newGrant = canContribute ? (
    <NewGrantDialog
      pools={pools}
      defaultPoolId={poolId}
      applications={grantable}
      remaining={summary.remaining}
    />
  ) : null;

  return (
    <div className="pb-10">
      <PageHeader
        title="Grants"
        description="Every dollar the club gives away, from proposal to reconciled against the bank statement."
        actions={
          <>
            <PoolSelector pools={pools} currentPoolId={poolId} />
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/grants/budget?pool=${poolId}`}>
                <BarChart3Icon />
                Budget
              </Link>
            </Button>
            {newGrant}
          </>
        }
      />

      <div className="flex flex-col gap-3 px-4 md:px-6">
        <PoolSummaryBand summary={summary} />

        {grants.length === 0 ? (
          <EmptyState
            icon={<BanknoteIcon />}
            title="No grants against this pool yet"
            description="A grant starts as a proposal attached to an application, and moves through four hands-on steps before it is closed."
            steps={LIFECYCLE_STEPS}
            action={newGrant ?? undefined}
          />
        ) : (
          <GrantsTable
            grants={grants}
            receipts={receipts}
            lifecycle={summary.lifecycle}
            approvals={summary.approvals}
          />
        )}
      </div>
    </div>
  );
}
