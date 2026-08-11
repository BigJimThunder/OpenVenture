import { and, eq, asc, desc, isNotNull, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  applicationDemographics,
  company,
  companySector,
  sector,
  pipelineStage,
  stageHistory,
  member,
  grant,
  outcomeUpdate,
  vote,
  voteRound,
  OUTCOME_TIERS,
  type OutcomeTier,
} from "@/db/schema";
import { kAnonymize, type Bucket } from "@/lib/insights/k-anonymize";
import type { OutcomeBallot } from "@/lib/insights/calibration";

/** Stage-by-stage funnel: how many applications ever REACHED each stage. */
export async function getFunnel(orgId: string) {
  const [stages, reached, monthly, declines] = await Promise.all([
    db
      .select()
      .from(pipelineStage)
      .where(eq(pipelineStage.orgId, orgId))
      .orderBy(asc(pipelineStage.position)),
    db
      .select({
        stageId: stageHistory.toStageId,
        count: sql<number>`count(distinct ${stageHistory.applicationId})::int`,
        medianDays: sql<number | null>`percentile_cont(0.5) within group (
          order by ${stageHistory.secondsInPrevStage}
        ) / 86400.0`,
      })
      .from(stageHistory)
      .where(eq(stageHistory.orgId, orgId))
      .groupBy(stageHistory.toStageId),
    db
      .select({
        month: sql<string>`to_char(date_trunc('month', ${application.appliedAt}), 'YYYY-MM')`,
        count: sql<number>`count(*)::int`,
      })
      .from(application)
      .where(eq(application.orgId, orgId))
      .groupBy(sql`date_trunc('month', ${application.appliedAt})`)
      .orderBy(sql`date_trunc('month', ${application.appliedAt})`),
    db
      .select({
        reason: application.declineReason,
        count: sql<number>`count(*)::int`,
      })
      .from(application)
      .where(and(eq(application.orgId, orgId), isNotNull(application.declineReason)))
      .groupBy(application.declineReason)
      .orderBy(desc(sql`count(*)`)),
  ]);

  const reachedByStage = new Map(reached.map((r) => [r.stageId, r]));
  return {
    stages: stages
      .filter((s) => s.kind === "active" || s.kind === "won")
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        colorToken: s.colorToken,
        reached: reachedByStage.get(s.id)?.count ?? 0,
        medianDaysInPrev: reachedByStage.get(s.id)?.medianDays ?? null,
      })),
    monthly,
    declines,
  };
}

export async function getSourcing(orgId: string) {
  const [byDepartment, byCampusSource, byMember] = await Promise.all([
    db
      .select({
        label: sql<string>`coalesce(${application.department}, 'Unknown')`,
        count: sql<number>`count(*)::int`,
        funded: sql<number>`count(*) filter (where ${application.status} = 'funded')::int`,
      })
      .from(application)
      .where(eq(application.orgId, orgId))
      .groupBy(application.department)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        label: sql<string>`coalesce(${application.campusSource}, 'Unknown')`,
        count: sql<number>`count(*)::int`,
      })
      .from(application)
      .where(eq(application.orgId, orgId))
      .groupBy(application.campusSource)
      .orderBy(desc(sql`count(*)`)),
    db
      .select({
        memberId: member.id,
        memberName: member.displayName,
        sourced: sql<number>`count(*)::int`,
        funded: sql<number>`count(*) filter (where ${application.status} = 'funded')::int`,
      })
      .from(application)
      .innerJoin(member, eq(application.sourcedByMemberId, member.id))
      .where(eq(application.orgId, orgId))
      .groupBy(member.id, member.displayName)
      .orderBy(desc(sql`count(*)`)),
  ]);
  return { byDepartment, byCampusSource, byMember };
}

