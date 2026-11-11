import { eq } from "drizzle-orm";
import { db } from "@/db";
import { company } from "@/db/schema";
import type { Ctx } from "@/lib/actions/context";
import {
  addApplicationNote,
  createApplication,
  logCoffeeChat,
  moveApplicationStage,
  setNextStep,
  updateApplicationFacts,
  upsertScreeningScores,
} from "@/lib/actions/applications";
import { setOutcomeTier } from "@/lib/actions/grants";
import { createActionItem, toggleActionItem } from "@/lib/actions/meetings";
import { updateMemoSection } from "@/lib/actions/memos";
import type { ActionResult } from "@/lib/actions/safe-action";
import { formatRef } from "@/lib/refs";
import { textToDoc } from "@/lib/rich-text";
import type { ToolInput } from "./catalog";
import { emailMe, emailMember, emailMyDigest, runAutomations } from "./actions";
import { buildMemberDigest } from "./digest";
import {
  liveCriteria,
  resolveActionItem,
  resolveActiveMember,
  resolveApplication,
  resolveMeeting,
  resolveStage,
  ToolError,
  urls,
} from "./resolve";

/**
 * Write tools. Each one resolves the assistant's words into ids and then calls
 * the SAME action the screen calls — so stage gates, decline rules, role
 * checks, the read-token refusal and the activity log all apply without being
 * restated here. Nothing in this file writes to the database itself.
 */

/** An action's refusal becomes a message the model can read and act on. */
function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ToolError(result.error);
  return result.data;
}

const appRef = (ref: number) => formatRef("application", ref);

export async function addNote(input: ToolInput<"add_note">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  unwrap(await addApplicationNote({ applicationId: app.id, body: input.body }));
  return { added_to: appRef(app.ref), company: app.companyName, url: urls.application(app.id) };
}

export async function setNextStepTool(input: ToolInput<"set_next_step">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  unwrap(
    await setNextStep({
      applicationId: app.id,
      nextStep: input.next_step,
      nextStepDue: input.due ? new Date(input.due) : null,
    })
  );
  return {
    application: appRef(app.ref),
    company: app.companyName,
    next_step: input.next_step?.trim() || null,
    due: input.next_step?.trim() && input.due ? new Date(input.due).toISOString() : null,
    url: urls.application(app.id),
  };
}

export async function setPriority(input: ToolInput<"set_priority">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  unwrap(await updateApplicationFacts({ applicationId: app.id, priority: input.priority }));
  return { application: appRef(app.ref), company: app.companyName, priority: input.priority };
}

export async function assignOwner(input: ToolInput<"assign_owner">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  const owner =
    input.owner == null
      ? null
      : await resolveActiveMember(ctx.org.id, input.owner === "me" ? ctx.member.id : input.owner);
  unwrap(await updateApplicationFacts({ applicationId: app.id, ownerMemberId: owner?.id ?? null }));
  return { application: appRef(app.ref), company: app.companyName, owner: owner?.displayName ?? null };
}

export async function moveStage(input: ToolInput<"move_stage">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  const stage = await resolveStage(ctx.org.id, input.stage);
  if (stage.kind === "lost" && !input.decline_reason) {
    throw new ToolError(
      `"${stage.name}" declines the application, which needs decline_reason. Ask the member why, then call again.`
    );
  }
  const result = unwrap(
    await moveApplicationStage({
      applicationId: app.id,
      toStageId: stage.id,
      note: input.note,
      declineReason: stage.kind === "lost" ? input.decline_reason : undefined,
      declineNote: stage.kind === "lost" ? input.decline_note : undefined,
      // An assistant never writes to a founder. Without this, the club's
      // "email founders on decline" setting would send one.
      founderEmail: { send: false },
    })
  );
  return {
    application: appRef(app.ref),
    company: app.companyName,
    stage: stage.name,
    declined: stage.kind === "lost",
    reopened: result.reopened,
    founder_emailed: false,
    ...(stage.kind === "lost"
      ? { note: "No email went to the founder. The member can send the decline from the application page." }
      : {}),
    url: urls.application(app.id),
  };
}

export async function createApplicationTool(input: ToolInput<"create_application">) {
  const result = unwrap(
    await createApplication({
      companyName: input.company_name,
      domain: input.domain,
      applicantName: input.applicant_name,
      applicantEmail: input.applicant_email,
      amountRequested: input.amount_requested,
      pitchSummary: input.pitch_summary,
      useOfFundsNarrative: input.use_of_funds,
      priority: input.priority,
    })
  );
  return {
    id: result.applicationId,
    already_existed: result.duplicate,
    ...(result.duplicate
      ? { note: "That domain already has an open application. Nothing new was created; this is the existing one." }
      : {}),
    url: urls.application(result.applicationId),
  };
}

