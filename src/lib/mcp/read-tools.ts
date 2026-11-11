import { and, asc, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItem,
  application,
  company,
  dealSource,
  meeting,
  memo,
  sector,
  voteEligibility,
  voteRound,
  APPLICATION_PRIORITIES,
  DECLINE_REASONS,
  OUTCOME_TIERS,
} from "@/db/schema";
import { roleAtLeast, type Ctx } from "@/lib/actions/context";
import { searchEverything } from "@/lib/actions/search";
import { appUrl } from "@/lib/notify";
import { formatRef } from "@/lib/refs";
import { getApplicationDetail, getPipeline } from "@/lib/queries/applications";
import { getInbox } from "@/lib/queries/dashboard";
import { getGrantsList, getPools, getPoolSummary } from "@/lib/queries/grants";
import { getMeetingDetail, getMeetingsList } from "@/lib/queries/meetings";
import { getMemoDetail, getMemosList, getVoteRoundResults } from "@/lib/queries/memos";
import { getRoster } from "@/lib/queries/members";
import { getReportById, listReports, type ReportRow } from "@/lib/reports/store";
import { effectiveRoundStatus } from "@/lib/votes/status";
import { toolsFor, type ToolInput } from "./catalog";
import { reportUrl } from "./reports";
import {
  iso,
  liveCriteria,
  liveStages,
  money,
  resolveApplication,
  resolveMeeting,
  resolveMemo,
  ToolError,
  urls,
} from "./resolve";

/**
 * Read tools. Each one calls the same query helper its screen uses, scoped to
 * the token's org, and reshapes the result into something compact for a model:
 * refs, ISO dates, money as strings, a URL back into the app.
 *
 * Two things never leave this file: vote rows before reveal (everything goes
 * through getVoteRoundResults, and pre-reveal only the member's own ballot is
 * returned) and founder demographics (never queried).
 */

const DAY_MS = 86_400_000;
const appRef = (ref: number) => formatRef("application", ref);

export async function whoami(_input: ToolInput<"whoami">, ctx: Ctx) {
  const scope = ctx.tokenScope ?? "read";
  return {
    member: {
      id: ctx.member.id,
      name: ctx.member.displayName,
      email: ctx.member.email,
      role: ctx.member.role,
      title: ctx.member.title,
    },
    club: { name: ctx.org.name, timezone: ctx.org.timezone },
    token_scope: scope,
    tools: toolsFor(ctx.member.role, scope),
    app_url: appUrl(),
    now: new Date().toISOString(),
  };
}

export async function getClub(_input: ToolInput<"get_club">, ctx: Ctx) {
  const orgId = ctx.org.id;
  const [stages, roster, sectors, sources, criteria] = await Promise.all([
    liveStages(orgId),
    getRoster(orgId),
    db
      .select({ id: sector.id, name: sector.name })
      .from(sector)
      .where(and(eq(sector.orgId, orgId), isNull(sector.archivedAt)))
      .orderBy(asc(sector.position)),
    db
      .select({ id: dealSource.id, name: dealSource.name })
      .from(dealSource)
      .where(and(eq(dealSource.orgId, orgId), isNull(dealSource.archivedAt)))
      .orderBy(asc(dealSource.name)),
    liveCriteria(orgId),
  ]);
  return {
    club: { name: ctx.org.name, timezone: ctx.org.timezone, fiscal_year_start_month: ctx.org.fiscalYearStartMonth },
    stages: stages.map((s) => ({ id: s.id, name: s.name, slug: s.slug, kind: s.kind, sla_days: s.slaDays })),
    members: roster
      .filter((m) => m.status === "active")
      .map((m) => ({ id: m.id, name: m.displayName, role: m.role, title: m.title })),
    sectors,
    deal_sources: sources,
    screening_criteria: criteria,
    decline_reasons: DECLINE_REASONS,
    priorities: APPLICATION_PRIORITIES,
    outcome_tiers: OUTCOME_TIERS,
  };
}

