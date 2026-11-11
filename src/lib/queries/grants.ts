import { and, eq, desc, asc, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  grant,
  grantPool,
  receipt,
  company,
  application,
  member,
  outcomeUpdate,
  pipelineStage,
} from "@/db/schema";
import Decimal from "decimal.js";
import type { GrantStatus } from "@/db/schema";
import { summarizePool, canApprove, COMMITTED_STATUSES } from "@/lib/grants/budget";

export async function getPools(orgId: string) {
  return db
    .select()
    .from(grantPool)
    .where(eq(grantPool.orgId, orgId))
    .orderBy(desc(grantPool.fiscalYear));
}

export async function getPoolSummary(orgId: string, poolId: string) {
  const [pool] = await db
    .select()
    .from(grantPool)
    .where(and(eq(grantPool.id, poolId), eq(grantPool.orgId, orgId)))
    .limit(1);
  if (!pool) return null;
  const rows = await db
    .select({ id: grant.id, status: grant.status, amountAwarded: grant.amountAwarded })
    .from(grant)
    .where(eq(grant.poolId, poolId));
  const summary = summarizePool(pool, rows);

  // Lifecycle roll-up for the status pipeline: count and dollars per status.
  const lifecycle = {} as Record<GrantStatus, { count: number; total: string }>;
  for (const status of ["proposed", "approved", "issued", "cashed", "reconciled", "cancelled"] as const) {
    const inStatus = rows.filter((r) => r.status === status);
    lifecycle[status] = {
      count: inStatus.length,
      total: inStatus.reduce((sum, r) => sum.add(r.amountAwarded), new Decimal(0)).toFixed(2),
    };
  }

  // What approving each proposed grant would do to the pool — computed here so
  // the UI can explain the over-pool guard BEFORE the click, with no client math.
  // Proposed grants don't count against the pool, so "the rest" is every row.
  const approvals: Record<string, { ok: boolean; remaining: number; after: number; shortfall: number }> = {};
  for (const r of rows) {
    if (r.status !== "proposed") continue;
    const check = canApprove(pool, rows, r.amountAwarded);
    approvals[r.id] = {
      ...check,
      after: new Decimal(check.remaining).sub(r.amountAwarded).toNumber(),
    };
  }

  return {
    pool,
    ...summary,
    lifecycle,
    approvals,
    /** Shares of the pool for the part-of-whole bar, 0..1 each. */
    shares:
      summary.total > 0
        ? {
            deployed: summary.deployed / summary.total,
            committed: summary.committed / summary.total,
            remaining: Math.max(0, summary.remaining) / summary.total,
          }
        : { deployed: 0, committed: 0, remaining: 0 },
  };
}

export type PoolSummary = NonNullable<Awaited<ReturnType<typeof getPoolSummary>>>;

export async function getGrantsList(orgId: string, poolId?: string) {
  // NB: correlated subquery — fully qualify columns (see dashboard.ts note).
  return db
    .select({
      id: grant.id,
      status: grant.status,
      amountRequested: grant.amountRequested,
      amountAwarded: grant.amountAwarded,
      useOfFunds: grant.useOfFunds,
      useOfFundsNarrative: grant.useOfFundsNarrative,
      cashedAt: grant.cashedAt,
      paymentMethod: grant.paymentMethod,
      paymentRef: grant.paymentRef,
      approvedAt: grant.approvedAt,
      issuedAt: grant.issuedAt,
      reconciledAt: grant.reconciledAt,
      createdAt: grant.createdAt,
      applicationId: grant.applicationId,
      companyId: company.id,
      companyName: company.name,
      companyLogoUrl: company.logoUrl,
      poolId: grant.poolId,
      poolName: grantPool.name,
      approvedByName: member.displayName,
      receiptTotal: sql<string>`coalesce((
        select sum(${receipt}."amount") from ${receipt}
        where ${receipt}."grant_id" = ${grant}."id"
      ), 0)`,
      receiptCount: sql<number>`(
        select count(*)::int from ${receipt}
        where ${receipt}."grant_id" = ${grant}."id"
      )`,
    })
    .from(grant)
    .innerJoin(company, eq(grant.companyId, company.id))
    .innerJoin(grantPool, eq(grant.poolId, grantPool.id))
    .leftJoin(member, eq(grant.approvedByMemberId, member.id))
    .where(and(eq(grant.orgId, orgId), poolId ? eq(grant.poolId, poolId) : undefined))
    .orderBy(desc(grant.createdAt));
}

export type GrantRow = Awaited<ReturnType<typeof getGrantsList>>[number];

/** Every receipt filed against a pool's grants, keyed by grant — for the ledger's per-grant drawer. */
export async function getReceiptsByGrant(orgId: string, poolId: string) {
  const rows = await db
    .select({
      id: receipt.id,
      grantId: receipt.grantId,
      amount: receipt.amount,
      vendor: receipt.vendor,
      description: receipt.description,
      submittedAt: receipt.submittedAt,
      verifiedAt: receipt.verifiedAt,
    })
    .from(receipt)
    .innerJoin(grant, eq(receipt.grantId, grant.id))
    .where(and(eq(receipt.orgId, orgId), eq(grant.poolId, poolId)))
    .orderBy(desc(receipt.submittedAt));
  const byGrant: Record<string, typeof rows> = {};
  for (const r of rows) (byGrant[r.grantId] ??= []).push(r);
  return byGrant;
}

