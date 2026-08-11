import { and, eq, asc, desc, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  company,
  pipelineStage,
  member,
  stageHistory,
  applicationNote,
  coffeeChat,
  coffeeChatAttendee,
  screeningCriterion,
  screeningScore,
  activity,
  memo,
  grant,
} from "@/db/schema";

export async function getPipeline(orgId: string) {
  const [stages, apps] = await Promise.all([
    db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.orgId, orgId), isNull(pipelineStage.archivedAt)))
      .orderBy(asc(pipelineStage.position)),
    db
      .select({
        id: application.id,
        ref: application.ref,
        stageId: application.stageId,
        position: application.position,
        status: application.status,
        priority: application.priority,
        amountRequested: application.amountRequested,
        appliedAt: application.appliedAt,
        enteredStageAt: application.enteredStageAt,
        declineReason: application.declineReason,
        companyId: company.id,
        companyName: company.name,
        companyDomain: company.domain,
        companyOneLiner: company.oneLiner,
        logoUrl: company.logoUrl,
        ownerName: member.displayName,
        ownerId: member.id,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .leftJoin(member, eq(application.ownerMemberId, member.id))
      .where(and(eq(application.orgId, orgId), isNull(application.archivedAt)))
      .orderBy(asc(application.position), desc(application.appliedAt)),
  ]);
  return { stages, apps };
}

export type PipelineData = Awaited<ReturnType<typeof getPipeline>>;
export type PipelineApp = PipelineData["apps"][number];

/**
 * Everything the peek panel shows, and nothing else.
 *
 * Deliberately lighter than getApplicationDetail: the peek is opened by a
 * keystroke while scanning a board, so it must not pull memo versions, notes
 * and coffee-chat attendees for a panel that may be dismissed in 200ms.
 */
