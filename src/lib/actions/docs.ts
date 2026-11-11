"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { doc, DOC_VISIBILITIES, type DocVisibility, type MemberRole } from "@/db/schema";
import { roleAtLeast, type Ctx } from "./context";
import { authedAction, ActionError } from "./safe-action";

const VISIBILITY_MIN_ROLE: Record<DocVisibility, MemberRole> = {
  all: "read_only",
  partners: "partner",
  admins: "admin",
};

function canSee(role: MemberRole, visibility: DocVisibility) {
  return roleAtLeast(role, VISIBILITY_MIN_ROLE[visibility]);
}

/** Loads a live doc the caller is allowed to see; anything else is "not found". */
async function loadVisibleDoc(ctx: Ctx, docId: string) {
  const [row] = await db
    .select()
    .from(doc)
    .where(and(eq(doc.id, docId), eq(doc.orgId, ctx.org.id), isNull(doc.archivedAt)))
    .limit(1);
  if (!row || !canSee(ctx.member.role, row.visibility)) throw new ActionError("Doc not found");
  return row;
}

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

export const createDoc = authedAction({
  minRole: "analyst",
  input: z.object({
    title: z.string().min(1).max(200),
    folder: z.string().max(80).optional(),
    visibility: z.enum(DOC_VISIBILITIES).default("all"),
  }),
  handler: async (input, ctx) => {
    if (!canSee(ctx.member.role, input.visibility)) {
      throw new ActionError("You can't create a doc you wouldn't be able to open");
    }
    let slug = slugify(input.title) || "doc";
    const [existing] = await db
      .select({ id: doc.id })
      .from(doc)
      .where(and(eq(doc.orgId, ctx.org.id), eq(doc.slug, slug)))
      .limit(1);
    if (existing) slug = `${slug}-${Date.now().toString(36)}`;

    const [row] = await db
      .insert(doc)
      .values({
        orgId: ctx.org.id,
        title: input.title,
        slug,
        folder: input.folder,
        visibility: input.visibility,
        createdByMemberId: ctx.member.id,
        updatedByMemberId: ctx.member.id,
      })
      .returning();
    revalidatePath("/docs");
    return {
      data: { slug: row.slug },
      activity: {
        verb: "doc.created",
        entityType: "doc",
        entityId: row.id,
        entityLabel: input.title,
        summary: `${ctx.member.displayName} created the doc “${input.title}”`,
      },
    };
  },
});

export const updateDocContent = authedAction({
  minRole: "analyst",
  input: z.object({
    docId: z.string().uuid(),
    contentJson: z.record(z.string(), z.unknown()),
    contentText: z.string().max(200_000),
  }),
  handler: async (input, ctx) => {
    const row = await loadVisibleDoc(ctx, input.docId);
    await db
      .update(doc)
      .set({
        contentJson: JSON.stringify(input.contentJson),
        contentText: input.contentText,
        updatedByMemberId: ctx.member.id,
        updatedAt: new Date(),
      })
      .where(eq(doc.id, row.id));
    // Autosave — no activity (would flood the feed).
    return { data: { ok: true } };
  },
});

export const togglePinDoc = authedAction({
  minRole: "partner",
  input: z.object({ docId: z.string().uuid(), pinned: z.boolean() }),
  handler: async (input, ctx) => {
    const row = await loadVisibleDoc(ctx, input.docId);
    await db.update(doc).set({ isPinned: input.pinned }).where(eq(doc.id, row.id));
    revalidatePath("/docs");
    revalidatePath(`/docs/${row.slug}`);
    return { data: { ok: true } };
  },
});

/** Title, folder and who can see it. The slug never changes, so links survive a rename. */
export const updateDocMeta = authedAction({
  minRole: "analyst",
  input: z.object({
    docId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    folder: z.string().trim().max(80).nullable(),
    visibility: z.enum(DOC_VISIBILITIES),
  }),
  handler: async (input, ctx) => {
    const row = await loadVisibleDoc(ctx, input.docId);
    if (input.visibility !== row.visibility) {
      if (!roleAtLeast(ctx.member.role, "partner")) {
        throw new ActionError("Only partners and admins can change who sees a doc");
      }
      if (!canSee(ctx.member.role, input.visibility)) {
        throw new ActionError("You can't restrict a doc beyond your own role");
      }
    }
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (row.title !== input.title) diff.title = { from: row.title, to: input.title };
    if ((row.folder ?? null) !== (input.folder || null))
      diff.folder = { from: row.folder, to: input.folder || null };
    if (row.visibility !== input.visibility)
      diff.visibility = { from: row.visibility, to: input.visibility };

    await db
      .update(doc)
      .set({
        title: input.title,
        folder: input.folder || null,
        visibility: input.visibility,
        updatedByMemberId: ctx.member.id,
        updatedAt: new Date(),
      })
      .where(eq(doc.id, row.id));
    revalidatePath("/docs");
    revalidatePath(`/docs/${row.slug}`);
    return {
      data: { ok: true },
      activity: {
        verb: "doc.updated",
        entityType: "doc",
        entityId: row.id,
        entityLabel: input.title,
        summary: `${ctx.member.displayName} edited the doc “${input.title}”`,
        diff,
      },
    };
  },
});

/** Soft delete. The author can archive their own doc; partners can archive any. */
export const setDocArchived = authedAction({
  minRole: "analyst",
  input: z.object({ docId: z.string().uuid(), archived: z.boolean() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(doc)
      .where(and(eq(doc.id, input.docId), eq(doc.orgId, ctx.org.id)))
      .limit(1);
    if (!row || !canSee(ctx.member.role, row.visibility)) throw new ActionError("Doc not found");
    const isAuthor = row.createdByMemberId === ctx.member.id;
    if (!isAuthor && !roleAtLeast(ctx.member.role, "partner")) {
      throw new ActionError("Only the author, a partner or an admin can archive this doc");
    }
    await db
      .update(doc)
      .set({ archivedAt: input.archived ? new Date() : null, isPinned: input.archived ? false : row.isPinned })
      .where(eq(doc.id, row.id));
    revalidatePath("/docs");
    return {
      data: { slug: row.slug },
      activity: {
        verb: input.archived ? "doc.archived" : "doc.restored",
        entityType: "doc",
        entityId: row.id,
        entityLabel: row.title,
        summary: `${ctx.member.displayName} ${input.archived ? "archived" : "restored"} the doc “${row.title}”`,
      },
    };
  },
});
