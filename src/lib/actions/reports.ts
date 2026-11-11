"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { report } from "@/db/schema";
import { aiConfigured, aiObject } from "@/lib/ai";
import { QUARTERLY_SYSTEM, buildQuarterlyPrompt, quarterlyDraftSchema } from "@/lib/ai/quarterly";
import { appUrl, emailLayout, notifyMany, sendEmailSafe } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { getQuarterlyLetter } from "@/lib/queries/reports";
import {
  DEFAULT_SALUTATION,
  QUARTERLY_PROSE_FIELDS,
  defaultSignoff,
  quarterlyEmailBody,
  quarterlyPatchSchema,
  type QuarterlyProseField,
} from "@/lib/reports/quarterly";
import { ensureReport, patchReportContent, periodKey } from "@/lib/reports/store";
import { docToText, isDocEmpty, textToDoc } from "@/lib/rich-text";
import type { Ctx } from "./context";
import { ActionError, authedAction } from "./safe-action";

const period = {
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  quarter: z.coerce.number().int().min(1).max(4),
};
type Period = { fiscalYear: number; quarter: number };

/**
 * The view plus a guaranteed report row. A new row starts from the view's
 * content, which already carries over commentary written under the old flow.
 */
async function loadOrCreate(ctx: Ctx, p: Period) {
  const view = await getQuarterlyLetter(ctx.org, p.fiscalYear, p.quarter as 1 | 2 | 3 | 4);
  if (view.report) return { view, row: view.report };
  const row = await ensureReport({
    orgId: ctx.org.id,
    kind: "quarterly",
    key: periodKey.quarterly(p.fiscalYear, p.quarter),
    title: `Quarterly letter FY${p.fiscalYear} Q${p.quarter}`,
    memberId: ctx.member.id,
    content: view.content,
  });
  return { view, row };
}

function revalidate() {
  revalidatePath("/reports");
  revalidatePath("/reports/quarterly");
}

const label = (p: Period) => `FY${p.fiscalYear} Q${p.quarter}`;

/** Autosave for the partners' paragraphs. Creates the letter on the first edit. */
export const saveQuarterlyLetter = authedAction({
  minRole: "partner",
  input: z.object({ ...period, patch: quarterlyPatchSchema }),
  handler: async (input, ctx) => {
    const { row } = await loadOrCreate(ctx, input);
    const saved = await patchReportContent(ctx.org.id, row.id, ctx.member.id, input.patch);
    if (!saved) throw new ActionError("This letter is final. Reopen it to make changes.");
    return { data: { updatedAt: saved.updatedAt.toISOString() } };
  },
});

/** Draft the opening and/or what's-next from the quarter's figures. Returned, not saved. */
export const draftQuarterlyNarrative = authedAction({
  minRole: "partner",
  input: z.object({ ...period, fields: z.array(z.enum(QUARTERLY_PROSE_FIELDS)).min(1).max(2) }),
  handler: async (input, ctx) => {
    const settings = orgSettings(ctx.org);
    if (!aiConfigured() || !settings.ai.enabled) throw new ActionError("AI drafts are not enabled for this club.");
    const view = await getQuarterlyLetter(ctx.org, input.fiscalYear, input.quarter as 1 | 2 | 3 | 4);
    const others = QUARTERLY_PROSE_FIELDS.filter((f) => !input.fields.includes(f));
    const draft = await aiObject({
      system: QUARTERLY_SYSTEM,
      prompt: buildQuarterlyPrompt({
        clubName: ctx.org.name,
        mission: settings.reports.mission,
        letter: view.letter,
        fields: input.fields,
        alreadyWritten: others.map((f) => docToText(view.content[f])).join("\n\n"),
      }),
      schema: quarterlyDraftSchema,
      effort: "medium",
    });
    if (!draft) throw new ActionError("No draft came back. Try again, or write it by hand.");
    const out: Partial<Record<QuarterlyProseField, Record<string, unknown>>> = {};
    for (const field of input.fields) {
      if (draft[field].trim()) out[field] = textToDoc(draft[field]) as Record<string, unknown>;
    }
    return { data: { draft: out } };
  },
});

