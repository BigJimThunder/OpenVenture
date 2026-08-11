import { and, eq, gte, lt, lte, inArray, sql, asc, desc, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  company,
  grant,
  grantPool,
  outcomeUpdate,
  doc,
} from "@/db/schema";
import { summarizePool } from "@/lib/grants/budget";

/**
 * Fiscal quarters from the org's fiscal-year start month. Quarter 1 begins
 * at fiscalYearStartMonth of `fiscalYear`.
 */
export function quarterWindow(fiscalYear: number, quarter: 1 | 2 | 3 | 4, fyStartMonth: number) {
  const startMonth = fyStartMonth - 1 + (quarter - 1) * 3;
  const start = new Date(Date.UTC(fiscalYear, startMonth, 1));
  const end = new Date(Date.UTC(fiscalYear, startMonth + 3, 1));
  return { start, end };
}

export function currentFiscalQuarter(fyStartMonth: number, now = new Date()) {
  const m = now.getUTCMonth(); // 0-11
  const monthsSinceFyStart = (m - (fyStartMonth - 1) + 12) % 12;
  const quarter = (Math.floor(monthsSinceFyStart / 3) + 1) as 1 | 2 | 3 | 4;
  const fiscalYear = m >= fyStartMonth - 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return { fiscalYear, quarter };
}

export async function getQuarterlyReport(
  orgId: string,
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4,
  fyStartMonth: number
) {
  const { start, end } = quarterWindow(fiscalYear, quarter, fyStartMonth);

  const [received, decided, grantsInQuarter, pools, tierMoves, portfolioNow, commentary] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(application)
        .where(
          and(
            eq(application.orgId, orgId),
            gte(application.appliedAt, start),
            lt(application.appliedAt, end)
          )
        ),
      db
        .select({
          funded: sql<number>`count(*) filter (where ${application.status} = 'funded')::int`,
          declined: sql<number>`count(*) filter (where ${application.status} = 'declined')::int`,
        })
        .from(application)
        .where(
          and(
            eq(application.orgId, orgId),
            gte(application.decidedAt, start),
            lt(application.decidedAt, end)
          )
        ),
      db
        .select({
          id: grant.id,
          companyName: company.name,
          amountAwarded: grant.amountAwarded,
          useOfFunds: grant.useOfFunds,
          issuedAt: grant.issuedAt,
        })
        .from(grant)
        .innerJoin(company, eq(grant.companyId, company.id))
        .where(
          and(eq(grant.orgId, orgId), gte(grant.issuedAt, start), lt(grant.issuedAt, end))
        )
        .orderBy(asc(grant.issuedAt)),
      db.select().from(grantPool).where(eq(grantPool.orgId, orgId)).orderBy(desc(grantPool.fiscalYear)),
      db
        .select({
          companyName: company.name,
          tier: outcomeUpdate.tier,
          recordedAt: outcomeUpdate.recordedAt,
          note: outcomeUpdate.note,
        })
        .from(outcomeUpdate)
        .innerJoin(company, eq(outcomeUpdate.companyId, company.id))
        .where(
          and(
            eq(outcomeUpdate.orgId, orgId),
            gte(outcomeUpdate.recordedAt, start),
            lt(outcomeUpdate.recordedAt, end)
          )
        )
        .orderBy(asc(outcomeUpdate.recordedAt)),
      db
        .select({ tier: company.outcomeTier, count: sql<number>`count(*)::int` })
        .from(company)
        .where(and(eq(company.orgId, orgId), eq(company.status, "portfolio")))
        .groupBy(company.outcomeTier),
      db
        .select()
        .from(doc)
        .where(
          and(
            eq(doc.orgId, orgId),
            eq(doc.slug, `lp-report-${fiscalYear}-q${quarter}`),
            isNull(doc.archivedAt)
          )
        )
        .limit(1),
    ]);

  // Pool state AS OF quarter end: only grants approved/issued before end.
  const activePool = pools.find((p) => p.fiscalYear === fiscalYear) ?? pools[0] ?? null;
  let poolSummary = null;
  if (activePool) {
    const rows = await db
      .select({ status: grant.status, amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(
        and(
          eq(grant.poolId, activePool.id),
          inArray(grant.status, ["approved", "issued", "cashed", "reconciled"]),
          lte(grant.approvedAt, end)
        )
      );
    poolSummary = { pool: activePool, ...summarizePool(activePool, rows) };
  }

  const quarterDollars = grantsInQuarter.reduce((n, g) => n + Number(g.amountAwarded), 0);

  return {
    window: { start, end },
    applicationsReceived: received[0]?.count ?? 0,
    funded: decided[0]?.funded ?? 0,
    declined: decided[0]?.declined ?? 0,
    grants: grantsInQuarter,
    quarterDollars,
    poolSummary,
    tierMoves,
    portfolioNow,
    commentaryDoc: commentary[0] ?? null,
  };
}
