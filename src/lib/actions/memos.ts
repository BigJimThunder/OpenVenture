"use server";

import { z } from "zod";
import { and, eq, isNull, asc, desc, ne, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  memo,
  memoVersion,
  memoSection,
  memoTemplate,
  memoTemplateSection,
  memoComment,
  application,
  company,
  member,
  voteRound,
  screeningScore,
  screeningCriterion,
  coffeeChat,
  coffeeChatAttendee,
  applicationNote,
  MEMO_RECOMMENDATIONS,
} from "@/db/schema";
import { roleAtLeast } from "./context";
import { aiConfigured, aiObject } from "@/lib/ai";
import {
  MEMO_DRAFT_SYSTEM,
  buildMemoDraftPrompt,
  isAiDraft,
  matchDraftToSections,
  memoDraftSchema,
} from "@/lib/ai/memo-draft";
import { orgSettings } from "@/lib/org-settings";
import { appUrl, emailLayout, escapeHtml, notifyMany, sendEmailSafe } from "@/lib/notify";
import { withRef } from "@/lib/refs-server";
import { authedAction, ActionError } from "./safe-action";
import { formatMoney } from "@/lib/utils";

export const createMemo = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    templateId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({ id: application.id, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    // One live memo per application.
    const [existing] = await db
      .select({ id: memo.id })
      .from(memo)
      .where(and(eq(memo.applicationId, app.id), ne(memo.status, "archived")))
      .limit(1);
    if (existing) return { data: { memoId: existing.id, existed: true as boolean } };

    let templateId = input.templateId;
    if (!templateId) {
      const [t] = await db
        .select({ id: memoTemplate.id })
        .from(memoTemplate)
        .where(
          and(
            eq(memoTemplate.orgId, ctx.org.id),
            eq(memoTemplate.isDefault, true),
            isNull(memoTemplate.archivedAt)
          )
        )
        .limit(1);
      templateId = t?.id;
    }

    const row = await withRef(memo, memo.orgId, memo.ref, ctx.org.id, async (ref) => {
      const [inserted] = await db
        .insert(memo)
        .values({
          orgId: ctx.org.id,
          ref,
          applicationId: app.id,
          templateId: templateId ?? null,
          title: `${app.companyName} — grant memo`,
          authorMemberId: ctx.member.id,
        })
        .returning();
      return inserted;
    });

    // Instantiate the template's sections as the live draft (versionId NULL).
    if (templateId) {
      const sections = await db
        .select()
        .from(memoTemplateSection)
        .where(eq(memoTemplateSection.templateId, templateId))
        .orderBy(asc(memoTemplateSection.position));
      if (sections.length > 0) {
        await db.insert(memoSection).values(
          sections.map((s) => ({
            memoId: row.id,
            templateSectionId: s.id,
            title: s.title,
            position: s.position,
          }))
        );
      }
    }

    revalidatePath("/memos");
    revalidatePath(`/pipeline/${app.id}`);
    return {
      data: { memoId: row.id, existed: false as boolean },
      activity: {
        verb: "memo.created",
        entityType: "memo",
        entityId: row.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} started a memo on ${app.companyName}`,
      },
    };
  },
});

export const updateMemoSection = authedAction({
  minRole: "analyst",
  input: z.object({
    sectionId: z.string().uuid(),
    contentJson: z.record(z.string(), z.unknown()),
    contentText: z.string().max(50_000),
  }),
  handler: async (input, ctx) => {
    const [section] = await db
      .select({
        id: memoSection.id,
        memoId: memoSection.memoId,
        versionId: memoSection.versionId,
        orgId: memo.orgId,
        status: memo.status,
      })
      .from(memoSection)
      .innerJoin(memo, eq(memoSection.memoId, memo.id))
      .where(eq(memoSection.id, input.sectionId))
      .limit(1);
    if (!section || section.orgId !== ctx.org.id) throw new ActionError("Section not found");
    if (section.versionId) throw new ActionError("Version snapshots are immutable");
    if (section.status === "decided" || section.status === "archived") {
      throw new ActionError("This memo is closed");
    }

    const words = input.contentText.trim().split(/\s+/).filter(Boolean).length;
    await db
      .update(memoSection)
      .set({
        contentJson: input.contentJson,
        contentText: input.contentText,
        wordCount: words,
        updatedByMemberId: ctx.member.id,
        updatedAt: new Date(),
      })
      .where(eq(memoSection.id, section.id));
    await db.update(memo).set({ updatedAt: new Date() }).where(eq(memo.id, section.memoId));

    // Autosave — no activity entry (it would flood the feed).
    return { data: { ok: true, wordCount: words } };
  },
});

export const updateMemoMeta = authedAction({
  minRole: "analyst",
  input: z.object({
    memoId: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    recommendation: z.enum(MEMO_RECOMMENDATIONS).nullable().optional(),
    /** Dollars as text — money never passes through a float. */
    proposedAmount: z
      .string()
      .trim()
      .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50")
      .nullable()
      .optional(),
  }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select()
      .from(memo)
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    if (m.status === "decided" || m.status === "archived") {
      throw new ActionError("This memo is closed");
    }
    await db
      .update(memo)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.recommendation !== undefined ? { recommendation: input.recommendation } : {}),
        ...(input.proposedAmount !== undefined ? { proposedAmount: input.proposedAmount } : {}),
        updatedAt: new Date(),
      })
      .where(eq(memo.id, m.id));
    revalidatePath(`/memos/${m.id}`);
    revalidatePath("/memos");
    return { data: { ok: true } };
  },
});

/**
 * Archive a memo that never went anywhere. Only drafts: once a memo has been
 * circulated it is part of the decision trail and stays. Author or partner+.
 * Archiving frees the application to start a fresh memo.
 */
export const setMemoArchived = authedAction({
  minRole: "analyst",
  input: z.object({ memoId: z.string().uuid(), archived: z.boolean() }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select()
      .from(memo)
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    if (m.authorMemberId !== ctx.member.id && !roleAtLeast(ctx.member.role, "partner")) {
      throw new ActionError("Only the author, a partner or an admin can archive this memo");
    }
    if (input.archived) {
      if (m.status !== "draft") {
        throw new ActionError(
          "This memo has been circulated, so it is part of the decision trail and can't be archived."
        );
      }
      const [round] = await db
        .select({ id: voteRound.id })
        .from(voteRound)
        .where(eq(voteRound.memoId, m.id))
        .limit(1);
      if (round) throw new ActionError("A vote is attached to this memo — it can't be archived.");
    } else {
      if (m.status !== "archived") throw new ActionError("Memo isn't archived");
      const [other] = await db
        .select({ id: memo.id })
        .from(memo)
        .where(
          and(eq(memo.applicationId, m.applicationId), ne(memo.status, "archived"), ne(memo.id, m.id))
        )
        .limit(1);
      if (other) {
        throw new ActionError("This application already has another live memo — archive that one first.");
      }
    }
    await db
      .update(memo)
      .set({ status: input.archived ? "archived" : "draft", updatedAt: new Date() })
      .where(eq(memo.id, m.id));
    revalidatePath("/memos");
    revalidatePath(`/memos/${m.id}`);
    revalidatePath(`/pipeline/${m.applicationId}`);
    return {
      data: { ok: true },
      activity: {
        verb: input.archived ? "memo.archived" : "memo.restored",
        entityType: "memo",
        entityId: m.id,
        entityLabel: m.title,
        summary: `${ctx.member.displayName} ${input.archived ? "archived" : "restored"} the draft memo “${m.title}”`,
      },
    };
  },
});

/**
 * Circulate: snapshot the live draft into an immutable version, mark the memo
 * circulated, and email every active member a link. The live draft stays
 * editable; re-circulating cuts the next version.
 */
export const circulateMemo = authedAction({
  minRole: "analyst",
  input: z.object({ memoId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select({
        memo: memo,
        companyName: company.name,
        applicationId: application.id,
      })
      .from(memo)
      .innerJoin(application, eq(memo.applicationId, application.id))
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    if (m.memo.status === "decided" || m.memo.status === "archived") {
      throw new ActionError("This memo is closed");
    }

    const draft = await db
      .select()
      .from(memoSection)
      .where(and(eq(memoSection.memoId, m.memo.id), isNull(memoSection.versionId)))
      .orderBy(asc(memoSection.position));

    if (draft.length > 0 && draft.every((s) => s.wordCount === 0)) {
      throw new ActionError("Write the memo before circulating it");
    }
    const unreviewed = draft.filter((s) => isAiDraft(s.contentJson));
    if (unreviewed.length > 0) {
      throw new ActionError(
        `${unreviewed.length === 1 ? "One section is" : `${unreviewed.length} sections are`} still an unedited AI draft (${unreviewed
          .map((s) => s.title)
          .join(", ")}). Edit ${unreviewed.length === 1 ? "it" : "them"}, or mark ${unreviewed.length === 1 ? "it" : "them"} as reviewed, before circulating.`
      );
    }
    const requiredIds = draft.map((s) => s.templateSectionId).filter((id): id is string => !!id);
    if (requiredIds.length > 0) {
      const required = await db
        .select({ id: memoTemplateSection.id })
        .from(memoTemplateSection)
        .where(and(inArray(memoTemplateSection.id, requiredIds), eq(memoTemplateSection.required, true)));
      const requiredSet = new Set(required.map((r) => r.id));
      const missing = draft.filter(
        (s) => s.templateSectionId && requiredSet.has(s.templateSectionId) && s.wordCount === 0
      );
      if (missing.length > 0) {
        throw new ActionError(
          `Required section${missing.length === 1 ? "" : "s"} still empty: ${missing.map((s) => s.title).join(", ")}`
        );
      }
    }

    const versionNo = m.memo.currentVersionNo + 1;
    const [version] = await db
      .insert(memoVersion)
      .values({
        memoId: m.memo.id,
        versionNo,
        createdByMemberId: ctx.member.id,
      })
      .returning();
    if (draft.length > 0) {
      await db.insert(memoSection).values(
        draft.map((s) => ({
          memoId: m.memo.id,
          versionId: version.id,
          templateSectionId: s.templateSectionId,
          title: s.title,
          position: s.position,
          contentJson: s.contentJson,
          contentText: s.contentText,
          wordCount: s.wordCount,
          updatedByMemberId: s.updatedByMemberId,
        }))
      );
    }

    const now = new Date();
    await db
      .update(memo)
      .set({
        status: "circulated",
        currentVersionNo: versionNo,
        circulatedAt: m.memo.circulatedAt ?? now,
        updatedAt: now,
      })
      .where(eq(memo.id, m.memo.id));

    const recipients = await db
      .select({ email: member.email })
      .from(member)
      .where(
        and(eq(member.orgId, ctx.org.id), eq(member.status, "active"), ne(member.id, ctx.member.id))
      );
    const html = emailLayout({
      orgName: ctx.org.name,
      heading: m.memo.title,
      bodyHtml: `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a">${escapeHtml(
        ctx.member.displayName
      )} circulated version ${versionNo}${
        m.memo.proposedAmount ? `, proposing ${escapeHtml(formatMoney(m.memo.proposedAmount))}` : ""
      }. Read it before the vote.</p>`,
      cta: { label: "Read the memo", url: appUrl(`/memos/${m.memo.id}`) },
      footer: `You are getting this because you are an active member of ${ctx.org.name}.`,
    });
    const subject = `Memo circulated: ${m.memo.title} (v${versionNo})`;
    after(() =>
      notifyMany(recipients.map((r) => () => sendEmailSafe({ to: r.email, subject, html })))
    );

    revalidatePath(`/memos/${m.memo.id}`);
    revalidatePath("/memos");
    return {
      data: { versionNo },
      activity: {
        verb: "memo.circulated",
        entityType: "memo",
        entityId: m.memo.id,
        entityLabel: m.companyName,
        summary: `${ctx.member.displayName} circulated v${versionNo} of the ${m.companyName} memo`,
      },
    };
  },
});

export const addMemoComment = authedAction({
  minRole: "analyst",
  input: z.object({
    memoId: z.string().uuid(),
    sectionId: z.string().uuid().optional(),
    body: z.string().min(1).max(5000),
  }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select({ id: memo.id, title: memo.title })
      .from(memo)
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    const [row] = await db
      .insert(memoComment)
      .values({
        memoId: m.id,
        sectionId: input.sectionId ?? null,
        authorMemberId: ctx.member.id,
        body: input.body,
      })
      .returning();
    revalidatePath(`/memos/${m.id}`);
    return {
      data: { commentId: row.id },
      activity: {
        verb: "memo.commented",
        entityType: "memo",
        entityId: m.id,
        entityLabel: m.title,
        summary: `${ctx.member.displayName} commented on “${m.title}”`,
      },
    };
  },
});

export const resolveMemoComment = authedAction({
  minRole: "analyst",
  input: z.object({ commentId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [c] = await db
      .select({ id: memoComment.id, memoId: memoComment.memoId, orgId: memo.orgId })
      .from(memoComment)
      .innerJoin(memo, eq(memoComment.memoId, memo.id))
      .where(eq(memoComment.id, input.commentId))
      .limit(1);
    if (!c || c.orgId !== ctx.org.id) throw new ActionError("Comment not found");
    await db
      .update(memoComment)
      .set({ resolvedAt: new Date(), resolvedByMemberId: ctx.member.id })
      .where(eq(memoComment.id, c.id));
    revalidatePath(`/memos/${c.memoId}`);
    return { data: { ok: true } };
  },
});

/**
 * AI first draft. Fills EMPTY sections only — the update is conditional on
 * the section still being empty, so a member typing at the same moment always
 * wins. Each filled section carries a marker until someone edits or approves it.
 */
export const draftMemoFromApplication = authedAction({
  minRole: "analyst",
  input: z.object({ memoId: z.string().uuid() }),
  handler: async (input, ctx) => {
    if (!aiConfigured() || !orgSettings(ctx.org).ai.enabled) {
      throw new ActionError("AI drafts are switched off for this club");
    }
    const [m] = await db
      .select({ memo, app: application, co: company })
      .from(memo)
      .innerJoin(application, eq(memo.applicationId, application.id))
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    if (m.memo.status === "decided" || m.memo.status === "archived") {
      throw new ActionError("This memo is closed");
    }

    const live = await db
      .select({
        id: memoSection.id,
        title: memoSection.title,
        wordCount: memoSection.wordCount,
        guidance: memoTemplateSection.guidance,
      })
      .from(memoSection)
      .leftJoin(memoTemplateSection, eq(memoSection.templateSectionId, memoTemplateSection.id))
      .where(and(eq(memoSection.memoId, m.memo.id), isNull(memoSection.versionId)))
      .orderBy(asc(memoSection.position));
    const empty = live.filter((s) => s.wordCount === 0);
    if (empty.length === 0) {
      throw new ActionError("Every section already has writing in it — there is nothing to draft.");
    }

    const [scores, chats, notes] = await Promise.all([
      db
        .select({
          criterion: screeningCriterion.label,
          average: sql<number>`avg(${screeningScore.score})::float`,
          scorers: sql<number>`count(*)::int`,
        })
        .from(screeningScore)
        .innerJoin(screeningCriterion, eq(screeningScore.criterionId, screeningCriterion.id))
        .where(eq(screeningScore.applicationId, m.app.id))
        .groupBy(screeningCriterion.label, screeningCriterion.position)
        .orderBy(asc(screeningCriterion.position)),
      db
        .select({ id: coffeeChat.id, debrief: coffeeChat.debrief, verdict: coffeeChat.verdict })
        .from(coffeeChat)
        .where(and(eq(coffeeChat.applicationId, m.app.id), eq(coffeeChat.orgId, ctx.org.id)))
        .orderBy(asc(coffeeChat.createdAt)),
      db
        .select({ body: applicationNote.body })
        .from(applicationNote)
        .where(eq(applicationNote.applicationId, m.app.id))
        .orderBy(desc(applicationNote.createdAt))
        .limit(20),
    ]);
    const attendeeNotes = chats.length
      ? await db
          .select({ chatId: coffeeChatAttendee.coffeeChatId, note: coffeeChatAttendee.note })
          .from(coffeeChatAttendee)
          .where(
            inArray(
              coffeeChatAttendee.coffeeChatId,
              chats.map((c) => c.id)
            )
          )
      : [];

    const draft = await aiObject({
      system: MEMO_DRAFT_SYSTEM,
      prompt: buildMemoDraftPrompt(
        {
          companyName: m.co.name,
          oneLiner: m.co.oneLiner,
          description: m.co.description,
          websiteUrl: m.co.websiteUrl,
          amountRequested: m.app.amountRequested,
          useOfFunds: m.app.useOfFundsNarrative,
          pitchSummary: m.app.pitchSummary,
          team: {
            applicantName: m.app.applicantName,
            department: m.app.department,
            major: m.app.major,
            classYear: m.app.classYear,
            teamSize: m.app.teamSize,
            teamComposition: m.app.teamComposition,
          },
          screening: scores,
          coffeeChats: chats.map((c) => ({
            debrief: c.debrief,
            verdict: c.verdict,
            attendeeNotes: attendeeNotes
              .filter((a) => a.chatId === c.id && a.note)
              .map((a) => a.note!),
          })),
          notes: notes.map((n) => n.body),
        },
        empty.map((s) => ({ title: s.title, guidance: s.guidance }))
      ),
      schema: memoDraftSchema,
      effort: "medium",
    });
    if (!draft) {
      throw new ActionError("The draft didn't come back. Nothing was changed — try again in a minute.");
    }

    const filled: { id: string; contentJson: Record<string, unknown>; wordCount: number }[] = [];
    for (const { section, content } of matchDraftToSections(draft, empty)) {
      const updated = await db
        .update(memoSection)
        .set({
          contentJson: content.contentJson,
          contentText: content.contentText,
          wordCount: content.wordCount,
          updatedAt: new Date(),
        })
        .where(and(eq(memoSection.id, section.id), eq(memoSection.wordCount, 0)))
        .returning({ id: memoSection.id });
      if (updated.length > 0) {
        filled.push({ id: section.id, contentJson: content.contentJson, wordCount: content.wordCount });
      }
    }
    if (filled.length === 0) {
      throw new ActionError("The draft came back empty. Nothing was changed.");
    }
    await db.update(memo).set({ updatedAt: new Date() }).where(eq(memo.id, m.memo.id));
    revalidatePath(`/memos/${m.memo.id}`);
    return {
      data: { filled },
      activity: {
        verb: "memo.ai_drafted",
        entityType: "memo",
        entityId: m.memo.id,
        entityLabel: m.co.name,
        summary: `${ctx.member.displayName} generated an AI first draft for ${filled.length} section${filled.length === 1 ? "" : "s"} of the ${m.co.name} memo`,
      },
    };
  },
});

// ——— Memo templates (Settings → Templates) ———

async function loadTemplate(orgId: string, templateId: string) {
  const [t] = await db
    .select()
    .from(memoTemplate)
    .where(and(eq(memoTemplate.id, templateId), eq(memoTemplate.orgId, orgId)))
    .limit(1);
  if (!t) throw new ActionError("Template not found");
  return t;
}

async function loadTemplateSection(orgId: string, sectionId: string) {
  const [row] = await db
    .select({ section: memoTemplateSection, orgId: memoTemplate.orgId })
    .from(memoTemplateSection)
    .innerJoin(memoTemplate, eq(memoTemplateSection.templateId, memoTemplate.id))
    .where(eq(memoTemplateSection.id, sectionId))
    .limit(1);
  if (!row || row.orgId !== orgId) throw new ActionError("Section not found");
  return row.section;
}

const templateFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable(),
};

export const createMemoTemplate = authedAction({
  minRole: "admin",
  input: z.object(templateFields),
  handler: async (input, ctx) => {
    const [anyLive] = await db
      .select({ id: memoTemplate.id })
      .from(memoTemplate)
      .where(and(eq(memoTemplate.orgId, ctx.org.id), isNull(memoTemplate.archivedAt)))
      .limit(1);
    const [row] = await db
      .insert(memoTemplate)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        description: input.description || null,
        // The first template is the default — otherwise new memos start blank.
        isDefault: !anyLive,
      })
      .returning();
    revalidatePath("/settings");
    return {
      data: { templateId: row.id },
      activity: {
        verb: "memo_template.created",
        entityType: "memo_template",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} created the memo template “${input.name}”`,
      },
    };
  },
});

