import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  organization,
  member,
  invitation,
  activity,
  pipelineStage,
  sector,
  dealSource,
  company,
  companySector,
  contact,
  application,
  stageHistory,
  screeningCriterion,
  screeningScore,
  coffeeChat,
  coffeeChatAttendee,
  applicationNote,
  file,
  outcomeUpdate,
  grantPool,
  grant,
  receipt,
  memoTemplate,
  memoTemplateSection,
  memo,
  memoVersion,
  memoSection,
  memoComment,
  voteRound,
  voteEligibility,
  vote,
  meeting,
  agendaItem,
  attendance,
  actionItem,
  onboardingTrack,
  onboardingTask,
  onboardingAssignment,
  onboardingCompletion,
  doc,
  capTable,
  securityClass,
  stakeholder,
  capEvent,
  capTableSnapshot,
} from "@/db/schema";
import { getCtx, roleAtLeast } from "@/lib/actions/context";

export const dynamic = "force-dynamic";

/**
 * The no-lock-in promise: one admin-only request dumps every org-scoped table
 * as JSON. Deliberate exclusions, documented in the payload's _meta:
 *  - application_demographics — aggregate-only means exports too (see CLAUDE.md)
 *  - vote rows for UNREVEALED rounds — the blind-vote invariant survives export
 *  - auth internals (user/session/account/verification) and secret columns
 */
