import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  applicationNote,
  coffeeChat,
  coffeeChatAttendee,
  company,
  contact,
  doc,
  grant,
  grantPool,
  member,
  memo,
  memoSection,
  outcomeUpdate,
  report,
  voteRound,
  type DeclineReason,
  type OutcomeTier,
  type ReportStatus,
} from "@/db/schema";
import { summarizePool } from "@/lib/grants/budget";
import { USE_OF_FUNDS_LABELS } from "@/components/grants/use-of-funds";
import { TIER_META } from "@/components/grants/tiers";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { medianAmount } from "@/lib/votes/suggest";
import { parseDoc } from "@/lib/rich-text";
import { getVoteRoundResults } from "./memos";
import { getReport, periodKey, type ReportRow } from "@/lib/reports/store";
import {
  composeFounders,
  composeRecommendation,
  finalizeBlockers,
  isCut,
  parseFundingRequestContent,
  prefillFundingRequest,
  stripVerdict,
  summarizeBallots,
  type FounderInput,
  type FundingRequestContent,
  type FundingRequestFacts,
} from "@/lib/reports/funding-request";
import {
  composeQuarterlyLetter,
  firstSentences,
  parseQuarterlyContent,
  type QuarterlyContent,
  type QuarterlyFigures,
  type QuarterlyLetter,
} from "@/lib/reports/quarterly";

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

type Org = { id: string; name: string; fiscalYearStartMonth: number };

// ——— Funding request ———

/** What the club already has on file, shown beside the editor and fed to drafts. */
export type FundingRequestSources = {
  memoSections: { title: string; text: string }[];
  coffeeChats: { date: string | null; debrief: string | null; notes: { memberName: string; note: string }[] }[];
  notes: { authorName: string; body: string }[];
  /** Revealed ballots only; empty until the round is revealed. */
  ballots: { fund: { memberName: string; rationale: string }[]; decline: { memberName: string; rationale: string }[] };
  useOfFundsNarrative: string | null;
};

export type FundingRequestView = {
  report: ReportRow | null;
  status: ReportStatus;
  content: FundingRequestContent;
  /** Frozen once the request is final; live while it is a draft. */
  facts: FundingRequestFacts;
  sources: FundingRequestSources;
  /** Why it can't be finalized yet; empty when ready. */
  blockers: string[];
};

/** Free-text co-founder answers some intake forms put in `custom`. */
function customCofounders(custom: Record<string, unknown>): string[] {
  return Object.entries(custom)
    .filter(([key, value]) => /co-?_?founder/i.test(key) && typeof value === "string" && value.trim())
    .map(([, value]) => (value as string).trim());
}

/**
 * Everything a funding request shows, for one application: the derived facts,
 * the stored (or prefilled) content and the source material. Vote rows are
 * read only through `getVoteRoundResults`, so nothing unrevealed gets here.
 */
