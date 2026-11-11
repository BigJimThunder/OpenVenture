import { and, eq, asc, desc, gte, lt, ne, not, or, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  meeting,
  agendaItem,
  attendance,
  actionItem,
  member,
  application,
  company,
  pipelineStage,
  voteRound,
} from "@/db/schema";

/** A meeting stays "upcoming" for a few hours after its start so one that
 *  is running late (or simply not started in the app) doesn't vanish into Past. */
const GRACE_MS = 3 * 60 * 60 * 1000;

export async function getMeetingsList(orgId: string) {
  const cutoff = new Date(Date.now() - GRACE_MS);
  const counts = {
    agendaCount: sql<number>`(
      select count(*)::int from ${agendaItem} where ${agendaItem}."meeting_id" = ${meeting}."id"
    )`,
    attendedCount: sql<number>`(
      select count(*)::int from ${attendance}
      where ${attendance}."meeting_id" = ${meeting}."id"
        and ${attendance}."status" in ('present','remote','late')
    )`,
    openActionCount: sql<number>`(
      select count(*)::int from ${actionItem}
      where ${actionItem}."meeting_id" = ${meeting}."id" and ${actionItem}."status" = 'open'
    )`,
  };
  const isUpcoming = or(
    eq(meeting.status, "in_progress"),
    and(eq(meeting.status, "scheduled"), gte(meeting.scheduledAt, cutoff))
  )!;
  const [upcoming, past] = await Promise.all([
    db
      .select({ meeting, ...counts })
      .from(meeting)
      .where(and(eq(meeting.orgId, orgId), isUpcoming))
      .orderBy(asc(meeting.scheduledAt)),
    db
      .select({ meeting, ...counts })
      .from(meeting)
      .where(and(eq(meeting.orgId, orgId), not(isUpcoming)))
      .orderBy(desc(meeting.scheduledAt))
      .limit(30),
  ]);
  return { upcoming, past };
}

export async function getMeetingDetail(orgId: string, meetingId: string) {
  const [m] = await db
    .select()
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.orgId, orgId)))
    .limit(1);
  if (!m) return null;

  const [items, attendanceRows, actions, members] = await Promise.all([
    db
      .select({
        item: agendaItem,
        presenterName: member.displayName,
        companyName: company.name,
        voteMemoId: voteRound.memoId,
      })
      .from(agendaItem)
      .leftJoin(member, eq(agendaItem.presenterMemberId, member.id))
      .leftJoin(application, eq(agendaItem.applicationId, application.id))
      .leftJoin(company, eq(application.companyId, company.id))
      .leftJoin(voteRound, eq(agendaItem.voteRoundId, voteRound.id))
      .where(eq(agendaItem.meetingId, meetingId))
      .orderBy(asc(agendaItem.position)),
    db
      .select({
        memberId: attendance.memberId,
        status: attendance.status,
      })
      .from(attendance)
      .where(eq(attendance.meetingId, meetingId)),
    db
      .select({
        id: actionItem.id,
        ref: actionItem.ref,
        title: actionItem.title,
        status: actionItem.status,
        dueAt: actionItem.dueAt,
        agendaItemId: actionItem.agendaItemId,
        assigneeName: member.displayName,
        assigneeId: actionItem.assigneeMemberId,
      })
      .from(actionItem)
      .leftJoin(member, eq(actionItem.assigneeMemberId, member.id))
      .where(and(eq(actionItem.meetingId, meetingId), ne(actionItem.status, "cancelled")))
      .orderBy(asc(actionItem.createdAt)),
    db
      .select({ id: member.id, displayName: member.displayName })
      .from(member)
      .where(and(eq(member.orgId, orgId), inArray(member.status, ["active", "invited"])))
      .orderBy(asc(member.displayName)),
  ]);

  return { meeting: m, items, attendanceRows, actions, members };
}

/** One-click agenda suggestions: late-stage applications, open votes, overdue actions. */
export async function getAgendaSuggestions(orgId: string, meetingId: string) {
  const existing = await db
    .select({ applicationId: agendaItem.applicationId, voteRoundId: agendaItem.voteRoundId })
    .from(agendaItem)
    .where(eq(agendaItem.meetingId, meetingId));
  const usedApps = new Set(existing.map((e) => e.applicationId).filter(Boolean));
  const usedRounds = new Set(existing.map((e) => e.voteRoundId).filter(Boolean));

  const [lateStage, openRounds, overdue] = await Promise.all([
    db
      .select({
        applicationId: application.id,
        companyName: company.name,
        stageName: pipelineStage.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.status, "open"),
          isNull(application.archivedAt),
          inArray(pipelineStage.slug, ["pitched-group", "decision"])
        )
      )
      .limit(8),
    db
      .select({ id: voteRound.id, title: voteRound.title, memoId: voteRound.memoId })
      .from(voteRound)
      .where(and(eq(voteRound.orgId, orgId), eq(voteRound.status, "open"))),
    db
      .select({
        id: actionItem.id,
        title: actionItem.title,
        assigneeName: member.displayName,
      })
      .from(actionItem)
      .leftJoin(member, eq(actionItem.assigneeMemberId, member.id))
      .where(
        and(
          eq(actionItem.orgId, orgId),
          eq(actionItem.status, "open"),
          lt(actionItem.dueAt, new Date())
        )
      )
      .limit(8),
  ]);

  return {
    applications: lateStage.filter((a) => !usedApps.has(a.applicationId)),
    voteRounds: openRounds.filter((r) => !usedRounds.has(r.id)),
    overdueActions: overdue,
  };
}
