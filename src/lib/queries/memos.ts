import { and, eq, isNull, asc, desc, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  memo,
  memoVersion,
  memoSection,
  memoTemplateSection,
  memoComment,
  voteRound,
  voteEligibility,
  vote,
  application,
  company,
  member,
} from "@/db/schema";
import { redactVoteResults, type RedactedResults } from "@/lib/votes/redact";

export async function getMemosList(orgId: string) {
  return db
    .select({
      id: memo.id,
      ref: memo.ref,
      title: memo.title,
      status: memo.status,
      recommendation: memo.recommendation,
      proposedAmount: memo.proposedAmount,
      currentVersionNo: memo.currentVersionNo,
      updatedAt: memo.updatedAt,
      circulatedAt: memo.circulatedAt,
      authorName: member.displayName,
      companyName: company.name,
      applicationId: application.id,
      openComments: sql<number>`(
        select count(*)::int from ${memoComment}
        where ${memoComment}."memo_id" = ${memo}."id" and ${memoComment}."resolved_at" is null
      )`,
      sectionsFilled: sql<number>`(
        select count(*)::int from ${memoSection}
        where ${memoSection}."memo_id" = ${memo}."id"
          and ${memoSection}."version_id" is null and ${memoSection}."word_count" > 0
      )`,
      sectionsTotal: sql<number>`(
        select count(*)::int from ${memoSection}
        where ${memoSection}."memo_id" = ${memo}."id" and ${memoSection}."version_id" is null
      )`,
    })
    .from(memo)
    .innerJoin(application, eq(memo.applicationId, application.id))
    .innerJoin(company, eq(application.companyId, company.id))
    .innerJoin(member, eq(memo.authorMemberId, member.id))
    .where(eq(memo.orgId, orgId))
    .orderBy(desc(memo.updatedAt));
}

export async function getMemoDetail(orgId: string, memoId: string) {
  const [m] = await db
    .select({
      memo: memo,
      companyName: company.name,
      companyOneLiner: company.oneLiner,
      applicationId: application.id,
      amountRequested: application.amountRequested,
      authorName: member.displayName,
    })
    .from(memo)
    .innerJoin(application, eq(memo.applicationId, application.id))
    .innerJoin(company, eq(application.companyId, company.id))
    .innerJoin(member, eq(memo.authorMemberId, member.id))
    .where(and(eq(memo.id, memoId), eq(memo.orgId, orgId)))
    .limit(1);
  if (!m) return null;

  const [draftSections, versions, comments, rounds] = await Promise.all([
    db
      .select({
        id: memoSection.id,
        title: memoSection.title,
        position: memoSection.position,
        contentJson: memoSection.contentJson,
        contentText: memoSection.contentText,
        wordCount: memoSection.wordCount,
        guidance: memoTemplateSection.guidance,
        required: memoTemplateSection.required,
      })
      .from(memoSection)
      .leftJoin(memoTemplateSection, eq(memoSection.templateSectionId, memoTemplateSection.id))
      .where(and(eq(memoSection.memoId, memoId), isNull(memoSection.versionId)))
      .orderBy(asc(memoSection.position)),
    db
      .select({
        id: memoVersion.id,
        versionNo: memoVersion.versionNo,
        createdAt: memoVersion.createdAt,
        createdByName: member.displayName,
      })
      .from(memoVersion)
      .leftJoin(member, eq(memoVersion.createdByMemberId, member.id))
      .where(eq(memoVersion.memoId, memoId))
      .orderBy(desc(memoVersion.versionNo)),
    db
      .select({
        id: memoComment.id,
        sectionId: memoComment.sectionId,
        body: memoComment.body,
        createdAt: memoComment.createdAt,
        resolvedAt: memoComment.resolvedAt,
        authorName: member.displayName,
      })
      .from(memoComment)
      .innerJoin(member, eq(memoComment.authorMemberId, member.id))
      .where(eq(memoComment.memoId, memoId))
      .orderBy(asc(memoComment.createdAt)),
    db
      .select()
      .from(voteRound)
      .where(eq(voteRound.memoId, memoId))
      .orderBy(desc(voteRound.createdAt)),
  ]);

  return { ...m, draftSections, versions, comments, rounds };
}

export async function getVersionSections(orgId: string, memoId: string, versionId: string) {
  const [m] = await db
    .select({ id: memo.id })
    .from(memo)
    .where(and(eq(memo.id, memoId), eq(memo.orgId, orgId)))
    .limit(1);
  if (!m) return [];
  return db
    .select()
    .from(memoSection)
    .where(and(eq(memoSection.memoId, memoId), eq(memoSection.versionId, versionId)))
    .orderBy(asc(memoSection.position));
}

/**
 * THE ONLY reader of vote rows pre-reveal. Everything flows through the
 * pure redaction module; return its output verbatim (see src/lib/votes).
 */
export async function getVoteRoundResults(
  orgId: string,
  roundId: string,
  viewerMemberId: string
): Promise<(RedactedResults & { round: typeof voteRound.$inferSelect }) | null> {
  const [round] = await db
    .select()
    .from(voteRound)
    .where(and(eq(voteRound.id, roundId), eq(voteRound.orgId, orgId)))
    .limit(1);
  if (!round) return null;

  const [eligibility, ballots] = await Promise.all([
    db
      .select({
        memberId: voteEligibility.memberId,
        memberName: member.displayName,
        isRecused: voteEligibility.isRecused,
      })
      .from(voteEligibility)
      .innerJoin(member, eq(voteEligibility.memberId, member.id))
      .where(eq(voteEligibility.voteRoundId, roundId)),
    db
      .select({
        memberId: vote.memberId,
        memberName: member.displayName,
        decision: vote.decision,
        conviction: vote.conviction,
        suggestedAmount: vote.suggestedAmount,
        rationale: vote.rationale,
        submittedAt: vote.submittedAt,
      })
      .from(vote)
      .innerJoin(member, eq(vote.memberId, member.id))
      .where(eq(vote.voteRoundId, roundId)),
  ]);

  return { round, ...redactVoteResults(round, ballots, eligibility, viewerMemberId) };
}
