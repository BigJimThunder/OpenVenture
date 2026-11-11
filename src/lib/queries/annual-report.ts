import Decimal from "decimal.js";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  coffeeChat,
  company,
  contact,
  grant,
  grantPool,
  meeting,
  member,
  memo,
  memoSection,
  organization,
  outcomeUpdate,
  voteRound,
  type DeclineReason,
} from "@/db/schema";
import { COMMITTED_STATUSES } from "@/lib/grants/budget";
import { USE_OF_FUNDS_LABELS } from "@/components/grants/use-of-funds";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { getVoteRoundResults } from "@/lib/queries/memos";
import { getReport, periodKey, type ReportRow } from "@/lib/reports/store";
import { parseFundingRequestContent } from "@/lib/reports/funding-request";
import {
  computeActivityStats,
  computeFacts,
  fiscalYearLabel,
  fiscalYearWindow,
  grantDate,
  inWindow,
  parseAnnualContent,
  parseAnnualSnapshot,
  type AnnualContent,
  type AnnualDerived,
  type DerivedCompany,
  type EssayMaterial,
  type Founder,
} from "@/lib/reports/annual";

type Org = typeof organization.$inferSelect;

function sameName(a: string | null, b: string | null) {
  return Boolean(a && b) && a!.trim().toLowerCase() === b!.trim().toLowerCase();
}

/** Founders from the company's contacts; the applicant's class year comes from the application. */
function foundersFor(
  contacts: { companyId: string | null; firstName: string; lastName: string | null }[],
  companyId: string,
  app: { applicantName: string | null; classYear: number | null } | undefined
): Founder[] {
  const names = contacts
    .filter((c) => c.companyId === companyId)
    .map((c) => [c.firstName, c.lastName].filter(Boolean).join(" "));
  if (names.length === 0 && app?.applicantName) names.push(app.applicantName);
  return names.map((name) => ({
    name,
    classYear:
      app?.classYear && (names.length === 1 || sameName(name, app.applicantName)) ? app.classYear : null,
  }));
}

/**
 * Everything the app knows about one fiscal year, shaped for the annual
 * report. No demographics and no ballots are read here: votes appear only as
 * a count of rounds held.
 */