export async function getInboxTool(_input: ToolInput<"get_inbox">, ctx: Ctx) {
  const inbox = await getInbox(ctx.org.id, ctx.member.id);
  const now = Date.now();
  const applicationRow = (a: (typeof inbox.needsSomeone)[number]) => {
    const daysInStage = Math.floor((now - a.enteredStageAt.getTime()) / DAY_MS);
    return {
      ref: appRef(a.ref),
      company: a.companyName,
      stage: a.stageName,
      days_in_stage: daysInStage,
      past_stage_deadline: a.slaDays != null && a.slaDays > 0 && daysInStage > a.slaDays,
      next_step: a.nextStep,
      next_step_due: iso(a.nextStepDue),
      owner: a.ownerName,
      url: urls.application(a.id),
    };
  };
  return {
    needs_me: {
      // Open rounds this member has not voted in. Their own status only.
      votes_to_cast: inbox.needsMe.ballots.map((r) => ({
        title: r.title,
        closes_at: iso(r.closesAt),
        vote_url: urls.vote(r.memoId),
      })),
      applications: inbox.needsMe.applications.map(applicationRow),
      action_items: inbox.needsMe.tasks.map((t) => ({
        ref: formatRef("actionItem", t.ref),
        title: t.title,
        due_at: iso(t.dueAt),
        overdue: t.dueAt != null && t.dueAt.getTime() < now,
      })),
      memos_to_read: inbox.needsMe.memos.map((m) => ({
        ref: formatRef("memo", m.ref),
        title: m.title,
        author: m.authorName,
        circulated_at: iso(m.circulatedAt),
        url: urls.memo(m.id),
      })),
      count: inbox.needsMe.count,
    },
    needs_someone: inbox.needsSomeone.map(applicationRow),
    next_meeting: inbox.nextMeeting
      ? {
          ref: formatRef("meeting", inbox.nextMeeting.ref),
          title: inbox.nextMeeting.title,
          scheduled_at: iso(inbox.nextMeeting.scheduledAt),
          location: inbox.nextMeeting.location,
          url: urls.meeting(inbox.nextMeeting.id),
        }
      : null,
    club: {
      open_applications: inbox.openApplications,
      open_votes: inbox.openVotes,
      budget_remaining: inbox.budget ? money(inbox.budget.remaining) : null,
    },
    url: appUrl("/inbox"),
  };
}

export async function listApplications(input: ToolInput<"list_applications">, ctx: Ctx) {
  const { stages, apps } = await getPipeline(ctx.org.id);
  const stageById = new Map(stages.map((s) => [s.id, s]));

  let stageId: string | null = null;
  if (input.stage) {
    const wanted = input.stage.toLowerCase();
    const stage = stages.find((s) => s.name.toLowerCase() === wanted || s.slug.toLowerCase() === wanted);
    if (!stage) {
      throw new ToolError(`No stage called "${input.stage}". The stages are: ${stages.map((s) => s.name).join(", ")}.`);
    }
    stageId = stage.id;
  }
  const ownerId = input.owner === "me" ? ctx.member.id : input.owner;
  const needle = input.search?.toLowerCase();

  const matches = apps
    .filter((a) => input.status === "any" || a.status === input.status)
    .filter((a) => !stageId || a.stageId === stageId)
    .filter((a) => {
      if (!ownerId) return true;
      return ownerId === "unowned" ? a.ownerId == null : a.ownerId === ownerId;
    })
    .filter(
      (a) =>
        !needle ||
        [a.companyName, a.companyOneLiner, a.companyDomain].some((v) => v?.toLowerCase().includes(needle))
    )
    .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());

  return {
    total: matches.length,
    applications: matches.slice(0, input.limit).map((a) => ({
      ref: appRef(a.ref),
      id: a.id,
      company: a.companyName,
      one_liner: a.companyOneLiner,
      stage: stageById.get(a.stageId)?.name ?? null,
      status: a.status,
      priority: a.priority,
      owner: a.ownerName,
      amount_requested: money(a.amountRequested),
      next_step: a.nextStep,
      applied_at: iso(a.appliedAt),
      entered_stage_at: iso(a.enteredStageAt),
      url: urls.application(a.id),
    })),
  };
}

