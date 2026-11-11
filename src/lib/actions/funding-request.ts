"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { report } from "@/db/schema";
import { aiConfigured, aiObject } from "@/lib/ai";
import {
  FUNDING_REQUEST_SYSTEM,
  LINE_ITEMS_SYSTEM,
  buildFundingRequestPrompt,
  buildLineItemsPrompt,
  fundingRequestDraftSchema,
  lineItemsSchema,
  pickDraftFields,
} from "@/lib/ai/funding-request";
import { appUrl, emailLayout, sendEmailSafe } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { getFundingRequest } from "@/lib/queries/reports";
import {
  FR_FIELDS,
  finalizeBlockers,
  fundingRequestEmailBody,
  fundingRequestPatchSchema,
  normalizeAmount,
  parseLineItems,
} from "@/lib/reports/funding-request";
import { ensureReport, patchReportContent, periodKey } from "@/lib/reports/store";
import type { Ctx } from "./context";
import { ActionError, authedAction } from "./safe-action";

const applicationId = z.string().uuid();

/** The view plus a guaranteed report row, created with the prefill on first use. */
async function loadOrCreate(ctx: Ctx, id: string) {
  const view = await getFundingRequest(ctx.org, id, ctx.member.id);
  if (!view) throw new ActionError("That application doesn't exist.");
  if (view.report) return { view, row: view.report, created: false as boolean };
  const row = await ensureReport({
    orgId: ctx.org.id,
    kind: "funding_request",
    key: periodKey.fundingRequest(id),
    title: `Funding request: ${view.facts.companyName}`,
    memberId: ctx.member.id,
    applicationId: id,
    content: view.content,
  });
  return { view, row, created: true as boolean };
}

function revalidate(id: string) {
  revalidatePath("/reports");
  revalidatePath(`/reports/funding/${id}`);
  revalidatePath(`/pipeline/${id}`);
}

/** Create the draft (prefilled from the memo and the application) if there isn't one. */
export const startFundingRequest = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId }),
  handler: async (input, ctx) => {
    const { view, row, created } = await loadOrCreate(ctx, input.applicationId);
    const data = { reportId: row.id, created };
    if (!created) return { data };
    revalidate(input.applicationId);
    return {
      data,
      activity: {
        verb: "funding_request.started",
        entityType: "application",
        entityId: input.applicationId,
        entityLabel: view.facts.companyName,
        summary: `${ctx.member.displayName} started the funding request for ${view.facts.companyName}`,
      },
    };
  },
});

/** Autosave. Refused once the request is final — reopen it first. */
export const saveFundingRequest = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId, patch: fundingRequestPatchSchema }),
  handler: async (input, ctx) => {
    const { row } = await loadOrCreate(ctx, input.applicationId);
    const saved = await patchReportContent(ctx.org.id, row.id, ctx.member.id, input.patch);
    if (!saved) throw new ActionError("This request is final. A partner can reopen it to make changes.");
    return { data: { updatedAt: saved.updatedAt.toISOString() } };
  },
});

/**
 * Draft the requested fields. Returns the text for the member to review —
 * nothing is saved here; the editor marks it as a draft and saves it like any
 * other edit.
 */
export const draftFundingRequestFields = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId, fields: z.array(z.enum(FR_FIELDS)).min(1).max(FR_FIELDS.length) }),
  handler: async (input, ctx) => {
    const settings = orgSettings(ctx.org);
    if (!aiConfigured() || !settings.ai.enabled) throw new ActionError("AI drafts are not enabled for this club.");
    const view = await getFundingRequest(ctx.org, input.applicationId, ctx.member.id);
    if (!view) throw new ActionError("That application doesn't exist.");
    const draft = await aiObject({
      system: FUNDING_REQUEST_SYSTEM,
      prompt: buildFundingRequestPrompt(
        {
          facts: view.facts,
          content: view.content,
          thesis: settings.reports.thesis,
          memoSections: view.sources.memoSections,
          coffeeChats: view.sources.coffeeChats.map((c) => ({
            debrief: c.debrief,
            notes: c.notes.map((n) => n.note),
          })),
          notes: view.sources.notes.map((n) => n.body),
          // Rationales only — who voted which way stays out of the prompt.
          fundRationales: view.sources.ballots.fund.map((b) => b.rationale),
          declineRationales: view.sources.ballots.decline.map((b) => b.rationale),
        },
        input.fields
      ),
      schema: fundingRequestDraftSchema,
      effort: "medium",
    });
    if (!draft) throw new ActionError("No draft came back. Try again, or write it by hand.");
    return { data: { draft: pickDraftFields(draft, input.fields) } };
  },
});

