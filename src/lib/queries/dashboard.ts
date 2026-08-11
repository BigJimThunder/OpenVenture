import { and, eq, ne, desc, asc, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  pipelineStage,
  company,
  grant,
  grantPool,
  voteRound,
  voteEligibility,
  memo,
  meeting,
  member,
  activity,
  actionItem,
} from "@/db/schema";

import { summarizePool } from "@/lib/grants/budget";
import { getVoteRoundResults } from "@/lib/queries/memos";

/** Remaining budget = pool + rollover − Σ(approved/issued/cashed/reconciled). Derived, never stored. */
export async function getBudgetSummary(orgId: string, fiscalYear?: number) {
  const pools = await db
    .select()
    .from(grantPool)
    .where(eq(grantPool.orgId, orgId))
    .orderBy(desc(grantPool.fiscalYear));
  const pool = fiscalYear ? pools.find((p) => p.fiscalYear === fiscalYear) : pools[0];
  if (!pool) return null;

  const rows = await db
    .select({ status: grant.status, amountAwarded: grant.amountAwarded })
    .from(grant)
    .where(eq(grant.poolId, pool.id));
  const s = summarizePool(pool, rows);
  return { pool, ...s, deployed: s.committed + s.deployed };
}

/**
 * Counts for the sidebar badges. Runs in the layout on every navigation, so
 * it stays two cheap aggregates.
 *
 * Deliberately does NOT read `vote` rows — the blind-vote invariant reserves
 * those for getVoteRoundResults(). "Votes open to me" therefore counts rounds
 * I'm eligible for, not rounds I still owe a ballot on.
 */
export async function getShellCounts(orgId: string, memberId: string) {
  const [[pipeline], [mine], [votes]] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.status, "open"),
          eq(pipelineStage.kind, "active"),
          isNull(application.archivedAt)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.status, "open"),
          eq(application.ownerMemberId, memberId),
          eq(pipelineStage.kind, "active"),
          isNull(application.archivedAt)
        )
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .where(
        and(
          eq(voteRound.orgId, orgId),
          eq(voteRound.status, "open"),
          eq(voteEligibility.memberId, memberId),
          eq(voteEligibility.isRecused, false)
        )
      ),
  ]);

  const voteCount = votes?.n ?? 0;
  const pipelineCount = pipeline?.n ?? 0;
  return {
    pipeline: pipelineCount,
    // Must equal what the Inbox screen lists, or the badge lies. That screen
    // shows the club's shared queue (a 15-person club works one backlog), so
    // this counts open applications plus ballots I owe — not just mine.
    inbox: pipelineCount + voteCount,
    mine: mine?.n ?? 0,
    votes: voteCount,
  };
}

export async function getDashboardData(orgId: string, memberId: string) {
  const [budget, needsAction, openVotes, nextMeetings, myActionItems, recentActivity, stages] =
    await Promise.all([
      getBudgetSummary(orgId),
      db
        .select({
          id: application.id,
          ref: application.ref,
          priority: application.priority,
          companyName: company.name,
          stageName: pipelineStage.name,
          stageColor: pipelineStage.colorToken,
          slaDays: pipelineStage.slaDays,
          enteredStageAt: application.enteredStageAt,
          amountRequested: application.amountRequested,
          nextStep: application.nextStep,
          nextStepDue: application.nextStepDue,
          ownerName: member.displayName,
        })
        .from(application)
        .innerJoin(company, eq(application.companyId, company.id))
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .leftJoin(member, eq(application.ownerMemberId, member.id))
        .where(
          and(
            eq(application.orgId, orgId),
            eq(application.status, "open"),
            eq(pipelineStage.kind, "active"),
            isNull(application.archivedAt)
          )
        )
        .orderBy(asc(application.enteredStageAt))
        .limit(50),
      db
        .select({
          id: voteRound.id,
          title: voteRound.title,
          memoId: voteRound.memoId,
          closesAt: voteRound.closesAt,
          memoRef: memo.ref,
        })
        .from(voteRound)
        .leftJoin(memo, eq(voteRound.memoId, memo.id))
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

  // Participation counts only — never ballots. redactVoteResults() is the one
  // place allowed to decide what a viewer sees before reveal.
  const voteProgress = await Promise.all(
    openVotes.map(async (v) => {
      const res = await getVoteRoundResults(orgId, v.id, memberId);
      return {
        ...v,
        submitted: res?.submittedCount ?? 0,
        eligible: res?.eligibleCount ?? 0,
        iVoted: res?.myBallot != null,
      };
    })
  );

  return {
    budget,
    needsAction,
    openVotes: voteProgress,
    nextMeeting: nextMeetings[0] ?? null,
    myActionItems,
    recentActivity,
    stages,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

/**
 * "My work" — everything with this member's name on it, across the objects
 * the club actually tracks. The Inbox answers "what needs a decision now";
 * this answers "what am I carrying".
 */
export async function getMyWork(orgId: string, memberId: string) {
  const [owned, sourced, tasks, memos] = await Promise.all([
    db
      .select({
        id: application.id,
        ref: application.ref,
        priority: application.priority,
        companyName: company.name,
        stageName: pipelineStage.name,
        stageColor: pipelineStage.colorToken,
        slaDays: pipelineStage.slaDays,
        enteredStageAt: application.enteredStageAt,
        amountRequested: application.amountRequested,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.ownerMemberId, memberId),
          eq(application.status, "open"),
          isNull(application.archivedAt)
        )
      )
      .orderBy(asc(application.enteredStageAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.sourcedByMemberId, memberId),
          isNull(application.archivedAt)
        )
      ),
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
      .orderBy(asc(actionItem.dueAt)),
    db
      .select({
        id: memo.id,
        ref: memo.ref,
        title: memo.title,
        status: memo.status,
        updatedAt: memo.updatedAt,
      })
      .from(memo)
      .where(
        and(
          eq(memo.orgId, orgId),
          eq(memo.authorMemberId, memberId),
          ne(memo.status, "archived")
        )
      )
      .orderBy(desc(memo.updatedAt))
      .limit(10),
  ]);

  return { owned, sourcedCount: sourced[0]?.n ?? 0, tasks, memos };
}

/** True once an action item's due date has passed. */
export function isOverdue(dueAt: Date | string | null, now = Date.now()): boolean {
  return dueAt != null && new Date(dueAt).getTime() < now;
}

/** True once an application has outstayed its stage's SLA. */
export function slaBreachDays(
  enteredStageAt: Date | string,
  slaDays: number | null,
  now = Date.now()
): number | null {
  if (!slaDays) return null;
  const days = Math.floor((now - new Date(enteredStageAt).getTime()) / 86_400_000);
  return days > slaDays ? slaDays : null;
}