export async function getApplicationPeek(orgId: string, id: string) {
  const [app] = await db
    .select({
      id: application.id,
      ref: application.ref,
      stageId: application.stageId,
      status: application.status,
      priority: application.priority,
      amountRequested: application.amountRequested,
      useOfFundsNarrative: application.useOfFundsNarrative,
      pitchSummary: application.pitchSummary,
      applicantName: application.applicantName,
      applicantEmail: application.applicantEmail,
      department: application.department,
      classYear: application.classYear,
      campusSource: application.campusSource,
      appliedAt: application.appliedAt,
      enteredStageAt: application.enteredStageAt,
      declineReason: application.declineReason,
      companyName: company.name,
      companyOneLiner: company.oneLiner,
      companyDomain: company.domain,
      websiteUrl: company.websiteUrl,
      ownerId: member.id,
      ownerName: member.displayName,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .leftJoin(member, eq(application.ownerMemberId, member.id))
    .where(and(eq(application.id, id), eq(application.orgId, orgId)))
    .limit(1);
  if (!app) return null;

  const [criteria, scores, activities] = await Promise.all([
    db
      .select()
      .from(screeningCriterion)
      .where(and(eq(screeningCriterion.orgId, orgId), isNull(screeningCriterion.archivedAt)))
      .orderBy(asc(screeningCriterion.position)),
    db
      .select({ criterionId: screeningScore.criterionId, score: screeningScore.score })
      .from(screeningScore)
      .where(eq(screeningScore.applicationId, id)),
    db
      .select({
        id: activity.id,
        verb: activity.verb,
        summary: activity.summary,
        occurredAt: activity.occurredAt,
        actorName: member.displayName,
      })
      .from(activity)
      .leftJoin(member, eq(activity.actorMemberId, member.id))
      .where(and(eq(activity.entityType, "application"), eq(activity.entityId, id)))
      .orderBy(desc(activity.occurredAt))
      .limit(8),
  ]);

  // Mean score per criterion, with the number of reviewers behind it — a 4.3
  // from three people is a different fact than a 4.3 from one.
  const scoring = criteria.map((c) => {
    const mine = scores.filter((s) => s.criterionId === c.id);
    const count = mine.length;
    const mean = count ? mine.reduce((n, s) => n + s.score, 0) / count : null;
    return { id: c.id, label: c.label, mean, count };
  });

  return { app, scoring, activities };
}

export type ApplicationPeek = NonNullable<Awaited<ReturnType<typeof getApplicationPeek>>>;

export async function getApplicationDetail(orgId: string, id: string) {
  const [app] = await db
    .select()
    .from(application)
    .where(and(eq(application.id, id), eq(application.orgId, orgId)))
    .limit(1);
  if (!app) return null;

  const [co] = await db.select().from(company).where(eq(company.id, app.companyId)).limit(1);

  const [stages, history, notes, chats, criteria, scores, activities, memos, grants, owner] =
    await Promise.all([
      db
        .select()
        .from(pipelineStage)
        .where(and(eq(pipelineStage.orgId, orgId), isNull(pipelineStage.archivedAt)))
        .orderBy(asc(pipelineStage.position)),
      db
        .select({
          id: stageHistory.id,
          movedAt: stageHistory.movedAt,
          note: stageHistory.note,
          secondsInPrevStage: stageHistory.secondsInPrevStage,
          toStageName: pipelineStage.name,
          movedByName: member.displayName,
        })
        .from(stageHistory)
        .innerJoin(pipelineStage, eq(stageHistory.toStageId, pipelineStage.id))
        .leftJoin(member, eq(stageHistory.movedByMemberId, member.id))
        .where(eq(stageHistory.applicationId, id))
        .orderBy(desc(stageHistory.movedAt)),
      db
        .select({
          id: applicationNote.id,
          body: applicationNote.body,
          pinned: applicationNote.pinned,
          createdAt: applicationNote.createdAt,
          authorName: member.displayName,
        })
        .from(applicationNote)
        .innerJoin(member, eq(applicationNote.authorMemberId, member.id))
        .where(eq(applicationNote.applicationId, id))
        .orderBy(desc(applicationNote.createdAt)),
      db
        .select()
        .from(coffeeChat)
        .where(eq(coffeeChat.applicationId, id))
        .orderBy(desc(coffeeChat.createdAt)),
      db
        .select()
        .from(screeningCriterion)
        .where(and(eq(screeningCriterion.orgId, orgId), isNull(screeningCriterion.archivedAt)))
        .orderBy(asc(screeningCriterion.position)),
      db
        .select()
        .from(screeningScore)
        .where(eq(screeningScore.applicationId, id)),
      db
        .select()
        .from(activity)
        .where(and(eq(activity.entityType, "application"), eq(activity.entityId, id)))
        .orderBy(desc(activity.occurredAt))
        .limit(30),
      db.select().from(memo).where(eq(memo.applicationId, id)),
      db.select().from(grant).where(eq(grant.applicationId, id)),
      app.ownerMemberId
        ? db.select().from(member).where(eq(member.id, app.ownerMemberId)).limit(1)
        : Promise.resolve([]),
    ]);

  const chatIds = chats.map((c) => c.id);
  const [attendees, activeMembers] = await Promise.all([
    chatIds.length
      ? db
          .select({
            coffeeChatId: coffeeChatAttendee.coffeeChatId,
            memberId: coffeeChatAttendee.memberId,
            verdict: coffeeChatAttendee.verdict,
            note: coffeeChatAttendee.note,
            memberName: member.displayName,
          })
          .from(coffeeChatAttendee)
          .innerJoin(member, eq(coffeeChatAttendee.memberId, member.id))
          .where(inArray(coffeeChatAttendee.coffeeChatId, chatIds))
      : Promise.resolve([]),
    db
      .select({ id: member.id, displayName: member.displayName })
      .from(member)
      .where(and(eq(member.orgId, orgId), eq(member.status, "active")))
      .orderBy(asc(member.displayName)),
  ]);

  return {
    app,
    company: co,
    stages,
    history,
    notes,
    chats,
    attendees,
    activeMembers,
    criteria,
    scores,
    activities,
    memos,
    grants,
    owner: owner[0] ?? null,
  };
}