/** Line items from the founder's use-of-funds text: the model when it is on, the parser otherwise. */
export const extractFundingLineItems = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId }),
  handler: async (input, ctx) => {
    const view = await getFundingRequest(ctx.org, input.applicationId, ctx.member.id);
    if (!view) throw new ActionError("That application doesn't exist.");
    const narrative = view.sources.useOfFundsNarrative ?? "";
    const parsed = parseLineItems(narrative);
    const fromParser = { data: { items: parsed, source: "parser" as "parser" | "ai" } };
    if (!narrative.trim() || !aiConfigured() || !orgSettings(ctx.org).ai.enabled) {
      return fromParser;
    }
    const result = await aiObject({
      system: LINE_ITEMS_SYSTEM,
      prompt: buildLineItemsPrompt(narrative),
      schema: lineItemsSchema,
      effort: "low",
    });
    const items = (result?.items ?? [])
      .map((i) => ({ name: i.name.trim().slice(0, 200), amount: normalizeAmount(i.amount) }))
      .filter((i) => i.name && i.amount);
    return items.length > 0 ? { data: { items, source: "ai" as "parser" | "ai" } } : fromParser;
  },
});

/** Freeze the numbers and lock the text. */
export const finalizeFundingRequest = authedAction({
  minRole: "partner",
  input: z.object({ applicationId }),
  handler: async (input, ctx) => {
    const { view, row } = await loadOrCreate(ctx, input.applicationId);
    if (row.status !== "draft") throw new ActionError("This request is already final.");
    const blockers = finalizeBlockers(view.facts, view.content);
    if (blockers.length > 0) throw new ActionError(blockers[0]);
    const now = new Date();
    await db
      .update(report)
      .set({
        status: "final",
        snapshot: view.facts,
        finalizedAt: now,
        finalizedByMemberId: ctx.member.id,
        updatedByMemberId: ctx.member.id,
        updatedAt: now,
      })
      .where(and(eq(report.id, row.id), eq(report.orgId, ctx.org.id), eq(report.status, "draft")));
    revalidate(input.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "funding_request.finalized",
        entityType: "application",
        entityId: input.applicationId,
        entityLabel: view.facts.companyName,
        summary: `${ctx.member.displayName} finalized the funding request for ${view.facts.companyName}`,
      },
    };
  },
});

/** Back to a draft: the snapshot is dropped and the numbers go live again. */
export const reopenFundingRequest = authedAction({
  minRole: "partner",
  input: z.object({ applicationId }),
  handler: async (input, ctx) => {
    const view = await getFundingRequest(ctx.org, input.applicationId, ctx.member.id);
    if (!view?.report || view.report.status === "draft") throw new ActionError("This request is already a draft.");
    await db
      .update(report)
      .set({
        status: "draft",
        snapshot: null,
        finalizedAt: null,
        finalizedByMemberId: null,
        updatedByMemberId: ctx.member.id,
        updatedAt: new Date(),
      })
      .where(and(eq(report.id, view.report.id), eq(report.orgId, ctx.org.id)));
    revalidate(input.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "funding_request.reopened",
        entityType: "application",
        entityId: input.applicationId,
        entityLabel: view.facts.companyName,
        summary: `${ctx.member.displayName} reopened the funding request for ${view.facts.companyName}`,
      },
    };
  },
});

const recipients = z
  .string()
  .transform((s) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean))
  .pipe(z.array(z.email("That doesn't look like an email address.")).min(1, "Add who it goes to.").max(5));

/** Email the final memo to whoever signs off, and record that it went. */
export const sendFundingRequest = authedAction({
  minRole: "partner",
  input: z.object({ applicationId, to: recipients, note: z.string().max(2000).optional() }),
  handler: async (input, ctx) => {
    const view = await getFundingRequest(ctx.org, input.applicationId, ctx.member.id);
    if (!view?.report) throw new ActionError("There is no funding request for this application yet.");
    if (view.report.status === "draft") throw new ActionError("Finalize the request before sending it.");
    const { facts, content } = view;
    const html = emailLayout({
      orgName: ctx.org.name,
      heading: `Funding request: ${facts.companyName}`,
      bodyHtml: fundingRequestEmailBody(facts, content, { note: input.note }),
      cta: { label: "Open the request", url: appUrl(`/reports/funding/${input.applicationId}`) },
      footer: `Sent by ${ctx.member.displayName} for ${ctx.org.name}. Reply to this email to approve it or to ask a question.`,
    });
    const sent = await Promise.all(
      input.to.map((to) =>
        sendEmailSafe({ to, subject: `Funding request: ${facts.companyName}`, html, replyTo: ctx.email || undefined })
      )
    );
    const delivered = input.to.filter((_, i) => sent[i]);
    if (delivered.length === 0) throw new ActionError("The email didn't send. Check the address and try again.");
    const now = new Date();
    await db
      .update(report)
      .set({ status: "sent", sentAt: now, sentTo: delivered, updatedByMemberId: ctx.member.id, updatedAt: now })
      .where(and(eq(report.id, view.report.id), eq(report.orgId, ctx.org.id)));
    revalidate(input.applicationId);
    return {
      data: { sentTo: delivered },
      activity: {
        verb: "funding_request.sent",
        entityType: "application",
        entityId: input.applicationId,
        entityLabel: facts.companyName,
        summary: `${ctx.member.displayName} sent the funding request for ${facts.companyName} to ${delivered.join(", ")}`,
      },
    };
  },
});
