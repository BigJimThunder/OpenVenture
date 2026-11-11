import { and, eq, asc, desc, inArray, isNull, ne } from "drizzle-orm";
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
  voteRound,
  grant,
  grantPool,
  sector,
  companySector,
  dealSource,
} from "@/db/schema";

/** Members, sectors and deal sources — what the pipeline's pickers and filters offer. */
export async function getPipelineLookups(orgId: string) {
  const [members, sectors, sources] = await Promise.all([
    db
      .select({ id: member.id, displayName: member.displayName })
      .from(member)
      .where(and(eq(member.orgId, orgId), eq(member.status, "active")))
      .orderBy(asc(member.displayName)),
    db
      .select({ id: sector.id, name: sector.name, colorToken: sector.colorToken })
      .from(sector)
      .where(and(eq(sector.orgId, orgId), isNull(sector.archivedAt)))
      .orderBy(asc(sector.position), asc(sector.name)),
    db
      .select({ id: dealSource.id, name: dealSource.name })
      .from(dealSource)
      .where(and(eq(dealSource.orgId, orgId), isNull(dealSource.archivedAt)))
      .orderBy(asc(dealSource.name)),
  ]);
  return { members, sectors, sources };
}

export type PipelineLookups = Awaited<ReturnType<typeof getPipelineLookups>>;