export type ReceiptRow = Awaited<ReturnType<typeof getReceiptsByGrant>>[string][number];

export async function getReceipts(orgId: string, grantId: string) {
  return db
    .select({
      id: receipt.id,
      amount: receipt.amount,
      vendor: receipt.vendor,
      description: receipt.description,
      submittedAt: receipt.submittedAt,
      verifiedAt: receipt.verifiedAt,
      verifiedByName: member.displayName,
    })
    .from(receipt)
    .leftJoin(member, eq(receipt.verifiedByMemberId, member.id))
    .where(and(eq(receipt.orgId, orgId), eq(receipt.grantId, grantId)))
    .orderBy(desc(receipt.submittedAt));
}

/** Monthly cumulative deployment for the burn-down (issued+ statuses, by issue date). */
export async function getDeploymentSeries(orgId: string, poolId: string) {
  const rows = await db
    .select({ issuedAt: grant.issuedAt, amountAwarded: grant.amountAwarded })
    .from(grant)
    .where(
      and(
        eq(grant.orgId, orgId),
        eq(grant.poolId, poolId),
        inArray(grant.status, ["issued", "cashed", "reconciled"])
      )
    )
    .orderBy(asc(grant.issuedAt));
  return rows.filter((r) => r.issuedAt != null) as { issuedAt: Date; amountAwarded: string }[];
}

export async function getUseOfFundsBreakdown(orgId: string, poolId: string) {
  return db
    .select({
      useOfFunds: grant.useOfFunds,
      total: sql<string>`sum(${grant.amountAwarded})`,
      count: sql<number>`count(*)::int`,
    })
    .from(grant)
    .where(
      and(
        eq(grant.orgId, orgId),
        eq(grant.poolId, poolId),
        inArray(grant.status, [...COMMITTED_STATUSES])
      )
    )
    .groupBy(grant.useOfFunds);
}

/** Check-size facts for the budget page (committed statuses only). */
export async function getCheckStats(orgId: string, poolId: string) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      average: sql<string | null>`round(avg(${grant.amountAwarded}), 2)`,
      largest: sql<string | null>`max(${grant.amountAwarded})`,
      smallest: sql<string | null>`min(${grant.amountAwarded})`,
    })
    .from(grant)
    .where(
      and(
        eq(grant.orgId, orgId),
        eq(grant.poolId, poolId),
        inArray(grant.status, [...COMMITTED_STATUSES])
      )
    );
  return row ?? { count: 0, average: null, largest: null, smallest: null };
}

/** Applications eligible for a new grant: open + late-stage (or funded), no existing live grant. */
export async function getGrantableApplications(orgId: string) {
  return db
    .select({
      id: application.id,
      companyId: application.companyId,
      companyName: company.name,
      amountRequested: application.amountRequested,
      useOfFundsNarrative: application.useOfFundsNarrative,
      stageName: pipelineStage.name,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
    .where(
      and(
        eq(application.orgId, orgId),
        isNull(application.archivedAt),
        inArray(application.status, ["open", "funded"]),
        sql`not exists (
          select 1 from ${grant}
          where ${grant}."application_id" = ${application}."id"
            and ${grant}."status" != 'cancelled'
        )`
      )
    )
    .orderBy(desc(application.appliedAt));
}

export async function getOutcomesList(orgId: string) {
  return db
    .select({
      companyId: company.id,
      companyName: company.name,
      oneLiner: company.oneLiner,
      outcomeTier: company.outcomeTier,
      outcomeUpdatedAt: company.outcomeUpdatedAt,
      grantTotal: sql<string>`coalesce((
        select sum(${grant}."amount_awarded") from ${grant}
        where ${grant}."company_id" = ${company}."id"
          and ${grant}."status" in ('issued','cashed','reconciled')
      ), 0)`,
      firstIssuedAt: sql<string | null>`(
        select min(${grant}."issued_at") from ${grant}
        where ${grant}."company_id" = ${company}."id"
          and ${grant}."issued_at" is not null
      )`,
    })
    .from(company)
    .where(
      and(eq(company.orgId, orgId), eq(company.status, "portfolio"), isNull(company.archivedAt))
    )
    .orderBy(asc(company.name));
}

export async function getOutcomeHistory(orgId: string, companyId: string) {
  return db
    .select({
      id: outcomeUpdate.id,
      tier: outcomeUpdate.tier,
      note: outcomeUpdate.note,
      recordedAt: outcomeUpdate.recordedAt,
      recordedByName: member.displayName,
    })
    .from(outcomeUpdate)
    .leftJoin(member, eq(outcomeUpdate.recordedByMemberId, member.id))
    .where(and(eq(outcomeUpdate.orgId, orgId), eq(outcomeUpdate.companyId, companyId)))
    .orderBy(desc(outcomeUpdate.recordedAt));
}
