"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { doc, DOC_VISIBILITIES } from "@/db/schema";
import { authedAction } from "./safe-action";

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
    const [row] = await db
      .select({ id: doc.id })
      .from(doc)
      .where(and(eq(doc.id, input.docId), eq(doc.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new Error("Doc not found");
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
    await db
      .update(doc)
      .set({ isPinned: input.pinned })
      .where(and(eq(doc.id, input.docId), eq(doc.orgId, ctx.org.id)));
    revalidatePath("/docs");
    return { data: { ok: true } };
  },
});
