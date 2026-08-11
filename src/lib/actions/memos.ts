"use server";

import { z } from "zod";
import { and, eq, isNull, asc, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
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
  MEMO_RECOMMENDATIONS,
} from "@/db/schema";
import { authedAction } from "./safe-action";
import { sendEmail } from "@/lib/email";
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
    if (!app) throw new Error("Application not found");

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

    const [row] = await db
      .insert(memo)
      .values({
        orgId: ctx.org.id,
        applicationId: app.id,
        templateId: templateId ?? null,
        title: `${app.companyName} — grant memo`,
        authorMemberId: ctx.member.id,
      })
      .returning();

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
    revalidatePath(`/applications/${app.id}`);
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
    if (!section || section.orgId !== ctx.org.id) throw new Error("Section not found");
    if (section.versionId) throw new Error("Version snapshots are immutable");
    if (section.status === "decided" || section.status === "archived") {
      throw new Error("This memo is closed");
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
    title: z.string().min(1).max(200).optional(),
    recommendation: z.enum(MEMO_RECOMMENDATIONS).optional(),
    proposedAmount: z.coerce.number().min(0).max(1_000_000).nullable().optional(),
  }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select()
      .from(memo)
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new Error("Memo not found");
    await db
      .update(memo)
      .set({
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.recommendation !== undefined ? { recommendation: input.recommendation } : {}),
        ...(input.proposedAmount !== undefined
          ? { proposedAmount: input.proposedAmount != null ? String(input.proposedAmount) : null }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(memo.id, m.id));
    revalidatePath(`/memos/${m.id}`);
    return { data: { ok: true } };
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
    if (!m) throw new Error("Memo not found");
    if (m.memo.status === "decided" || m.memo.status === "archived") {
      throw new Error("This memo is closed");
    }

    const draft = await db
      .select()
      .from(memoSection)
      .where(and(eq(memoSection.memoId, m.memo.id), isNull(memoSection.versionId)))
      .orderBy(asc(memoSection.position));

    const emptyRequired = draft.filter((s) => s.wordCount === 0);
    if (draft.length > 0 && emptyRequired.length === draft.length) {
      throw new Error("Write the memo before circulating it");
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

    // Email the club (best-effort; Resend free tier is 100/day — one send
    // per member per circulate is fine at club scale).
    const members = await db
      .select({ email: member.email, name: member.displayName })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), eq(member.status, "active")));
    const base = process.env.BETTER_AUTH_URL ?? "";
    const url = `${base}/memos/${m.memo.id}`;
    void Promise.allSettled(
      members
        .filter((mm) => mm.email !== ctx.member.email)
        .map((mm) =>
          sendEmail({
            to: mm.email,
            subject: `Memo circulated: ${m.memo.title} (v${versionNo})`,
            html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="font-size:16px;margin:0 0 8px">${m.memo.title}</h2>
              <p style="color:#555;font-size:14px">${ctx.member.displayName} circulated version ${versionNo}${
                m.memo.proposedAmount
                  ? ` proposing ${formatMoney(m.memo.proposedAmount)}`
                  : ""
              }. Read it before the vote.</p>
              <p style="margin:16px 0"><a href="${url}" style="background:#4f46e5;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:14px">Read the memo</a></p>
            </div>`,
          }).catch(() => {})
        )
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
    if (!m) throw new Error("Memo not found");
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
    if (!c || c.orgId !== ctx.org.id) throw new Error("Comment not found");
    await db
      .update(memoComment)
      .set({ resolvedAt: new Date(), resolvedByMemberId: ctx.member.id })
      .where(eq(memoComment.id, c.id));
    revalidatePath(`/memos/${c.memoId}`);
    return { data: { ok: true } };
  },
});