export async function getAnnualDerived(org: Org, fiscalYear: number): Promise<AnnualDerived> {
  const orgId = org.id;
  const window = fiscalYearWindow(fiscalYear, org.fiscalYearStartMonth);
  const now = new Date();

  const [apps, chats, memos, rounds, grants, pools, meetings, members] = await Promise.all([
    db
      .select({
        id: application.id,
        companyId: application.companyId,
        companyName: company.name,
        oneLiner: company.oneLiner,
        status: application.status,
        appliedAt: application.appliedAt,
        decidedAt: application.decidedAt,
        updatedAt: application.updatedAt,
        declineReason: application.declineReason,
        department: application.department,
        applicantName: application.applicantName,
        classYear: application.classYear,
        ownerMemberId: application.ownerMemberId,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.orgId, orgId), isNull(application.archivedAt))),
    db
      .select({ applicationId: coffeeChat.applicationId, happenedAt: coffeeChat.happenedAt })
      .from(coffeeChat)
      .where(and(eq(coffeeChat.orgId, orgId), isNotNull(coffeeChat.happenedAt))),
    db
      .select({
        applicationId: memo.applicationId,
        authorMemberId: memo.authorMemberId,
        createdAt: memo.createdAt,
      })
      .from(memo)
      .where(and(eq(memo.orgId, orgId), ne(memo.status, "archived")))
      .orderBy(desc(memo.createdAt)),
    // Rounds only — never ballots. A round counts once it has closed.
    db
      .select({
        applicationId: voteRound.applicationId,
        status: voteRound.status,
        heldAt: sql<Date>`coalesce(${voteRound.revealedAt}, ${voteRound.closesAt}, ${voteRound.createdAt})`.mapWith(
          (v) => new Date(v as string)
        ),
      })
      .from(voteRound)
      .where(and(eq(voteRound.orgId, orgId), inArray(voteRound.status, ["open", "closed", "revealed"]))),
    db
      .select({
        companyId: grant.companyId,
        applicationId: grant.applicationId,
        poolId: grant.poolId,
        status: grant.status,
        amountAwarded: grant.amountAwarded,
        useOfFunds: grant.useOfFunds,
        useOfFundsNarrative: grant.useOfFundsNarrative,
        approvedAt: grant.approvedAt,
        issuedAt: grant.issuedAt,
        companyName: company.name,
        oneLiner: company.oneLiner,
        logoUrl: company.logoUrl,
        outcomeTier: company.outcomeTier,
      })
      .from(grant)
      .innerJoin(company, eq(grant.companyId, company.id))
      .where(and(eq(grant.orgId, orgId), inArray(grant.status, [...COMMITTED_STATUSES])))
      .orderBy(asc(sql`coalesce(${grant.issuedAt}, ${grant.approvedAt})`)),
    db
      .select()
      .from(grantPool)
      .where(and(eq(grantPool.orgId, orgId), eq(grantPool.fiscalYear, fiscalYear))),
    db
      .select({ title: meeting.title, kind: meeting.kind, status: meeting.status, scheduledAt: meeting.scheduledAt })
      .from(meeting)
      .where(
        and(eq(meeting.orgId, orgId), gte(meeting.scheduledAt, window.start), lt(meeting.scheduledAt, window.end))
      )
      .orderBy(asc(meeting.scheduledAt)),
    db
      .select({
        id: member.id,
        name: member.displayName,
        role: member.role,
        title: member.title,
        classYear: member.classYear,
        bio: member.bio,
        avatarUrl: member.avatarUrl,
      })
      .from(member)
      .where(
        and(
          eq(member.orgId, orgId),
          inArray(member.status, ["active", "alumni"]),
          lt(member.joinedAt, window.end),
          or(isNull(member.offboardedAt), gte(member.offboardedAt, window.start))
        )
      )
      .orderBy(asc(member.displayName)),
  ]);

  const pool = pools[0] ?? null;
  const appById = new Map(apps.map((a) => [a.id, a]));

  // Companies: a spread for each one funded this year; earlier ones are offered, not included.
  const funded = grants.filter((g) => {
    const date = grantDate(g);
    return date !== null && date.getTime() < window.end.getTime();
  });
  const companyIds = [...new Set(funded.map((g) => g.companyId))];
  const [contacts, updates] = await Promise.all([
    companyIds.length > 0
      ? db
          .select({ companyId: contact.companyId, firstName: contact.firstName, lastName: contact.lastName })
          .from(contact)
          .where(
            and(
              eq(contact.orgId, orgId),
              inArray(contact.companyId, companyIds),
              eq(contact.isFounder, true),
              isNull(contact.archivedAt)
            )
          )
          .orderBy(desc(contact.isPrimary), asc(contact.createdAt))
      : [],
    companyIds.length > 0
      ? db
          .select({
            companyId: outcomeUpdate.companyId,
            tier: outcomeUpdate.tier,
            note: outcomeUpdate.note,
            recordedAt: outcomeUpdate.recordedAt,
          })
          .from(outcomeUpdate)
          .where(and(eq(outcomeUpdate.orgId, orgId), inArray(outcomeUpdate.companyId, companyIds)))
          .orderBy(asc(outcomeUpdate.recordedAt))
      : [],
  ]);

  const companies: DerivedCompany[] = companyIds.map((companyId) => {
    const own = funded.filter((g) => g.companyId === companyId);
    const first = own[0];
    const inYear = own.filter((g) => inWindow(grantDate(g), window));
    const counted = inYear.length > 0 ? inYear : own;
    const applicationId =
      counted.find((g) => g.applicationId)?.applicationId ??
      apps.find((a) => a.companyId === companyId && a.status === "funded")?.id ??
      null;
    const app = applicationId ? appById.get(applicationId) : undefined;
    const grantedAt = grantDate(counted[0]);
    const uses = [...new Set(counted.map((g) => USE_OF_FUNDS_LABELS[g.useOfFunds]))];
    return {
      companyId,
      applicationId,
      name: first.companyName,
      oneLiner: first.oneLiner,
      logoUrl: first.logoUrl,
      founders: foundersFor(contacts, companyId, app),
      grantTotal: counted.reduce((sum, g) => sum.add(g.amountAwarded), new Decimal(0)).toFixed(2),
      grantUse: uses.join(" and ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
      grantNarrative: counted.find((g) => g.useOfFundsNarrative)?.useOfFundsNarrative ?? null,
      grantedAt: grantedAt?.toISOString() ?? null,
      inFiscalYear: inYear.length > 0,
      outcomeTier: first.outcomeTier,
      updates: updates
        .filter((u) => u.companyId === companyId && (!grantedAt || u.recordedAt >= grantedAt))
        .map((u) => ({ tier: u.tier, note: u.note, recordedAt: u.recordedAt.toISOString() })),
      defaultAuthorId:
        (applicationId ? memos.find((m) => m.applicationId === applicationId)?.authorMemberId : null) ??
        app?.ownerMemberId ??
        null,
    };
  });
  // This year's companies first, in the order they were funded.
  companies.sort((a, b) => Number(b.inFiscalYear) - Number(a.inFiscalYear));

  // "Supported but didn't fund": decided this year after at least a coffee chat.
  const engaged = new Set([
    ...chats.map((c) => c.applicationId),
    ...memos.map((m) => m.applicationId),
    ...rounds.map((r) => r.applicationId),
  ]);
  const fundedCompanies = new Set(companyIds);
  const candidates = apps.filter(
    (a) =>
      (a.status === "declined" || a.status === "withdrawn") &&
      inWindow(a.decidedAt ?? a.updatedAt, window) &&
      engaged.has(a.id) &&
      !fundedCompanies.has(a.companyId)
  );
  const candidateCompanyIds = [...new Set(candidates.map((a) => a.companyId))];
  const candidateContacts =
    candidateCompanyIds.length > 0
      ? await db
          .select({ companyId: contact.companyId, firstName: contact.firstName, lastName: contact.lastName })
          .from(contact)
          .where(
            and(
              eq(contact.orgId, orgId),
              inArray(contact.companyId, candidateCompanyIds),
              eq(contact.isFounder, true),
              isNull(contact.archivedAt)
            )
          )
          .orderBy(desc(contact.isPrimary), asc(contact.createdAt))
      : [];

  const declined = apps.filter((a) => a.status === "declined" && inWindow(a.decidedAt, window));
  const reasonCounts = new Map<string, number>();
  for (const a of declined) {
    const label = DECLINE_REASON_LABELS[(a.declineReason ?? "other") as DeclineReason] ?? "Other";
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  }
  const departmentCounts = new Map<string, number>();
  for (const a of apps) {
    if (!a.department || !inWindow(a.appliedAt, window)) continue;
    departmentCounts.set(a.department, (departmentCounts.get(a.department) ?? 0) + 1);
  }
  const poolGrants = pool ? grants.filter((g) => g.poolId === pool.id) : [];
  const label = fiscalYearLabel(fiscalYear, org.fiscalYearStartMonth);
  const inProgress = window.end.getTime() > now.getTime();

  return {
    fiscalYear,
    label,
    window: { start: window.start.toISOString(), end: window.end.toISOString() },
    inProgress,
    computedAt: now.toISOString(),
    org: { name: org.name, schoolName: org.schoolName, logoUrl: org.logoUrl },
    stats: computeActivityStats(
      {
        applications: apps,
        coffeeChats: chats,
        memos,
        voteRounds: rounds,
        grants,
        meetings,
        pool,
        poolGrants,
      },
      window
    ),
    members,
    companies,
    unfunded: candidates.map((a) => ({
      applicationId: a.id,
      name: a.companyName,
      oneLiner: a.oneLiner,
      founders: foundersFor(candidateContacts, a.companyId, a),
      status: a.status as "declined" | "withdrawn",
    })),
    meetings: meetings
      .filter((m) => m.status === "completed")
      .map((m) => ({ title: m.title, kind: m.kind, date: m.scheduledAt.toISOString() })),
    facts: computeFacts({
      label,
      inProgress,
      pool,
      poolGrants,
      declineReasons: [...reasonCounts].map(([l, count]) => ({ label: l, count })),
      departments: [...departmentCounts].map(([l, count]) => ({ label: l, count })),
    }),
  };
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

const FR_LABELS = {
  summary: "Summary",
  team: "Team",
  feasibility: "Feasibility",
  impact: "Impact",
  value: "Value of the grant",
  rationaleFunding: "Why this amount",
} as const;

/**
 * What the club already wrote about each company: memo sections, the funding
 * request, coffee-chat debriefs and — for REVEALED rounds only — ballot
 * rationales with the names removed. This is the only material the essay
 * starter and the AI draft are allowed to draw on.
 */
export async function getAnnualMaterials(
  orgId: string,
  viewerMemberId: string,
  companies: DerivedCompany[]
): Promise<Record<string, EssayMaterial>> {
  const appIds = companies.map((c) => c.applicationId).filter((x): x is string => Boolean(x));
  if (appIds.length === 0) {
    return Object.fromEntries(companies.map((c) => [c.companyId, emptyMaterial(c, null)]));
  }

  const [apps, memoRows, chats, rounds] = await Promise.all([
    db
      .select({ id: application.id, pitchSummary: application.pitchSummary })
      .from(application)
      .where(and(eq(application.orgId, orgId), inArray(application.id, appIds))),
    db
      .select({
        applicationId: memo.applicationId,
        memoId: memo.id,
        createdAt: memo.createdAt,
        title: memoSection.title,
        text: memoSection.contentText,
        position: memoSection.position,
      })
      .from(memo)
      .innerJoin(memoSection, and(eq(memoSection.memoId, memo.id), isNull(memoSection.versionId)))
      .where(and(eq(memo.orgId, orgId), inArray(memo.applicationId, appIds), ne(memo.status, "archived")))
      .orderBy(desc(memo.createdAt), asc(memoSection.position)),
    db
      .select({ applicationId: coffeeChat.applicationId, happenedAt: coffeeChat.happenedAt, debrief: coffeeChat.debrief })
      .from(coffeeChat)
      .where(
        and(eq(coffeeChat.orgId, orgId), inArray(coffeeChat.applicationId, appIds), isNotNull(coffeeChat.happenedAt))
      )
      .orderBy(asc(coffeeChat.happenedAt)),
    db
      .select({ id: voteRound.id, applicationId: voteRound.applicationId })
      .from(voteRound)
      .where(
        and(eq(voteRound.orgId, orgId), inArray(voteRound.applicationId, appIds), eq(voteRound.status, "revealed"))
      ),
  ]);

  // Ballots go through the one sanctioned reader, which returns none unless the round is revealed.
  const rationales = new Map<string, string[]>();
  for (const round of rounds) {
    const results = await getVoteRoundResults(orgId, round.id, viewerMemberId);
    if (!results?.revealed) continue;
    const list = rationales.get(round.applicationId) ?? [];
    for (const b of results.ballots) if (b.rationale?.trim()) list.push(clip(b.rationale.trim(), 500));
    rationales.set(round.applicationId, list);
  }

  const requests = new Map<string, EssayMaterial["fundingRequest"]>();
  for (const appId of appIds) {
    const row = await getReport(orgId, "funding_request", periodKey.fundingRequest(appId));
    if (!row) continue;
    const fr = parseFundingRequestContent(row.content);
    requests.set(
      appId,
      (Object.keys(FR_LABELS) as (keyof typeof FR_LABELS)[])
        .filter((k) => fr[k].trim())
        .map((k) => ({ title: FR_LABELS[k], text: clip(fr[k].trim(), 1500) }))
    );
  }

  return Object.fromEntries(
    companies.map((c) => {
      const appId = c.applicationId;
      const newestMemo = memoRows.find((m) => m.applicationId === appId)?.memoId;
      return [
        c.companyId,
        {
          ...emptyMaterial(c, apps.find((a) => a.id === appId)?.pitchSummary ?? null),
          memoSections: memoRows
            .filter((m) => m.memoId === newestMemo && m.text.trim())
            .map((m) => ({ title: m.title, text: clip(m.text.trim(), 1800) })),
          fundingRequest: (appId && requests.get(appId)) || [],
          debriefs: chats
            .filter((ch) => ch.applicationId === appId && ch.debrief?.trim())
            .map((ch) => ({ date: ch.happenedAt!.toISOString(), text: clip(ch.debrief!.trim(), 1500) })),
          rationales: (appId && rationales.get(appId)) || [],
        } satisfies EssayMaterial,
      ];
    })
  );
}

function emptyMaterial(c: DerivedCompany, pitchSummary: string | null): EssayMaterial {
  return {
    companyName: c.name,
    oneLiner: c.oneLiner,
    founders: c.founders,
    pitchSummary,
    grantUse: c.grantUse,
    grantNarrative: c.grantNarrative,
    memoSections: [],
    fundingRequest: [],
    debriefs: [],
    rationales: [],
  };
}

export type AnnualReportView = {
  report: ReportRow;
  content: AnnualContent;
  /** Frozen facts once finalized; live numbers while the report is a draft. */
  derived: AnnualDerived;
  frozen: boolean;
};

/**
 * One annual report, ready to render or export: the stored content plus the
 * facts it should be read against. Returns null when no report has been
 * started for that fiscal year.
 */
export async function getAnnualReportView(org: Org, fiscalYear: number): Promise<AnnualReportView | null> {
  const report = await getReport(org.id, "annual", periodKey.annual(fiscalYear));
  if (!report) return null;
  const snapshot = report.status === "draft" ? null : parseAnnualSnapshot(report.snapshot);
  return {
    report,
    content: parseAnnualContent(report.content),
    derived: snapshot ?? (await getAnnualDerived(org, fiscalYear)),
    frozen: snapshot !== null,
  };
}