export async function getApplication(input: ToolInput<"get_application">, ctx: Ctx) {
  const found = await resolveApplication(ctx.org.id, input.application);
  const detail = await getApplicationDetail(ctx.org.id, found.id);
  if (!detail) throw new ToolError(`No application ${input.application} in this club.`);
  const { app, company: co } = detail;
  const stage = detail.stages.find((s) => s.id === app.stageId);
  const seesContact = roleAtLeast(ctx.member.role, "analyst");

  return {
    ref: appRef(app.ref),
    id: app.id,
    url: urls.application(app.id),
    company: {
      name: co.name,
      one_liner: co.oneLiner,
      description: co.description,
      domain: co.domain,
      website: co.websiteUrl,
      sectors: detail.sectors.map((s) => s.name),
      outcome_tier: co.outcomeTier,
    },
    status: app.status,
    stage: stage?.name ?? null,
    stage_kind: stage?.kind ?? null,
    days_in_stage: Math.floor((Date.now() - app.enteredStageAt.getTime()) / DAY_MS),
    stage_deadline_days: stage?.slaDays ?? null,
    priority: app.priority,
    owner: detail.owner ? { id: detail.owner.id, name: detail.owner.displayName } : null,
    applied_at: iso(app.appliedAt),
    founder: {
      name: app.applicantName,
      // Contact details are for members who work the pipeline.
      ...(seesContact ? { email: app.applicantEmail } : {}),
      department: app.department,
      class_year: app.classYear,
      team_size: app.teamSize,
    },
    ask: {
      amount_requested: money(app.amountRequested),
      use_of_funds: app.useOfFundsNarrative,
      pitch_summary: app.pitchSummary,
    },
    next_step: app.nextStep,
    next_step_due: iso(app.nextStepDue),
    decline: app.declineReason ? { reason: app.declineReason, note: app.declineNote } : null,
    decided_at: iso(app.decidedAt),
    screening: detail.criteria.map((c) => {
      const scores = detail.scores.filter((s) => s.criterionId === c.id);
      const mine = scores.find((s) => s.scoredByMemberId === ctx.member.id);
      return {
        criterion_id: c.id,
        criterion: c.label,
        average: scores.length
          ? Number((scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(2))
          : null,
        reviewers: scores.length,
        my_score: mine?.score ?? null,
      };
    }),
    coffee_chats: detail.chats.map((chat) => ({
      happened_at: iso(chat.happenedAt),
      scheduled_at: iso(chat.scheduledAt),
      location: chat.location,
      debrief: chat.debrief,
      verdict: chat.verdict,
      attendees: detail.attendees
        .filter((a) => a.coffeeChatId === chat.id)
        .map((a) => ({ name: a.memberName, verdict: a.verdict, note: a.note })),
    })),
    notes: detail.notes.slice(0, 30).map((n) => ({
      author: n.authorName,
      created_at: iso(n.createdAt),
      pinned: n.pinned,
      body: n.body,
    })),
    memos: detail.memos.map((m) => ({
      ref: formatRef("memo", m.ref),
      title: m.title,
      status: m.status,
      recommendation: m.recommendation,
      proposed_amount: money(m.proposedAmount),
      url: urls.memo(m.id),
    })),
    // Round status only. Ballots stay behind get_vote_status.
    votes: detail.rounds.map((r) => {
      const revealed = r.status === "revealed" && r.revealedAt != null;
      return {
        status: effectiveRoundStatus(r),
        closes_at: iso(r.closesAt),
        outcome: revealed ? r.outcome : null,
        outcome_note: revealed ? r.outcomeNote : null,
        vote_url: urls.vote(r.memoId),
      };
    }),
    grants: detail.grants.map((g) => ({
      status: g.status,
      amount_awarded: money(g.amountAwarded),
      pool: g.poolName,
    })),
    stage_history: detail.history.map((h) => ({
      to_stage: h.toStageName,
      moved_at: iso(h.movedAt),
      moved_by: h.movedByName,
      note: h.note,
    })),
    recent_activity: detail.activities.slice(0, 15).map((a) => ({ at: iso(a.occurredAt), summary: a.summary })),
  };
}

export async function search(input: ToolInput<"search">) {
  // searchEverything resolves the member itself and scopes to their org.
  const hits = await searchEverything(input.query);
  return {
    hits: hits.map((h) => ({
      kind: h.kind,
      id: h.id,
      ref: h.kind === "member" || h.kind === "doc" ? null : (h.ref ?? null),
      title: h.title,
      detail: h.subtitle ?? null,
      url: appUrl(h.href),
    })),
  };
}

export async function listMemos(input: ToolInput<"list_memos">, ctx: Ctx) {
  const memos = await getMemosList(ctx.org.id);
  const mine = input.mine
    ? new Set(
        (
          await db
            .select({ id: memo.id })
            .from(memo)
            .where(and(eq(memo.orgId, ctx.org.id), eq(memo.authorMemberId, ctx.member.id)))
        ).map((m) => m.id)
      )
    : null;
  return {
    memos: memos
      .filter((m) => (input.status ? m.status === input.status : m.status !== "archived"))
      .filter((m) => !mine || mine.has(m.id))
      .map((m) => ({
        ref: formatRef("memo", m.ref),
        id: m.id,
        title: m.title,
        company: m.companyName,
        author: m.authorName,
        status: m.status,
        recommendation: m.recommendation,
        proposed_amount: money(m.proposedAmount),
        sections_filled: m.sectionsFilled,
        sections_total: m.sectionsTotal,
        open_comments: m.openComments,
        updated_at: iso(m.updatedAt),
        url: urls.memo(m.id),
      })),
  };
}

export async function getMemo(input: ToolInput<"get_memo">, ctx: Ctx) {
  const found = await resolveMemo(ctx.org.id, input.memo);
  const detail = await getMemoDetail(ctx.org.id, found.id);
  if (!detail) throw new ToolError(`No memo ${input.memo} in this club.`);
  const m = detail.memo;
  const sectionTitle = new Map(detail.draftSections.map((s) => [s.id, s.title]));
  return {
    ref: formatRef("memo", m.ref),
    id: m.id,
    url: urls.memo(m.id),
    title: m.title,
    company: detail.companyName,
    application_id: detail.applicationId,
    author: detail.authorName,
    status: m.status,
    editable: m.status !== "decided" && m.status !== "archived",
    recommendation: m.recommendation,
    proposed_amount: money(m.proposedAmount),
    amount_requested: money(detail.amountRequested),
    sections: detail.draftSections.map((s) => ({
      id: s.id,
      title: s.title,
      guidance: s.guidance,
      required: s.required ?? false,
      word_count: s.wordCount,
      text: s.contentText,
    })),
    open_comments: detail.comments
      .filter((c) => !c.resolvedAt)
      .map((c) => ({
        author: c.authorName,
        section: c.sectionId ? (sectionTitle.get(c.sectionId) ?? null) : null,
        created_at: iso(c.createdAt),
        body: c.body,
      })),
    votes: detail.rounds.map((r) => ({
      status: effectiveRoundStatus(r),
      closes_at: iso(r.closesAt),
      vote_url: urls.vote(m.id),
    })),
  };
}

export async function getBudget(input: ToolInput<"get_budget">, ctx: Ctx) {
  const pools = await getPools(ctx.org.id);
  const pool = input.fiscal_year ? pools.find((p) => p.fiscalYear === input.fiscal_year) : pools[0];
  if (!pool) {
    return {
      pool: null,
      message: input.fiscal_year
        ? `No pool for fiscal year ${input.fiscal_year}. Pools exist for: ${pools.map((p) => p.fiscalYear).join(", ") || "none"}.`
        : "The club has not created a grant pool yet. An admin does that in Settings → Money.",
    };
  }
  const summary = await getPoolSummary(ctx.org.id, pool.id);
  if (!summary) throw new ToolError("That pool no longer exists.");
  return {
    pool: { name: pool.name, fiscal_year: pool.fiscalYear },
    total: money(summary.total),
    budget: money(pool.totalBudget),
    rollover_from_prior_year: money(pool.rolloverFromPrior),
    committed: money(summary.committed),
    deployed: money(summary.deployed),
    remaining: money(summary.remaining),
    grants_counted: summary.grantCount,
    by_status: Object.fromEntries(
      Object.entries(summary.lifecycle).map(([status, v]) => [status, { count: v.count, total: money(v.total) }])
    ),
    other_fiscal_years: pools.filter((p) => p.id !== pool.id).map((p) => p.fiscalYear),
    url: appUrl("/grants"),
  };
}

export async function listGrants(input: ToolInput<"list_grants">, ctx: Ctx) {
  const grants = (await getGrantsList(ctx.org.id)).filter((g) => !input.status || g.status === input.status);
  return {
    total: grants.length,
    grants: grants.slice(0, input.limit).map((g) => ({
      id: g.id,
      company: g.companyName,
      pool: g.poolName,
      status: g.status,
      amount_requested: money(g.amountRequested),
      amount_awarded: money(g.amountAwarded),
      use_of_funds: g.useOfFunds,
      use_of_funds_detail: g.useOfFundsNarrative,
      approved_at: iso(g.approvedAt),
      issued_at: iso(g.issuedAt),
      cashed_at: iso(g.cashedAt),
      reconciled_at: iso(g.reconciledAt),
      receipts_filed: g.receiptCount,
      receipts_total: money(g.receiptTotal),
      application_url: g.applicationId ? urls.application(g.applicationId) : null,
    })),
    url: appUrl("/grants"),
  };
}

export async function listMeetings(input: ToolInput<"list_meetings">, ctx: Ctx) {
  const lists = await getMeetingsList(ctx.org.id);
  return {
    meetings: lists[input.when].map(({ meeting: m, agendaCount, openActionCount }) => ({
      ref: formatRef("meeting", m.ref),
      id: m.id,
      title: m.title,
      kind: m.kind,
      scheduled_at: iso(m.scheduledAt),
      duration_minutes: m.durationMinutes,
      location: m.location,
      status: m.status,
      agenda_items: agendaCount,
      open_action_items: openActionCount,
      url: urls.meeting(m.id),
    })),
  };
}

export async function getMeeting(input: ToolInput<"get_meeting">, ctx: Ctx) {
  const found = await resolveMeeting(ctx.org.id, input.meeting);
  const detail = await getMeetingDetail(ctx.org.id, found.id);
  if (!detail) throw new ToolError(`No meeting ${input.meeting} in this club.`);
  const m = detail.meeting;
  return {
    ref: formatRef("meeting", m.ref),
    id: m.id,
    url: urls.meeting(m.id),
    title: m.title,
    kind: m.kind,
    scheduled_at: iso(m.scheduledAt),
    duration_minutes: m.durationMinutes,
    location: m.location,
    video_url: m.videoUrl,
    status: m.status,
    notes: m.notes,
    agenda: detail.items.map(({ item, presenterName, companyName }) => ({
      title: item.title,
      kind: item.kind,
      presenter: presenterName,
      company: companyName,
      duration_minutes: item.durationMinutes,
      status: item.status,
      notes: item.notes,
    })),
    action_items: detail.actions.map((a) => ({
      ref: formatRef("actionItem", a.ref),
      title: a.title,
      assignee: a.assigneeName,
      status: a.status,
      due_at: iso(a.dueAt),
    })),
  };
}

export async function listActionItems(input: ToolInput<"list_action_items">, ctx: Ctx) {
  const now = Date.now();
  const rows = await db
    .select({
      ref: actionItem.ref,
      title: actionItem.title,
      description: actionItem.description,
      status: actionItem.status,
      dueAt: actionItem.dueAt,
      completedAt: actionItem.completedAt,
      meetingRef: meeting.ref,
      meetingTitle: meeting.title,
      applicationRef: application.ref,
      companyName: company.name,
    })
    .from(actionItem)
    .leftJoin(meeting, eq(actionItem.meetingId, meeting.id))
    .leftJoin(application, eq(actionItem.applicationId, application.id))
    .leftJoin(company, eq(application.companyId, company.id))
    .where(
      and(
        eq(actionItem.orgId, ctx.org.id),
        eq(actionItem.assigneeMemberId, ctx.member.id),
        input.include_done
          ? or(
              eq(actionItem.status, "open"),
              and(eq(actionItem.status, "done"), gte(actionItem.completedAt, new Date(now - 30 * DAY_MS)))
            )
          : eq(actionItem.status, "open")
      )
    )
    .orderBy(sql`${actionItem.dueAt} asc nulls last`);
  return {
    action_items: rows.map((t) => ({
      ref: formatRef("actionItem", t.ref),
      title: t.title,
      description: t.description,
      status: t.status,
      due_at: iso(t.dueAt),
      overdue: t.status === "open" && t.dueAt != null && t.dueAt.getTime() < now,
      meeting: t.meetingRef != null ? `${formatRef("meeting", t.meetingRef)} ${t.meetingTitle}` : null,
      application: t.applicationRef != null ? `${appRef(t.applicationRef)} ${t.companyName}` : null,
    })),
    url: appUrl("/my-work"),
  };
}

export async function getVoteStatus(input: ToolInput<"get_vote_status">, ctx: Ctx) {
  const orgId = ctx.org.id;
  let roundIds: string[];
  if (input.memo) {
    const found = await resolveMemo(orgId, input.memo);
    const rounds = await db
      .select({ id: voteRound.id })
      .from(voteRound)
      .where(and(eq(voteRound.orgId, orgId), eq(voteRound.memoId, found.id)))
      .orderBy(desc(voteRound.createdAt));
    roundIds = rounds.map((r) => r.id);
  } else {
    const rounds = await db
      .select({ id: voteRound.id })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .where(
        and(
          eq(voteRound.orgId, orgId),
          inArray(voteRound.status, ["open", "closed"]),
          eq(voteEligibility.memberId, ctx.member.id)
        )
      )
      .orderBy(asc(voteRound.closesAt));
    roundIds = rounds.map((r) => r.id);
  }

  const rounds = [];
  for (const id of roundIds) {
    // The one sanctioned reader of vote rows; its redaction decides what exists.
    const res = await getVoteRoundResults(orgId, id, ctx.member.id);
    if (!res) continue;
    const { round } = res;
    const status = effectiveRoundStatus(round);
    const ballot = (b: (typeof res.ballots)[number]) => ({
      decision: b.decision,
      conviction: b.conviction,
      suggested_amount: money(b.suggestedAmount),
      rationale: b.rationale,
      submitted_at: iso(b.submittedAt),
    });
    rounds.push({
      title: round.title,
      status,
      closes_at: iso(round.closesAt),
      vote_url: urls.vote(round.memoId),
      i_am_eligible: res.viewerIsEligible && !res.viewerIsRecused,
      i_am_recused: res.viewerIsRecused,
      my_ballot: res.myBallot ? ballot(res.myBallot) : null,
      can_still_vote: status === "open" && res.viewerIsEligible && !res.viewerIsRecused,
      revealed: res.revealed,
      // Empty until reveal: redactVoteResults returns no ballots before then.
      results: res.revealed
        ? {
            outcome: round.outcome,
            outcome_note: round.outcomeNote,
            ballots: res.ballots.map((b) => ({ member: b.memberName, ...ballot(b) })),
            did_not_vote: res.missing,
          }
        : null,
    });
  }
  return {
    rounds,
    note: "Votes are blind until revealed. Ballots are cast by the member in the app, at vote_url.",
  };
}

function reportSummary(r: ReportRow) {
  return {
    id: r.id,
    kind: r.kind,
    period: r.kind === "funding_request" ? null : r.periodKey,
    title: r.title,
    status: r.status,
    application_id: r.applicationId,
    updated_at: iso(r.updatedAt),
    finalized_at: iso(r.finalizedAt),
    sent_at: iso(r.sentAt),
    url: reportUrl(r),
  };
}

export async function listReportsTool(input: ToolInput<"list_reports">, ctx: Ctx) {
  const reports = await listReports(ctx.org.id, input.kind);
  return { reports: reports.map(reportSummary) };
}

export async function getReportTool(input: ToolInput<"get_report">, ctx: Ctx) {
  const row = await getReportById(ctx.org.id, input.report);
  if (!row || row.archivedAt) throw new ToolError("No report with that id. Use list_reports.");
  return {
    ...reportSummary(row),
    // Shapes are per kind and owned by the report editors; passed through as stored.
    content: row.content ?? {},
    frozen_numbers: row.snapshot ?? null,
    sent_to_count: row.sentTo?.length ?? 0,
  };
}