export async function scoreApplication(input: ToolInput<"score_application">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  const criteria = await liveCriteria(ctx.org.id);
  const scores = input.scores.map((s) => {
    const wanted = s.criterion.toLowerCase();
    const criterion = criteria.find((c) => c.id === s.criterion || c.label.toLowerCase() === wanted);
    if (!criterion) {
      throw new ToolError(
        `No screening criterion "${s.criterion}". The criteria are: ${criteria.map((c) => c.label).join(", ")}.`
      );
    }
    return { criterionId: criterion.id, label: criterion.label, score: s.score, note: s.note };
  });
  unwrap(
    await upsertScreeningScores({
      applicationId: app.id,
      scores: scores.map(({ criterionId, score, note }) => ({ criterionId, score, note })),
    })
  );
  return {
    application: appRef(app.ref),
    company: app.companyName,
    recorded: scores.map((s) => ({ criterion: s.label, score: s.score })),
    url: urls.application(app.id),
  };
}

export async function logCoffeeChatTool(input: ToolInput<"log_coffee_chat">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  unwrap(
    await logCoffeeChat({
      applicationId: app.id,
      attendeeMemberIds: [ctx.member.id, ...input.other_attendee_ids],
      happenedAt: input.happened_at ? new Date(input.happened_at) : undefined,
      location: input.location,
      debrief: input.debrief,
      verdict: input.verdict,
    })
  );
  return {
    application: appRef(app.ref),
    company: app.companyName,
    attendees: 1 + new Set(input.other_attendee_ids.filter((id) => id !== ctx.member.id)).size,
    url: urls.application(app.id),
  };
}

export async function recordOutcomeCheckin(input: ToolInput<"record_outcome_checkin">, ctx: Ctx) {
  const app = await resolveApplication(ctx.org.id, input.application);
  const [co] = await db
    .select({ status: company.status, outcomeTier: company.outcomeTier })
    .from(company)
    .where(eq(company.id, app.companyId))
    .limit(1);
  if (co?.status !== "portfolio") {
    throw new ToolError(`${app.companyName} has not been funded, so there is no outcome to track yet.`);
  }
  unwrap(await setOutcomeTier({ companyId: app.companyId, tier: input.tier, note: input.note }));
  return { company: app.companyName, tier: input.tier, previous_tier: co.outcomeTier };
}

export async function updateMemoSectionTool(input: ToolInput<"update_memo_section">) {
  const result = unwrap(
    await updateMemoSection({
      sectionId: input.section_id,
      contentJson: textToDoc(input.text),
      contentText: input.text.trim(),
    })
  );
  return { section_id: input.section_id, word_count: result.wordCount };
}

export async function createActionItemTool(input: ToolInput<"create_action_item">, ctx: Ctx) {
  const [assignee, meetingRow, app] = await Promise.all([
    input.assignee_id ? resolveActiveMember(ctx.org.id, input.assignee_id) : null,
    input.meeting ? resolveMeeting(ctx.org.id, input.meeting) : null,
    input.application ? resolveApplication(ctx.org.id, input.application) : null,
  ]);
  const result = unwrap(
    await createActionItem({
      title: input.title,
      assigneeMemberId: assignee?.id,
      meetingId: meetingRow?.id,
      applicationId: app?.id,
      dueAt: input.due ? new Date(input.due) : undefined,
    })
  );
  const created = await resolveActionItem(ctx.org.id, result.actionItemId);
  return {
    ref: formatRef("actionItem", created.ref),
    title: created.title,
    assignee: assignee?.displayName ?? ctx.member.displayName,
    due: input.due ? new Date(input.due).toISOString() : null,
  };
}

export async function completeActionItem(input: ToolInput<"complete_action_item">, ctx: Ctx) {
  const item = await resolveActionItem(ctx.org.id, input.action_item);
  unwrap(await toggleActionItem({ actionItemId: item.id, done: input.done }));
  return { ref: formatRef("actionItem", item.ref), title: item.title, status: input.done ? "done" : "open" };
}

export async function sendMeDigest(input: ToolInput<"send_me_digest">, ctx: Ctx) {
  if (input.deliver === "email") {
    if (ctx.tokenScope !== "write") {
      throw new ToolError(
        "Emailing the digest needs a write token and this one is read-only. Call again with deliver: 'return' and show the member the text."
      );
    }
    return unwrap(await emailMyDigest({}));
  }
  const digest = await buildMemberDigest(ctx);
  return { subject: digest.subject, digest: digest.text };
}

export async function emailMeTool(input: ToolInput<"email_me">) {
  return unwrap(await emailMe(input));
}

export async function emailMemberTool(input: ToolInput<"email_member">) {
  return unwrap(await emailMember({ memberId: input.member_id, subject: input.subject, body: input.body }));
}

export async function runDailyAutomations(_input: ToolInput<"run_daily_automations">, ctx: Ctx) {
  const report = unwrap(await runAutomations({}));
  return {
    ran_at: report.ranAt,
    email_configured: report.emailConfigured,
    jobs: report.orgs.find((o) => o.name === ctx.org.name)?.jobs ?? {},
  };
}