export async function getFundingRequest(
  org: Pick<Org, "id" | "name">,
  applicationId: string,
  viewerMemberId: string
): Promise<FundingRequestView | null> {
  const [app] = await db
    .select()
    .from(application)
    .where(and(eq(application.id, applicationId), eq(application.orgId, org.id)))
    .limit(1);
  if (!app) return null;

  const [[co], contacts, [liveGrant], [latestMemo], [round], chats, notes, existing] = await Promise.all([
    db.select().from(company).where(eq(company.id, app.companyId)).limit(1),
    db
      .select({ firstName: contact.firstName, lastName: contact.lastName })
      .from(contact)
      .where(and(eq(contact.companyId, app.companyId), eq(contact.isFounder, true), isNull(contact.archivedAt)))
      .orderBy(desc(contact.isPrimary), asc(contact.createdAt)),
    db
      .select({
        amountAwarded: grant.amountAwarded,
        useOfFunds: grant.useOfFunds,
        useOfFundsNarrative: grant.useOfFundsNarrative,
      })
      .from(grant)
      .where(and(eq(grant.applicationId, applicationId), ne(grant.status, "cancelled")))
      .orderBy(desc(grant.createdAt))
      .limit(1),
    db
      .select({
        id: memo.id,
        proposedAmount: memo.proposedAmount,
        circulatedAt: memo.circulatedAt,
        updatedAt: memo.updatedAt,
        authorName: member.displayName,
      })
      .from(memo)
      .innerJoin(member, eq(memo.authorMemberId, member.id))
      .where(and(eq(memo.applicationId, applicationId), ne(memo.status, "archived")))
      .orderBy(desc(memo.createdAt))
      .limit(1),
    db
      .select({ id: voteRound.id, outcome: voteRound.outcome })
      .from(voteRound)
      .where(and(eq(voteRound.applicationId, applicationId), ne(voteRound.status, "cancelled")))
      .orderBy(desc(voteRound.createdAt))
      .limit(1),
    db
      .select({ id: coffeeChat.id, happenedAt: coffeeChat.happenedAt, debrief: coffeeChat.debrief })
      .from(coffeeChat)
      .where(eq(coffeeChat.applicationId, applicationId))
      .orderBy(asc(coffeeChat.createdAt)),
    db
      .select({ body: applicationNote.body, authorName: member.displayName })
      .from(applicationNote)
      .innerJoin(member, eq(applicationNote.authorMemberId, member.id))
      .where(eq(applicationNote.applicationId, applicationId))
      .orderBy(desc(applicationNote.pinned), desc(applicationNote.createdAt))
      .limit(12),
    getReport(org.id, "funding_request", periodKey.fundingRequest(applicationId)),
  ]);

  const [sections, attendeeNotes, results, [preparer]] = await Promise.all([
    latestMemo
      ? db
          .select({ title: memoSection.title, text: memoSection.contentText })
          .from(memoSection)
          .where(and(eq(memoSection.memoId, latestMemo.id), isNull(memoSection.versionId)))
          .orderBy(asc(memoSection.position))
      : Promise.resolve([]),
    chats.length
      ? db
          .select({
            coffeeChatId: coffeeChatAttendee.coffeeChatId,
            note: coffeeChatAttendee.note,
            memberName: member.displayName,
          })
          .from(coffeeChatAttendee)
          .innerJoin(member, eq(coffeeChatAttendee.memberId, member.id))
          .where(inArray(coffeeChatAttendee.coffeeChatId, chats.map((c) => c.id)))
      : Promise.resolve([]),
    round ? getVoteRoundResults(org.id, round.id, viewerMemberId) : Promise.resolve(null),
    existing?.createdByMemberId
      ? db.select({ name: member.displayName }).from(member).where(eq(member.id, existing.createdByMemberId)).limit(1)
      : Promise.resolve([]),
  ]);

  // `ballots` is empty until reveal — the redaction module guarantees it.
  const ballots = results?.revealed ? results.ballots : [];
  // Several voters often write the same thing; show each rationale once, with everyone who wrote it.
  const withRationale = (decision: string) => {
    const byText = new Map<string, string[]>();
    for (const b of ballots) {
      const text = b.rationale?.trim();
      if (b.decision !== decision || !text) continue;
      byText.set(text, [...(byText.get(text) ?? []), b.memberName]);
    }
    return [...byText].map(([rationale, names]) => ({ memberName: names.join(", "), rationale }));
  };

  const now = new Date();
  const applicantName = app.applicantName?.trim() ?? "";
  const founders: FounderInput[] = [
    ...(applicantName
      ? [{ name: applicantName, classYear: app.classYear, school: app.school, department: app.major ?? app.department }]
      : []),
    ...contacts
      .map((c) => ({ name: [c.firstName, c.lastName].filter(Boolean).join(" ") }))
      .filter((c) => c.name.toLowerCase() !== applicantName.toLowerCase()),
  ];
  const foundersLine = [composeFounders(founders, now), ...customCofounders(app.custom)].filter(Boolean).join(", ");

  const ballotMedian = medianAmount(ballots.filter((b) => b.decision === "fund").map((b) => b.suggestedAmount));
  const approved: Pick<FundingRequestFacts, "approvedTotal" | "approvedSource"> = liveGrant
    ? { approvedTotal: liveGrant.amountAwarded, approvedSource: "grant" }
    : latestMemo?.proposedAmount
      ? { approvedTotal: latestMemo.proposedAmount, approvedSource: "memo" }
      : ballotMedian
        ? { approvedTotal: ballotMedian, approvedSource: "ballots" }
        : { approvedTotal: null, approvedSource: null };

  const decision: FundingRequestFacts["decision"] =
    app.status === "declined" || (round?.outcome === "decline" && app.status !== "funded")
      ? "decline"
      : app.status === "funded" || round?.outcome === "fund" || liveGrant
        ? "fund"
        : "pending";

  const useOfFundsLabel = liveGrant ? USE_OF_FUNDS_LABELS[liveGrant.useOfFunds] : null;
  const useOfFundsNarrative = liveGrant?.useOfFundsNarrative ?? app.useOfFundsNarrative;

  const liveFacts: FundingRequestFacts = {
    applicationId,
    clubName: org.name,
    companyName: co.name,
    oneLiner: co.oneLiner,
    pitch: app.pitchSummary,
    founders: foundersLine,
    decision,
    askedTotal: app.amountRequested,
    ...approved,
    useOfFundsLabel,
    useOfFundsNarrative,
    recommendation: composeRecommendation({
      decision,
      approvedTotal: approved.approvedTotal,
      useOfFundsLabel,
      useOfFundsNarrative,
    }),
    vote: results?.revealed ? summarizeBallots(ballots) : null,
    memo: latestMemo
      ? {
          id: latestMemo.id,
          authorName: latestMemo.authorName,
          date: (latestMemo.circulatedAt ?? latestMemo.updatedAt).toISOString(),
        }
      : null,
    preparedBy: preparer?.name ?? null,
    preparedAt: (existing?.createdAt ?? now).toISOString(),
  };

  const memoSections = sections.filter((s) => s.text.trim());
  const sources: FundingRequestSources = {
    memoSections,
    coffeeChats: chats
      .map((c) => ({
        date: c.happenedAt?.toISOString() ?? null,
        debrief: c.debrief?.trim() || null,
        notes: attendeeNotes
          .filter((a) => a.coffeeChatId === c.id && a.note?.trim())
          .map((a) => ({ memberName: a.memberName, note: a.note!.trim() })),
      }))
      .filter((c) => c.debrief || c.notes.length > 0),
    notes,
    ballots: { fund: withRationale("fund"), decline: withRationale("decline") },
    useOfFundsNarrative: app.useOfFundsNarrative,
  };

  const status = existing?.status ?? "draft";
  const frozen = status !== "draft" && existing?.snapshot ? (existing.snapshot as FundingRequestFacts) : null;
  const facts = frozen ?? liveFacts;
  const content = existing
    ? parseFundingRequestContent(existing.content)
    : prefillFundingRequest({
        memoSections,
        oneLiner: co.oneLiner,
        pitch: app.pitchSummary,
        useOfFundsNarrative: app.useOfFundsNarrative,
        cut: isCut(liveFacts),
      });

  return {
    report: existing,
    status,
    content,
    facts,
    sources,
    blockers: status === "draft" ? finalizeBlockers(facts, content) : [],
  };
}

