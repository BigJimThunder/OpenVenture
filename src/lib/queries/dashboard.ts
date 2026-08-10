import { and, eq, desc, asc, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  pipelineStage,
  company,
  grant,
  grantPool,
  voteRound,
  meeting,
  activity,
  actionItem,
} from "@/db/schema";

/** Remaining budget = pool + rollover − Σ(approved/issued/cashed/reconciled). Derived, never stored. */
export async function getBudgetSummary(orgId: string, fiscalYear?: number) {
  const pools = await db
    .select()
    .from(grantPool)
    .where(eq(grantPool.orgId, orgId))
    .orderBy(desc(grantPool.fiscalYear));
  const pool = fiscalYear ? pools.find((p) => p.fiscalYear === fiscalYear) : pools[0];
  if (!pool) return null;

  const committed = await db
    .select({
      total: sql<string>`coalesce(sum(${grant.amountAwarded}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(grant)
    .where(
      and(
        eq(grant.poolId, pool.id),
        inArray(grant.status, ["approved", "issued", "cashed", "reconciled"])
      )
    );

  const total = Number(pool.totalBudget) + Number(pool.rolloverFromPrior);
  const deployed = Number(committed[0]?.total ?? 0);
  return {
    pool,
    total,
    deployed,
    remaining: total - deployed,
    grantCount: committed[0]?.count ?? 0,
  };
}

export async function getDashboardData(orgId: string, memberId: string) {
  const [budget, needsAction, openVotes, nextMeetings, myActionItems, recentActivity, stages] =
    await Promise.all([
      getBudgetSummary(orgId),
      db
        .select({
          id: application.id,
          companyName: company.name,
          stageName: pipelineStage.name,
          stageColor: pipelineStage.colorToken,
          enteredStageAt: application.enteredStageAt,
          amountRequested: application.amountRequested,
        })
        .from(application)
        .innerJoin(company, eq(application.companyId, company.id))
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .where(
          and(
            eq(application.orgId, orgId),
            eq(application.status, "open"),
            isNull(application.archivedAt)
          )
        )
        .orderBy(asc(application.enteredStageAt))
        .limit(6),
      db
        .select()
        .from(voteRound)
        .where(and(eq(voteRound.orgId, orgId), eq(voteRound.status, "open")))
        .orderBy(asc(voteRound.closesAt))
        .limit(4),
      db
        .select()
        .from(meeting)
        .where(
          and(
            eq(meeting.orgId, orgId),
            eq(meeting.status, "scheduled"),
            gte(meeting.scheduledAt, new Date())
          )
        )
        .orderBy(asc(meeting.scheduledAt))
        .limit(1),
      db
        .select()
        .from(actionItem)
        .where(
          and(
            eq(actionItem.orgId, orgId),
            eq(actionItem.assigneeMemberId, memberId),
            eq(actionItem.status, "open")
          )
        )
        .orderBy(asc(actionItem.dueAt))
        .limit(5),
      db
        .select()
        .from(activity)
        .where(eq(activity.orgId, orgId))
        .orderBy(desc(activity.occurredAt))
        .limit(10),
      db
        .select({
          id: pipelineStage.id,
          name: pipelineStage.name,
          kind: pipelineStage.kind,
          colorToken: pipelineStage.colorToken,
          // NB: fully qualify columns — inside a correlated subquery Drizzle
          // renders bare column names, and an unqualified "id" would resolve
          // to application.id instead of the outer pipeline_stage.id.
          count: sql<number>`(
            select count(*)::int from ${application}
            where ${application}."stage_id" = ${pipelineStage}."id"
              and ${application}."status" = 'open'
              and ${application}."archived_at" is null
          )`,
        })
        .from(pipelineStage)
        .where(and(eq(pipelineStage.orgId, orgId), isNull(pipelineStage.archivedAt)))
        .orderBy(asc(pipelineStage.position)),
    ]);

  return { budget, needsAction, openVotes, nextMeeting: nextMeetings[0] ?? null, myActionItems, recentActivity, stages };
}