/** Freeze the quarter's figures into the letter and lock it. */
export const finalizeQuarterlyLetter = authedAction({
  minRole: "partner",
  input: z.object(period),
  handler: async (input, ctx) => {
    const { view, row } = await loadOrCreate(ctx, input);
    if (row.status !== "draft") throw new ActionError("This letter is already final.");
    if (isDocEmpty(view.content.opening)) throw new ActionError("Write the opening paragraph first.");
    if (Object.keys(view.content.origin).length > 0) {
      throw new ActionError("An AI draft is still unreviewed. Edit or accept it first.");
    }
    const now = new Date();
    await db
      .update(report)
      .set({
        status: "final",
        snapshot: view.figures,
        finalizedAt: now,
        finalizedByMemberId: ctx.member.id,
        updatedByMemberId: ctx.member.id,
        updatedAt: now,
      })
      .where(and(eq(report.id, row.id), eq(report.orgId, ctx.org.id), eq(report.status, "draft")));
    revalidate();
    return {
      data: { ok: true },
      activity: {
        verb: "quarterly_letter.finalized",
        entityType: "report",
        entityId: row.id,
        entityLabel: row.title,
        summary: `${ctx.member.displayName} finalized the ${label(input)} letter`,
      },
    };
  },
});

export const reopenQuarterlyLetter = authedAction({
  minRole: "partner",
  input: z.object(period),
  handler: async (input, ctx) => {
    const { row } = await loadOrCreate(ctx, input);
    if (row.status === "draft") throw new ActionError("This letter is already a draft.");
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
      .where(and(eq(report.id, row.id), eq(report.orgId, ctx.org.id)));
    revalidate();
    return {
      data: { ok: true },
      activity: {
        verb: "quarterly_letter.reopened",
        entityType: "report",
        entityId: row.id,
        entityLabel: row.title,
        summary: `${ctx.member.displayName} reopened the ${label(input)} letter`,
      },
    };
  },
});

const recipients = z
  .string()
  .transform((s) => s.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean))
  .pipe(z.array(z.email("One of those doesn't look like an email address.")).min(1, "Add who it goes to.").max(60));

/** Email the final letter to the club's supporters and record that it went. */
export const sendQuarterlyLetter = authedAction({
  minRole: "partner",
  input: z.object({ ...period, to: recipients }),
  handler: async (input, ctx) => {
    const { view, row } = await loadOrCreate(ctx, input);
    if (row.status === "draft") throw new ActionError("Finalize the letter before sending it.");
    const html = emailLayout({
      orgName: ctx.org.name,
      heading: `Quarterly letter, ${label(input)}`,
      bodyHtml: quarterlyEmailBody({
        letter: view.letter,
        salutation: view.content.salutation.trim() || DEFAULT_SALUTATION,
        opening: docToText(view.content.opening),
        whatsNext: docToText(view.content.whatsNext),
        signoff: view.content.signoff.trim() || defaultSignoff(ctx.org.name),
      }),
      cta: {
        label: "Read it online",
        url: appUrl(`/reports/quarterly?fy=${input.fiscalYear}&q=${input.quarter}`),
      },
      footer: `Sent by ${ctx.member.displayName} for ${ctx.org.name}. You are receiving this because you support the club's grant pool.`,
    });
    const delivered: string[] = [];
    await notifyMany(
      input.to.map((to) => async () => {
        const ok = await sendEmailSafe({
          to,
          subject: `${ctx.org.name}: quarterly letter, ${label(input)}`,
          html,
          replyTo: ctx.email || undefined,
        });
        if (ok) delivered.push(to);
      })
    );
    if (delivered.length === 0) throw new ActionError("The email didn't send. Check the addresses and try again.");
    const now = new Date();
    await db
      .update(report)
      .set({ status: "sent", sentAt: now, sentTo: delivered, updatedByMemberId: ctx.member.id, updatedAt: now })
      .where(and(eq(report.id, row.id), eq(report.orgId, ctx.org.id)));
    revalidate();
    return {
      data: { sentTo: delivered },
      activity: {
        verb: "quarterly_letter.sent",
        entityType: "report",
        entityId: row.id,
        entityLabel: row.title,
        summary: `${ctx.member.displayName} sent the ${label(input)} letter to ${delivered.length} ${delivered.length === 1 ? "person" : "people"}`,
      },
    };
  },
});
