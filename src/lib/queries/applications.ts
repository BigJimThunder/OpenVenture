import { and, eq, asc, desc, isNull } from "drizzle-orm";
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
        stageId: application.stageId,
        position: application.position,
        status: application.status,
        amountRequested: application.amountRequested,
        appliedAt: application.appliedAt,
        enteredStageAt: application.enteredStageAt,
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
  const attendees = chatIds.length
    ? await db
        .select({
          coffeeChatId: coffeeChatAttendee.coffeeChatId,
          verdict: coffeeChatAttendee.verdict,
          note: coffeeChatAttendee.note,
          memberName: member.displayName,
        })
        .from(coffeeChatAttendee)
        .innerJoin(member, eq(coffeeChatAttendee.memberId, member.id))
        .where(eq(coffeeChatAttendee.coffeeChatId, chatIds[0]))
    : [];

  return {
    app,
    company: co,
    stages,
    history,
    notes,
    chats,
    attendees,
    criteria,
    scores,
    activities,
    memos,
    grants,
    owner: owner[0] ?? null,
  };
}