/** Sector mix: applicants vs funded — the revealed-preference gap. */
export async function getMoneyMix(orgId: string) {
  const [sectors, checks] = await Promise.all([
    db
      .select({
        sectorName: sector.name,
        colorToken: sector.colorToken,
        applicants: sql<number>`count(distinct ${application.id})::int`,
        funded: sql<number>`count(distinct ${application.id}) filter (where ${application.status} = 'funded')::int`,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(companySector, eq(companySector.companyId, company.id))
      .innerJoin(sector, eq(companySector.sectorId, sector.id))
      .where(eq(application.orgId, orgId))
      .groupBy(sector.name, sector.colorToken)
      .orderBy(desc(sql`count(distinct ${application.id})`)),
    db
      .select({ amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(
        and(eq(grant.orgId, orgId), inArray(grant.status, ["approved", "issued", "cashed", "reconciled"]))
      ),
  ]);

  // Check-size histogram in $500 bins.
  const bins = new Map<number, number>();
  for (const c of checks) {
    const bin = Math.floor(Number(c.amountAwarded) / 500) * 500;
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const checkHistogram = [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, count]) => ({ label: `$${(bin / 1000).toFixed(1)}k–${((bin + 500) / 1000).toFixed(1)}k`, count }));

  return { sectors, checkHistogram };
}

/**
 * Composition. Team-shape fields are low-sensitivity and displayable.
 * Demographics are one-dimensional ONLY and every series passes through
 * kAnonymize — no cross-tab query exists in this codebase.
 */
export async function getComposition(orgId: string) {
  const teamShape = await db
    .select({
      composition: application.teamComposition,
      studentMix: application.teamStudentMix,
      teamSize: application.teamSize,
    })
    .from(application)
    .where(eq(application.orgId, orgId));

  const demo = await db
    .select({
      gender: applicationDemographics.gender,
      raceEthnicity: applicationDemographics.raceEthnicity,
      firstGeneration: applicationDemographics.firstGeneration,
      international: applicationDemographics.international,
    })
    .from(applicationDemographics)
    .where(eq(applicationDemographics.orgId, orgId));

  const bucketize = (values: (string | null)[]): Bucket[] => {
    const m = new Map<string, number>();
    for (const v of values) {
      if (v == null) continue;
      const label = v.replace(/_/g, " ");
      m.set(label, (m.get(label) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count }));
  };

  return {
    teamComposition: bucketize(teamShape.map((t) => t.composition)),
    studentMix: bucketize(teamShape.map((t) => t.studentMix)),
    respondents: demo.length,
    // Aggregate-only, suppressed — the ONLY path demographics take to the UI.
    gender: kAnonymize(bucketize(demo.map((d) => d.gender))),
    raceEthnicity: kAnonymize(bucketize(demo.map((d) => d.raceEthnicity))),
    firstGeneration: kAnonymize(
      bucketize(demo.map((d) => (d.firstGeneration == null ? null : d.firstGeneration ? "first generation" : "not first generation")))
    ),
    international: kAnonymize(
      bucketize(demo.map((d) => (d.international == null ? null : d.international ? "international" : "domestic")))
    ),
  };
}

export async function getPortfolioConstruction(orgId: string) {
  const [tiers, dollarsByTier] = await Promise.all([
    db
      .select({ tier: company.outcomeTier, count: sql<number>`count(*)::int` })
      .from(company)
      .where(and(eq(company.orgId, orgId), eq(company.status, "portfolio")))
      .groupBy(company.outcomeTier),
    db
      .select({
        tier: company.outcomeTier,
        dollars: sql<string>`coalesce(sum(${grant.amountAwarded}), 0)`,
      })
      .from(grant)
      .innerJoin(company, eq(grant.companyId, company.id))
      .where(and(eq(grant.orgId, orgId), inArray(grant.status, ["issued", "cashed", "reconciled"])))
      .groupBy(company.outcomeTier),
  ]);

  const tierOrder = new Map(OUTCOME_TIERS.map((t, i) => [t, i]));
  const distribution = OUTCOME_TIERS.map((t) => {
    const row = tiers.find((r) => r.tier === t);
    const dollars = dollarsByTier.find((r) => r.tier === t);
    return { tier: t, count: row?.count ?? 0, dollars: Number(dollars?.dollars ?? 0) };
  });
  const totalCompanies = distribution.reduce((n, d) => n + d.count, 0);
  const meaningful = distribution
    .filter((d) => (tierOrder.get(d.tier as OutcomeTier) ?? 0) >= tierOrder.get("revenue")!)
    .reduce((n, d) => n + d.count, 0);

  const checkIns = await db
    .select({
      companyName: company.name,
      tier: outcomeUpdate.tier,
      recordedAt: outcomeUpdate.recordedAt,
    })
    .from(outcomeUpdate)
    .innerJoin(company, eq(outcomeUpdate.companyId, company.id))
    .where(eq(outcomeUpdate.orgId, orgId))
    .orderBy(desc(outcomeUpdate.recordedAt))
    .limit(15);

  return {
    distribution,
    totalCompanies,
    hitRate: totalCompanies > 0 ? meaningful / totalCompanies : null,
    recentCheckIns: checkIns,
  };
}

/**
 * Self-analysis ballots: revealed rounds ONLY — the redaction boundary
 * (src/lib/votes/redact.ts) stays intact because sealed rounds never leave
 * the database here.
 */
export async function getRevealedOutcomeBallots(orgId: string): Promise<OutcomeBallot[]> {
  const rows = await db
    .select({
      roundId: vote.voteRoundId,
      memberId: vote.memberId,
      decision: vote.decision,
      conviction: vote.conviction,
      companyId: application.companyId,
      outcomeTier: company.outcomeTier,
    })
    .from(vote)
    .innerJoin(voteRound, eq(vote.voteRoundId, voteRound.id))
    .innerJoin(application, eq(voteRound.applicationId, application.id))
    .innerJoin(company, eq(application.companyId, company.id))
    .where(
      and(
        eq(voteRound.orgId, orgId),
        eq(voteRound.status, "revealed"),
        isNotNull(voteRound.revealedAt)
      )
    );
  return rows;
}

export async function getMemberSectorAffinity(orgId: string, memberId: string) {
  return db
    .select({
      sectorName: sector.name,
      colorToken: sector.colorToken,
      sourced: sql<number>`count(distinct ${application.id})::int`,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .innerJoin(companySector, eq(companySector.companyId, company.id))
    .innerJoin(sector, eq(companySector.sectorId, sector.id))
    .where(and(eq(application.orgId, orgId), eq(application.sourcedByMemberId, memberId)))
    .groupBy(sector.name, sector.colorToken)
    .orderBy(desc(sql`count(distinct ${application.id})`))
    .limit(6);
}