export type FundingRequestStatus = {
  status: ReportStatus;
  sentAt: Date | null;
  sentTo: string[] | null;
  finalizedAt: Date | null;
};

/** For the application page: is there a request, and how far along is it? */
export async function getFundingRequestStatus(
  orgId: string,
  applicationId: string
): Promise<FundingRequestStatus | null> {
  const row = await getReport(orgId, "funding_request", periodKey.fundingRequest(applicationId));
  if (!row || row.archivedAt) return null;
  return { status: row.status, sentAt: row.sentAt, sentTo: row.sentTo, finalizedAt: row.finalizedAt };
}

/** "Funding request: sent to dana@… on Nov 12" */
export function fundingRequestStatusLabel(
  status: FundingRequestStatus | null,
  approverName?: string
): string {
  if (!status) return "Funding request: not started";
  if (status.status === "sent" && status.sentAt) {
    const to = approverName?.trim() || status.sentTo?.[0] || "the approver";
    const on = status.sentAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Funding request: sent to ${to} on ${on}`;
  }
  return `Funding request: ${status.status}`;
}

// ——— Quarterly letter ———

export async function getQuarterlyFigures(
  orgId: string,
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4,
  fyStartMonth: number
): Promise<QuarterlyFigures> {
  const { start, end } = quarterWindow(fiscalYear, quarter, fyStartMonth);
  const inWindow = (column: typeof application.appliedAt | typeof grant.issuedAt | typeof outcomeUpdate.recordedAt) =>
    and(gte(column, start), lt(column, end));

  const [[received], [decided], [inReview], reasons, grantsInQuarter, [pool], updates, standing] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(application)
        .where(and(eq(application.orgId, orgId), isNull(application.archivedAt), inWindow(application.appliedAt))),
      db
        .select({
          funded: sql<number>`count(*) filter (where ${application.status} = 'funded')::int`,
          declined: sql<number>`count(*) filter (where ${application.status} = 'declined')::int`,
        })
        .from(application)
        .where(
          and(
            eq(application.orgId, orgId),
            isNull(application.archivedAt),
            gte(application.decidedAt, start),
            lt(application.decidedAt, end)
          )
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(application)
        .where(
          and(
            eq(application.orgId, orgId),
            isNull(application.archivedAt),
            inArray(application.status, ["open", "on_hold"]),
            lt(application.appliedAt, end)
          )
        ),
      db
        .select({ reason: application.declineReason, count: sql<number>`count(*)::int` })
        .from(application)
        .where(
          and(
            eq(application.orgId, orgId),
            eq(application.status, "declined"),
            gte(application.decidedAt, start),
            lt(application.decidedAt, end)
          )
        )
        .groupBy(application.declineReason)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          id: grant.id,
          applicationId: grant.applicationId,
          companyName: company.name,
          amountAwarded: grant.amountAwarded,
          useOfFunds: grant.useOfFunds,
          useOfFundsNarrative: grant.useOfFundsNarrative,
          issuedAt: grant.issuedAt,
        })
        .from(grant)
        .innerJoin(company, eq(grant.companyId, company.id))
        .where(and(eq(grant.orgId, orgId), ne(grant.status, "cancelled"), inWindow(grant.issuedAt)))
        .orderBy(asc(grant.issuedAt)),
      db
        .select()
        .from(grantPool)
        .where(and(eq(grantPool.orgId, orgId), eq(grantPool.fiscalYear, fiscalYear)))
        .limit(1),
      db
        .select({
          companyId: outcomeUpdate.companyId,
          companyName: company.name,
          tier: outcomeUpdate.tier,
          note: outcomeUpdate.note,
          recordedAt: outcomeUpdate.recordedAt,
        })
        .from(outcomeUpdate)
        .innerJoin(company, eq(outcomeUpdate.companyId, company.id))
        .where(and(eq(outcomeUpdate.orgId, orgId), inWindow(outcomeUpdate.recordedAt)))
        .orderBy(asc(outcomeUpdate.recordedAt)),
      db
        .select({ tier: company.outcomeTier, count: sql<number>`count(*)::int` })
        .from(company)
        .where(and(eq(company.orgId, orgId), eq(company.status, "portfolio")))
        .groupBy(company.outcomeTier),
    ]);

  const applicationIds = grantsInQuarter.map((g) => g.applicationId).filter((id): id is string => id !== null);
  const companyIds = [...new Set(updates.map((u) => u.companyId))];
  const [poolGrants, requests, recommendations, priorUpdates] = await Promise.all([
    // Pool state as of quarter end: only grants approved before it closed.
    pool
      ? db
          .select({ status: grant.status, amountAwarded: grant.amountAwarded })
          .from(grant)
          .where(
            and(
              eq(grant.poolId, pool.id),
              inArray(grant.status, ["approved", "issued", "cashed", "reconciled"]),
              lte(grant.approvedAt, end)
            )
          )
      : Promise.resolve([]),
    applicationIds.length
      ? db
          .select({ applicationId: report.applicationId, content: report.content })
          .from(report)
          .where(
            and(
              eq(report.orgId, orgId),
              eq(report.kind, "funding_request"),
              inArray(report.applicationId, applicationIds)
            )
          )
      : Promise.resolve([]),
    applicationIds.length
      ? db
          .select({ applicationId: memo.applicationId, text: memoSection.contentText })
          .from(memoSection)
          .innerJoin(memo, eq(memoSection.memoId, memo.id))
          .where(
            and(
              inArray(memo.applicationId, applicationIds),
              ne(memo.status, "archived"),
              isNull(memoSection.versionId),
              sql`${memoSection.title} ~* 'recommend|rationale'`
            )
          )
      : Promise.resolve([]),
    companyIds.length
      ? db
          .select({ companyId: outcomeUpdate.companyId, tier: outcomeUpdate.tier, recordedAt: outcomeUpdate.recordedAt })
          .from(outcomeUpdate)
          .where(and(inArray(outcomeUpdate.companyId, companyIds), lt(outcomeUpdate.recordedAt, end)))
          .orderBy(asc(outcomeUpdate.recordedAt))
      : Promise.resolve([]),
  ]);

  const whyFor = (applicationId: string | null) => {
    if (!applicationId) return null;
    const request = requests.find((r) => r.applicationId === applicationId);
    const fromRequest = request ? parseFundingRequestContent(request.content).rationaleFunding : "";
    const fromMemo = recommendations.find((r) => r.applicationId === applicationId)?.text ?? "";
    return firstSentences(stripVerdict(fromRequest || fromMemo));
  };

  const tierLabel = (tier: string | null) => TIER_META[tier as OutcomeTier]?.label ?? tier ?? "Not yet recorded";
  const summary = pool ? summarizePool(pool, poolGrants) : null;

  return {
    fiscalYear,
    quarter,
    start: start.toISOString(),
    end: end.toISOString(),
    asOf: new Date().toISOString(),
    inProgress: end.getTime() > Date.now(),
    pool:
      pool && summary
        ? {
            name: pool.name,
            budget: summary.total.toFixed(2),
            committed: summary.committed.toFixed(2),
            deployed: summary.deployed.toFixed(2),
            remaining: summary.remaining.toFixed(2),
          }
        : null,
    grants: grantsInQuarter.map((g) => ({
      id: g.id,
      applicationId: g.applicationId,
      companyName: g.companyName,
      amount: g.amountAwarded,
      useOfFundsLabel: USE_OF_FUNDS_LABELS[g.useOfFunds],
      paidFor: g.useOfFundsNarrative,
      why: whyFor(g.applicationId),
      issuedAt: g.issuedAt?.toISOString() ?? null,
    })),
    pipeline: {
      received: received?.count ?? 0,
      funded: decided?.funded ?? 0,
      declined: decided?.declined ?? 0,
      inReview: inReview?.count ?? 0,
      declineReasons: reasons
        .filter((r) => r.reason)
        .map((r) => ({ label: DECLINE_REASON_LABELS[r.reason as DeclineReason] ?? r.reason!, count: r.count })),
    },
    portfolio: {
      updates: updates.map((u) => {
        const previous = priorUpdates
          .filter((p) => p.companyId === u.companyId && p.recordedAt < u.recordedAt)
          .at(-1);
        return {
          companyName: u.companyName,
          tierLabel: tierLabel(u.tier),
          note: u.note,
          // The first recorded tier counts as a move: it is news to the reader.
          changed: !previous || previous.tier !== u.tier,
        };
      }),
      standing: standing
        .filter((s) => s.tier)
        .sort(
          (a, b) =>
            Object.keys(TIER_META).indexOf(b.tier as string) - Object.keys(TIER_META).indexOf(a.tier as string)
        )
        .map((s) => ({ tierLabel: tierLabel(s.tier), count: s.count })),
    },
  };
}

export type QuarterlyLetterView = {
  report: ReportRow | null;
  status: ReportStatus;
  content: QuarterlyContent;
  /** Frozen once the letter is final; live while it is a draft. */
  figures: QuarterlyFigures;
  letter: QuarterlyLetter;
};

/**
 * The quarter's letter: stored content, figures (the snapshot once final) and
 * the composed sentences. Before anyone has edited it, the opening is carried
 * over from the commentary doc the old LP report used.
 */
export async function getQuarterlyLetter(
  org: Pick<Org, "id" | "fiscalYearStartMonth">,
  fiscalYear: number,
  quarter: 1 | 2 | 3 | 4
): Promise<QuarterlyLetterView> {
  const existing = await getReport(org.id, "quarterly", periodKey.quarterly(fiscalYear, quarter));
  const status = existing?.status ?? "draft";
  const frozen = status !== "draft" && existing?.snapshot ? (existing.snapshot as QuarterlyFigures) : null;
  const figures = frozen ?? (await getQuarterlyFigures(org.id, fiscalYear, quarter, org.fiscalYearStartMonth));

  let content = parseQuarterlyContent(existing?.content);
  if (!existing) {
    const legacy = await getLegacyCommentary(org.id, fiscalYear, quarter);
    if (legacy) content = { ...content, opening: legacy };
  }
  return { report: existing, status, content, figures, letter: composeQuarterlyLetter(figures, content.grantNotes) };
}

/** Commentary written under the old flow, stored in a doc with a known slug. */
export async function getLegacyCommentary(orgId: string, fiscalYear: number, quarter: number) {
  const [row] = await db
    .select({ contentJson: doc.contentJson })
    .from(doc)
    .where(and(eq(doc.orgId, orgId), eq(doc.slug, `lp-report-${fiscalYear}-q${quarter}`), isNull(doc.archivedAt)))
    .limit(1);
  const parsed = parseDoc(row?.contentJson);
  return parsed ? (parsed as Record<string, unknown>) : null;
}

// ——— Hub ———

export type HubFundingRow = {
  applicationId: string;
  companyName: string;
  amount: string | null;
  decidedAt: Date | null;
  status: ReportStatus | "needed";
  sentAt: Date | null;
  sentTo: string[] | null;
  updatedAt: Date | null;
};

export async function getReportsHub(org: Org) {
  const [funded, reports] = await Promise.all([
    // Every company the club decided to fund, plus any other application someone started a request for.
    db
      .select({
        applicationId: application.id,
        companyName: company.name,
        decidedAt: application.decidedAt,
        amount: sql<string | null>`(
          select g.amount_awarded from "grant" g
          where g.application_id = ${application.id} and g.status <> 'cancelled'
          order by g.created_at desc limit 1
        )`,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(
        and(
          eq(application.orgId, org.id),
          isNull(application.archivedAt),
          or(
            eq(application.status, "funded"),
            sql`exists (
              select 1 from report r
              where r.application_id = ${application.id} and r.kind = 'funding_request' and r.archived_at is null
            )`
          )
        )
      )
      .orderBy(desc(application.decidedAt)),
    db
      .select({
        id: report.id,
        kind: report.kind,
        periodKey: report.periodKey,
        applicationId: report.applicationId,
        title: report.title,
        status: report.status,
        sentAt: report.sentAt,
        sentTo: report.sentTo,
        updatedAt: report.updatedAt,
      })
      .from(report)
      .where(and(eq(report.orgId, org.id), isNull(report.archivedAt)))
      .orderBy(desc(report.updatedAt)),
  ]);

  const requestByApp = new Map(
    reports.filter((r) => r.kind === "funding_request" && r.applicationId).map((r) => [r.applicationId!, r])
  );
  const fundingRows: HubFundingRow[] = funded.map((f) => {
    const r = requestByApp.get(f.applicationId);
    return {
      applicationId: f.applicationId,
      companyName: f.companyName,
      amount: f.amount,
      decidedAt: f.decidedAt,
      status: r?.status ?? "needed",
      sentAt: r?.sentAt ?? null,
      sentTo: r?.sentTo ?? null,
      updatedAt: r?.updatedAt ?? null,
    };
  });

  const current = currentFiscalQuarter(org.fiscalYearStartMonth);
  const quarterlies = reports
    .filter((r) => r.kind === "quarterly")
    .map((r) => {
      const m = r.periodKey.match(/^FY(\d{4})-Q([1-4])$/);
      return m ? { ...r, fiscalYear: Number(m[1]), quarter: Number(m[2]) as 1 | 2 | 3 | 4 } : null;
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.fiscalYear - a.fiscalYear || b.quarter - a.quarter);

  return {
    fundingRows,
    current,
    currentLetter:
      quarterlies.find((q) => q.fiscalYear === current.fiscalYear && q.quarter === current.quarter) ?? null,
    pastLetters: quarterlies.filter(
      (q) => !(q.fiscalYear === current.fiscalYear && q.quarter === current.quarter)
    ),
    annual: reports.filter((r) => r.kind === "annual"),
  };
}