export const updateMemoTemplate = authedAction({
  minRole: "admin",
  input: z.object({ templateId: z.string().uuid(), ...templateFields }),
  handler: async (input, ctx) => {
    const t = await loadTemplate(ctx.org.id, input.templateId);
    await db
      .update(memoTemplate)
      .set({ name: input.name, description: input.description || null })
      .where(eq(memoTemplate.id, t.id));
    revalidatePath("/settings");
    return {
      data: { ok: true },
      activity: {
        verb: "memo_template.updated",
        entityType: "memo_template",
        entityId: t.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} edited the memo template “${input.name}”`,
      },
    };
  },
});

export const setDefaultMemoTemplate = authedAction({
  minRole: "admin",
  input: z.object({ templateId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const t = await loadTemplate(ctx.org.id, input.templateId);
    if (t.archivedAt) throw new ActionError("Restore the template before making it the default");
    await db
      .update(memoTemplate)
      .set({ isDefault: false })
      .where(eq(memoTemplate.orgId, ctx.org.id));
    await db.update(memoTemplate).set({ isDefault: true }).where(eq(memoTemplate.id, t.id));
    revalidatePath("/settings");
    return {
      data: { ok: true },
      activity: {
        verb: "memo_template.default_set",
        entityType: "memo_template",
        entityId: t.id,
        entityLabel: t.name,
        summary: `${ctx.member.displayName} made “${t.name}” the default memo template`,
      },
    };
  },
});

export const setMemoTemplateArchived = authedAction({
  minRole: "admin",
  input: z.object({ templateId: z.string().uuid(), archived: z.boolean() }),
  handler: async (input, ctx) => {
    const t = await loadTemplate(ctx.org.id, input.templateId);
    if (input.archived && t.isDefault) {
      throw new ActionError(
        "This is the default template — new memos start from it. Make another template the default first."
      );
    }
    await db
      .update(memoTemplate)
      .set({ archivedAt: input.archived ? new Date() : null })
      .where(eq(memoTemplate.id, t.id));
    revalidatePath("/settings");
    return {
      data: { ok: true },
      activity: {
        verb: input.archived ? "memo_template.archived" : "memo_template.restored",
        entityType: "memo_template",
        entityId: t.id,
        entityLabel: t.name,
        summary: `${ctx.member.displayName} ${input.archived ? "archived" : "restored"} the memo template “${t.name}”`,
      },
    };
  },
});

const sectionFields = {
  title: z.string().trim().min(1).max(120),
  guidance: z.string().trim().max(600).nullable(),
  required: z.boolean(),
};

export const addMemoTemplateSection = authedAction({
  minRole: "admin",
  input: z.object({ templateId: z.string().uuid(), ...sectionFields }),
  handler: async (input, ctx) => {
    const t = await loadTemplate(ctx.org.id, input.templateId);
    const [last] = await db
      .select({ position: memoTemplateSection.position })
      .from(memoTemplateSection)
      .where(eq(memoTemplateSection.templateId, t.id))
      .orderBy(desc(memoTemplateSection.position))
      .limit(1);
    const [row] = await db
      .insert(memoTemplateSection)
      .values({
        templateId: t.id,
        title: input.title,
        guidance: input.guidance || null,
        required: input.required,
        position: (last?.position ?? 0) + 1,
      })
      .returning();
    revalidatePath("/settings");
    return { data: { sectionId: row.id } };
  },
});

export const updateMemoTemplateSection = authedAction({
  minRole: "admin",
  input: z.object({ sectionId: z.string().uuid(), ...sectionFields }),
  handler: async (input, ctx) => {
    const section = await loadTemplateSection(ctx.org.id, input.sectionId);
    await db
      .update(memoTemplateSection)
      .set({ title: input.title, guidance: input.guidance || null, required: input.required })
      .where(eq(memoTemplateSection.id, section.id));
    revalidatePath("/settings");
    return { data: { ok: true } };
  },
});

export const moveMemoTemplateSection = authedAction({
  minRole: "admin",
  input: z.object({ sectionId: z.string().uuid(), direction: z.enum(["up", "down"]) }),
  handler: async (input, ctx) => {
    const section = await loadTemplateSection(ctx.org.id, input.sectionId);
    const siblings = await db
      .select({ id: memoTemplateSection.id })
      .from(memoTemplateSection)
      .where(eq(memoTemplateSection.templateId, section.templateId))
      .orderBy(asc(memoTemplateSection.position), asc(memoTemplateSection.title));
    const order = siblings.map((s) => s.id);
    const i = order.indexOf(section.id);
    const j = input.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= order.length) return { data: { ok: true } };
    [order[i], order[j]] = [order[j], order[i]];
    for (const [idx, id] of order.entries()) {
      await db
        .update(memoTemplateSection)
        .set({ position: idx + 1 })
        .where(eq(memoTemplateSection.id, id));
    }
    revalidatePath("/settings");
    return { data: { ok: true } };
  },
});

/**
 * Removing a section only changes memos started afterwards. Memos already
 * written from the template keep their section (title and text); they just
 * lose the link back to its guidance.
 */
export const deleteMemoTemplateSection = authedAction({
  minRole: "admin",
  input: z.object({ sectionId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const section = await loadTemplateSection(ctx.org.id, input.sectionId);
    await db
      .update(memoSection)
      .set({ templateSectionId: null })
      .where(eq(memoSection.templateSectionId, section.id));
    await db.delete(memoTemplateSection).where(eq(memoTemplateSection.id, section.id));
    revalidatePath("/settings");
    return { data: { ok: true } };
  },
});