export async function GET() {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!roleAtLeast(ctx.member.role, "admin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const orgId = ctx.org.id;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
  // inArray() throws on empty lists — a fresh org has plenty of them.
  const childrenOf = async <T>(parentIds: string[], q: (ids: string[]) => Promise<T[]>) =>
    parentIds.length === 0 ? [] : q(parentIds);

  const [org] = await db.select().from(organization).where(eq(organization.id, orgId));
  const members = await db.select().from(member).where(eq(member.orgId, orgId));
  const applications = await db.select().from(application).where(eq(application.orgId, orgId));
  const appIds = ids(applications);
  const chats = await db.select().from(coffeeChat).where(eq(coffeeChat.orgId, orgId));
  const memos = await db.select().from(memo).where(eq(memo.orgId, orgId));
  const memoIds = ids(memos);
  const rounds = await db.select().from(voteRound).where(eq(voteRound.orgId, orgId));
  const meetings = await db.select().from(meeting).where(eq(meeting.orgId, orgId));
  const meetingIds = ids(meetings);
  const tracks = await db.select().from(onboardingTrack).where(eq(onboardingTrack.orgId, orgId));
  const trackIds = ids(tracks);
  const assignments = await childrenOf(trackIds, (v) =>
    db.select().from(onboardingAssignment).where(inArray(onboardingAssignment.trackId, v))
  );
  const capTables = await db.select().from(capTable).where(eq(capTable.orgId, orgId));
  const capIds = ids(capTables);
  const companies = await db.select().from(company).where(eq(company.orgId, orgId));
  const templates = await db.select().from(memoTemplate).where(eq(memoTemplate.orgId, orgId));

  // Blind-vote invariant: ballots leave the database only after their round
  // is revealed. Unrevealed rounds export as rounds, never as ballots.
  const revealedRoundIds = ids(rounds.filter((r) => r.revealedAt !== null));

  const data = {
    organization: org
      ? { ...org, ingestSecret: "<redacted>", slackWebhookUrl: org.slackWebhookUrl ? "<redacted>" : null }
      : null,
    members,
    invitations: (await db.select().from(invitation).where(eq(invitation.orgId, orgId))).map(
      (row) => ({ ...row, tokenHash: "<redacted>" })
    ),
    pipeline_stages: await db.select().from(pipelineStage).where(eq(pipelineStage.orgId, orgId)),
    sectors: await db.select().from(sector).where(eq(sector.orgId, orgId)),
    deal_sources: await db.select().from(dealSource).where(eq(dealSource.orgId, orgId)),
    companies,
    company_sectors: await childrenOf(ids(companies), (v) =>
      db.select().from(companySector).where(inArray(companySector.companyId, v))
    ),
    contacts: await db.select().from(contact).where(eq(contact.orgId, orgId)),
    applications,
    stage_history: await db.select().from(stageHistory).where(eq(stageHistory.orgId, orgId)),
    screening_criteria: await db
      .select()
      .from(screeningCriterion)
      .where(eq(screeningCriterion.orgId, orgId)),
    screening_scores: await childrenOf(appIds, (v) =>
      db.select().from(screeningScore).where(inArray(screeningScore.applicationId, v))
    ),
    coffee_chats: chats,
    coffee_chat_attendees: await childrenOf(ids(chats), (v) =>
      db.select().from(coffeeChatAttendee).where(inArray(coffeeChatAttendee.coffeeChatId, v))
    ),
    application_notes: await childrenOf(appIds, (v) =>
      db.select().from(applicationNote).where(inArray(applicationNote.applicationId, v))
    ),
    files: await db.select().from(file).where(eq(file.orgId, orgId)),
    outcome_updates: await db.select().from(outcomeUpdate).where(eq(outcomeUpdate.orgId, orgId)),
    grant_pools: await db.select().from(grantPool).where(eq(grantPool.orgId, orgId)),
    grants: await db.select().from(grant).where(eq(grant.orgId, orgId)),
    receipts: await db.select().from(receipt).where(eq(receipt.orgId, orgId)),
    memo_templates: templates,
    memo_template_sections: await childrenOf(ids(templates), (v) =>
      db.select().from(memoTemplateSection).where(inArray(memoTemplateSection.templateId, v))
    ),
    memos,
    memo_versions: await childrenOf(memoIds, (v) =>
      db.select().from(memoVersion).where(inArray(memoVersion.memoId, v))
    ),
    memo_sections: await childrenOf(memoIds, (v) =>
      db.select().from(memoSection).where(inArray(memoSection.memoId, v))
    ),
    memo_comments: await childrenOf(memoIds, (v) =>
      db.select().from(memoComment).where(inArray(memoComment.memoId, v))
    ),
    vote_rounds: rounds,
    vote_eligibility: await childrenOf(ids(rounds), (v) =>
      db.select().from(voteEligibility).where(inArray(voteEligibility.voteRoundId, v))
    ),
    votes_revealed_rounds_only: await childrenOf(revealedRoundIds, (v) =>
      db.select().from(vote).where(inArray(vote.voteRoundId, v))
    ),
    meetings,
    agenda_items: await childrenOf(meetingIds, (v) =>
      db.select().from(agendaItem).where(inArray(agendaItem.meetingId, v))
    ),
    attendance: await childrenOf(meetingIds, (v) =>
      db.select().from(attendance).where(inArray(attendance.meetingId, v))
    ),
    action_items: await db.select().from(actionItem).where(eq(actionItem.orgId, orgId)),
    onboarding_tracks: tracks,
    onboarding_tasks: await childrenOf(trackIds, (v) =>
      db.select().from(onboardingTask).where(inArray(onboardingTask.trackId, v))
    ),
    onboarding_assignments: assignments,
    onboarding_completions: await childrenOf(ids(assignments), (v) =>
      db.select().from(onboardingCompletion).where(inArray(onboardingCompletion.assignmentId, v))
    ),
    docs: await db.select().from(doc).where(eq(doc.orgId, orgId)),
    cap_tables: capTables,
    security_classes: await childrenOf(capIds, (v) =>
      db.select().from(securityClass).where(inArray(securityClass.capTableId, v))
    ),
    stakeholders: await childrenOf(capIds, (v) =>
      db.select().from(stakeholder).where(inArray(stakeholder.capTableId, v))
    ),
    cap_events: await childrenOf(capIds, (v) =>
      db.select().from(capEvent).where(inArray(capEvent.capTableId, v))
    ),
    cap_table_snapshots: await childrenOf(capIds, (v) =>
      db.select().from(capTableSnapshot).where(inArray(capTableSnapshot.capTableId, v))
    ),
    activity: await db.select().from(activity).where(eq(activity.orgId, orgId)),
  };

  const payload = {
    _meta: {
      exportedAt: new Date().toISOString(),
      exportedBy: ctx.member.displayName,
      format: "openventure-export",
      version: 1,
      excluded: [
        "application_demographics (aggregate-only by design — never exported)",
        "votes for unrevealed rounds (blind-voting invariant)",
        "auth sessions/accounts/verification tokens",
        "organization.ingest_secret and invite token hashes (rotate/reissue after import)",
      ],
    },
    ...data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="openventure-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
