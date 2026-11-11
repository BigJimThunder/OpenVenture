import { cache } from "react";
import { and, or, eq, ne, desc, asc, gte, isNull, sql } from "drizzle-orm";
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
  memoComment,
  meeting,
  member,
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
  return {
    pool,
    ...s,
    deployed: s.committed + s.deployed,
    /** Share of the pool spoken for (approved or later), 0..1. */
    usedFraction: s.total > 0 ? (s.total - s.remaining) / s.total : 0,
  };
}

const applicationRow = {
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
  ownerMemberId: application.ownerMemberId,
  ownerName: member.displayName,
};

const openInActiveStage = (orgId: string) =>
  and(
    eq(application.orgId, orgId),
    eq(application.status, "open"),
    eq(pipelineStage.kind, "active"),
    isNull(application.archivedAt)
  );

/** Mirrors slaBreachDays() below: more than `sla_days` whole days in the stage. */
const slaBreached = sql`(${pipelineStage.slaDays} > 0 and ${application.enteredStageAt} < now() - make_interval(days => ${pipelineStage.slaDays} + 1))`;

/** A next step that is overdue or falls due within a day. */
const nextStepDue = sql`(${application.nextStep} is not null and ${application.nextStepDue} < now() + interval '1 day')`;

/**
 * Everything that is waiting on THIS member — the top section of the Inbox
 * and, by construction, the sidebar badge (getShellCounts counts these same
 * lists, so the badge cannot disagree with the screen).
 *
 * - ballots: open rounds I'm eligible for and haven't voted in
 * - applications: ones I own that breached their stage SLA or have a next step due
 * - tasks: my open action items
 * - memos: circulated memos by someone else that I haven't commented on
 *
 * Ballot status comes from getVoteRoundResults() — the one sanctioned reader
 * of `vote` rows — and only ever the viewer's own. Cached per request because
 * the layout and the Inbox page both ask.
 */
export const getNeedsMe = cache(async (orgId: string, memberId: string) => {
  const [applications, tasks, memos, myRounds] = await Promise.all([
    db
      .select(applicationRow)
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .leftJoin(member, eq(application.ownerMemberId, member.id))
      .where(
        and(
          openInActiveStage(orgId),
          eq(application.ownerMemberId, memberId),
          or(slaBreached, nextStepDue)
        )
      )
      .orderBy(asc(application.enteredStageAt)),
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
        authorName: member.displayName,
        circulatedAt: memo.circulatedAt,
      })
      .from(memo)
      .innerJoin(member, eq(memo.authorMemberId, member.id))
      .where(
        and(
          eq(memo.orgId, orgId),
          eq(memo.status, "circulated"),
          ne(memo.authorMemberId, memberId),
          sql`not exists (
            select 1 from ${memoComment}
            where ${memoComment}."memo_id" = ${memo}."id"
              and ${memoComment}."author_member_id" = ${memberId}
          )`
        )
      )
      .orderBy(asc(memo.circulatedAt)),
    db
      .select({
        id: voteRound.id,
        title: voteRound.title,
        memoId: voteRound.memoId,
        closesAt: voteRound.closesAt,
        memoRef: memo.ref,
      })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .leftJoin(memo, eq(voteRound.memoId, memo.id))
      .where(
        and(
          eq(voteRound.orgId, orgId),
          eq(voteRound.status, "open"),
          eq(voteEligibility.memberId, memberId),
          eq(voteEligibility.isRecused, false)
        )
      )
      .orderBy(asc(voteRound.closesAt)),
  ]);

  // Only the viewer's own ballot status leaves this function — never a count.
  const rounds = await Promise.all(
    myRounds.map(async (r) => {
      const res = await getVoteRoundResults(orgId, r.id, memberId);
      return { ...r, iVoted: res?.myBallot != null };
    })
  );

  const ballots = rounds.filter((r) => !r.iVoted);
  return {
    ballots,
    /** Open rounds where my ballot is already in — shown under "Coming up". */
    ballotsCast: rounds.filter((r) => r.iVoted),
    applications,
    tasks,
    memos,
    count: ballots.length + applications.length + tasks.length + memos.length,
  };
});

/**
 * Counts for the sidebar badges. Runs in the layout on every navigation:
 * one aggregate for the pipeline plus the member's own short lists.
 */
export async function getShellCounts(orgId: string, memberId: string) {
  const [[pipeline], needsMe] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(openInActiveStage(orgId)),
    getNeedsMe(orgId, memberId),
  ]);

  return {
    pipeline: pipeline?.n ?? 0,
    // The Inbox badge is "things waiting on me", exactly the rows the Inbox
    // lists under "Needs you" — not the club's whole backlog (that number is
    // the Pipeline badge).
    inbox: needsMe.count,
  };
}

/**
 * The Inbox: what needs me, what needs someone, what's coming. One row per
 * thing that wants a decision; the club-wide backlog lives on the Pipeline.
 */
export async function getInbox(orgId: string, memberId: string) {
  const [needsMe, budget, needsSomeone, nextMeetings, [open], [everHadApplication]] =
    await Promise.all([
      getNeedsMe(orgId, memberId),
      getBudgetSummary(orgId),
      // Nobody's problem yet: unowned, or breached under someone else's name.
      db
        .select(applicationRow)
        .from(application)
        .innerJoin(company, eq(application.companyId, company.id))
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .leftJoin(member, eq(application.ownerMemberId, member.id))
        .where(
          and(
            openInActiveStage(orgId),
            or(
              isNull(application.ownerMemberId),
              and(ne(application.ownerMemberId, memberId), slaBreached)
            )
          )
        )
        .orderBy(asc(application.enteredStageAt))
        .limit(25),
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
        .select({
          applications: sql<number>`count(*)::int`,
          votes: sql<number>`(
            select count(*)::int from ${voteRound}
            where ${voteRound}."org_id" = ${orgId} and ${voteRound}."status" = 'open'
          )`,
        })
        .from(application)
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .where(openInActiveStage(orgId)),
      db
        .select({ id: application.id })
        .from(application)
        .where(eq(application.orgId, orgId))
        .limit(1),
    ]);

  return {
    needsMe,
    needsSomeone,
    budget,
    nextMeeting: nextMeetings[0] ?? null,
    openApplications: open?.applications ?? 0,
    openVotes: open?.votes ?? 0,
    /** False only for a club that has never received an application. */
    hasHistory: everHadApplication != null,
  };
}

export type InboxData = Awaited<ReturnType<typeof getInbox>>;

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
        nextStep: application.nextStep,
        nextStepDue: application.nextStepDue,
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
      .select({
        id: application.id,
        ref: application.ref,
        companyName: company.name,
        status: application.status,
        stageName: pipelineStage.name,
        stageColor: pipelineStage.colorToken,
        appliedAt: application.appliedAt,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.sourcedByMemberId, memberId),
          isNull(application.archivedAt)
        )
      )
      .orderBy(desc(application.appliedAt)),
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

  return { owned, sourced, tasks, memos };
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