export async function getPipeline(orgId: string) {
  const [stages, rows, sectorLinks] = await Promise.all([
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
        nextStep: application.nextStep,
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
    db
      .select({ companyId: companySector.companyId, sectorId: companySector.sectorId })
      .from(companySector)
      .innerJoin(company, eq(companySector.companyId, company.id))
      .where(eq(company.orgId, orgId)),
  ]);
  const sectorsByCompany = new Map<string, string[]>();
  for (const link of sectorLinks) {
    const list = sectorsByCompany.get(link.companyId);
    if (list) list.push(link.sectorId);
    else sectorsByCompany.set(link.companyId, [link.sectorId]);
  }
  const apps = rows.map((a) => ({ ...a, sectorIds: sectorsByCompany.get(a.companyId) ?? [] }));
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
      declineNote: application.declineNote,
      nextStep: application.nextStep,
      nextStepDue: application.nextStepDue,
      companyId: company.id,
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

  // Computed server-side: client components can't call Date.now() in render.
  const nextStepOverdue = app.nextStepDue != null && app.nextStepDue.getTime() < Date.now();

  const [criteria, scores, activities, latestMemoRows, latestRoundRows, sectors, grants] = await Promise.all([
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
    db
      .select({ id: memo.id, status: memo.status })
      .from(memo)
      .where(eq(memo.applicationId, id))
      .orderBy(desc(memo.createdAt))
      .limit(1),
    // Round STATUS only — vote rows stay behind getVoteRoundResults().
    db
      .select({
        id: voteRound.id,
        memoId: voteRound.memoId,
        status: voteRound.status,
        closesAt: voteRound.closesAt,
        outcome: voteRound.outcome,
      })
      .from(voteRound)
      .where(
        and(eq(voteRound.applicationId, id), inArray(voteRound.status, ["open", "closed", "revealed"]))
      )
      .orderBy(desc(voteRound.createdAt))
      .limit(1),
    db
      .select({ id: sector.id, name: sector.name, colorToken: sector.colorToken })
      .from(companySector)
      .innerJoin(sector, eq(companySector.sectorId, sector.id))
      .where(eq(companySector.companyId, app.companyId)),
    db
      .select({
        id: grant.id,
        status: grant.status,
        amountAwarded: grant.amountAwarded,
        poolName: grantPool.name,
      })
      .from(grant)
      .innerJoin(grantPool, eq(grant.poolId, grantPool.id))
      .where(and(eq(grant.applicationId, id), ne(grant.status, "cancelled")))
      .limit(1),
  ]);

  // Mean score per criterion, with the number of reviewers behind it — a 4.3
  // from three people is a different fact than a 4.3 from one.
  const scoring = criteria.map((c) => {
    const mine = scores.filter((s) => s.criterionId === c.id);
    const count = mine.length;
    const mean = count ? mine.reduce((n, s) => n + s.score, 0) / count : null;
    return { id: c.id, label: c.label, mean, count };
  });

  return {
    app: { ...app, nextStepOverdue },
    scoring,
    activities,
    latestMemo: latestMemoRows[0] ?? null,
    activeRound: latestRoundRows[0] ?? null,
    sectors,
    grant: grants[0] ?? null,
  };
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

  const [
    stages,
    history,
    notes,
    chats,
    criteria,
    scores,
    activities,
    memos,
    grants,
    owner,
    rounds,
    companySectors,
  ] = await Promise.all([
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
        .limit(40),
      db.select().from(memo).where(eq(memo.applicationId, id)).orderBy(desc(memo.createdAt)),
      db
        .select({
          id: grant.id,
          status: grant.status,
          amountAwarded: grant.amountAwarded,
          poolName: grantPool.name,
          createdAt: grant.createdAt,
        })
        .from(grant)
        .innerJoin(grantPool, eq(grant.poolId, grantPool.id))
        .where(eq(grant.applicationId, id))
        .orderBy(desc(grant.createdAt)),
      app.ownerMemberId
        ? db.select().from(member).where(eq(member.id, app.ownerMemberId)).limit(1)
        : Promise.resolve([]),
      // Round STATUS only — vote rows stay behind getVoteRoundResults().
      db
        .select({
          id: voteRound.id,
          memoId: voteRound.memoId,
          status: voteRound.status,
          closesAt: voteRound.closesAt,
          revealedAt: voteRound.revealedAt,
          outcome: voteRound.outcome,
          outcomeNote: voteRound.outcomeNote,
        })
        .from(voteRound)
        .where(eq(voteRound.applicationId, id))
        .orderBy(desc(voteRound.createdAt)),
      db
        .select({ id: sector.id, name: sector.name, colorToken: sector.colorToken })
        .from(companySector)
        .innerJoin(sector, eq(companySector.sectorId, sector.id))
        .where(eq(companySector.companyId, app.companyId)),
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
    rounds,
    sectors: companySectors,
    owner: owner[0] ?? null,
  };
}

/**
 * What the vote page needs to record a decision and to show what a recorded
 * decision did: the application's state and its live grant. No vote rows.
 */
export async function getDecisionContext(orgId: string, applicationId: string) {
  const [app] = await db
    .select({
      id: application.id,
      ref: application.ref,
      status: application.status,
      amountRequested: application.amountRequested,
      useOfFundsNarrative: application.useOfFundsNarrative,
      applicantEmail: application.applicantEmail,
      declineReason: application.declineReason,
      declineNote: application.declineNote,
      decidedAt: application.decidedAt,
      nextStep: application.nextStep,
      stageName: pipelineStage.name,
    })
    .from(application)
    .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
    .where(and(eq(application.id, applicationId), eq(application.orgId, orgId)))
    .limit(1);
  if (!app) return null;

  const [[liveGrant], terminalStages] = await Promise.all([
    db
      .select({
        id: grant.id,
        status: grant.status,
        amountAwarded: grant.amountAwarded,
        poolName: grantPool.name,
      })
      .from(grant)
      .innerJoin(grantPool, eq(grant.poolId, grantPool.id))
      .where(and(eq(grant.applicationId, applicationId), ne(grant.status, "cancelled")))
      .limit(1),
    db
      .select({ name: pipelineStage.name, kind: pipelineStage.kind })
      .from(pipelineStage)
      .where(
        and(
          eq(pipelineStage.orgId, orgId),
          isNull(pipelineStage.archivedAt),
          inArray(pipelineStage.kind, ["won", "lost"])
        )
      )
      .orderBy(asc(pipelineStage.position)),
  ]);

  return {
    app,
    grant: liveGrant ?? null,
    wonStageName: terminalStages.find((s) => s.kind === "won")?.name ?? null,
    lostStageName: terminalStages.find((s) => s.kind === "lost")?.name ?? null,
  };
}
