"use server";

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { screeningCriterion, sector, dealSource, SOURCE_KINDS } from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";

/**
 * Lookup-table management (screening criteria, sectors, deal sources).
 * All soft-delete via archived_at — existing rows keep their FKs; queries
 * already filter archived lookups out of pickers and averages.
 */

function revalidateLookups() {
  revalidatePath("/settings");
  revalidatePath("/pipeline");
  revalidatePath("/insights");
}

// ——— Screening criteria ———

export const createScreeningCriterion = authedAction({
  minRole: "admin",
  input: z.object({
    label: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
  }),
  handler: async (input, ctx) => {
    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${screeningCriterion.position}), 0)::int` })
      .from(screeningCriterion)
      .where(eq(screeningCriterion.orgId, ctx.org.id));
    const [row] = await db
      .insert(screeningCriterion)
      .values({
        orgId: ctx.org.id,
        label: input.label,
        description: input.description,
        position: maxPos + 1,
      })
      .returning();
    revalidateLookups();
    return {
      data: { id: row.id },
      activity: {
        verb: "criterion.created",
        entityType: "screening_criterion",
        entityId: row.id,
        entityLabel: input.label,
        summary: `${ctx.member.displayName} added the screening criterion “${input.label}”`,
      },
    };
  },
});

export const updateScreeningCriterion = authedAction({
  minRole: "admin",
  input: z.object({
    id: z.string().uuid(),
    label: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(screeningCriterion)
      .where(and(eq(screeningCriterion.id, input.id), eq(screeningCriterion.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Criterion not found");
    await db
      .update(screeningCriterion)
      .set({ label: input.label, description: input.description ?? null })
      .where(eq(screeningCriterion.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "criterion.updated",
        entityType: "screening_criterion",
        entityId: row.id,
        entityLabel: input.label,
        summary: `${ctx.member.displayName} updated the screening criterion “${input.label}”`,
        diff: { label: { from: row.label, to: input.label } },
      },
    };
  },
});

export const archiveScreeningCriterion = authedAction({
  minRole: "admin",
  input: z.object({ id: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(screeningCriterion)
      .where(and(eq(screeningCriterion.id, input.id), eq(screeningCriterion.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Criterion not found");
    await db
      .update(screeningCriterion)
      .set({ archivedAt: new Date() })
      .where(eq(screeningCriterion.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "criterion.archived",
        entityType: "screening_criterion",
        entityId: row.id,
        entityLabel: row.label,
        summary: `${ctx.member.displayName} archived the screening criterion “${row.label}”`,
      },
    };
  },
});

// ——— Sectors ———

export const createSector = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().min(1).max(80),
    colorToken: z.string().max(20).default("cat-2"),
  }),
  handler: async (input, ctx) => {
    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) throw new ActionError("Sector name must contain letters or numbers");
    const existing = await db
      .select({ id: sector.id })
      .from(sector)
      .where(and(eq(sector.orgId, ctx.org.id), eq(sector.slug, slug), isNull(sector.archivedAt)))
      .limit(1);
    if (existing[0]) throw new ActionError("A sector with a similar name already exists");

    const [{ maxPos }] = await db
      .select({ maxPos: sql<number>`coalesce(max(${sector.position}), 0)::int` })
      .from(sector)
      .where(eq(sector.orgId, ctx.org.id));
    const [row] = await db
      .insert(sector)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        slug,
        colorToken: input.colorToken,
        position: maxPos + 1,
      })
      .returning();
    revalidateLookups();
    return {
      data: { id: row.id },
      activity: {
        verb: "sector.created",
        entityType: "sector",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} added the ${input.name} sector`,
      },
    };
  },
});

export const updateSector = authedAction({
  minRole: "admin",
  input: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(sector)
      .where(and(eq(sector.id, input.id), eq(sector.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Sector not found");
    await db.update(sector).set({ name: input.name }).where(eq(sector.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "sector.updated",
        entityType: "sector",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} renamed the ${row.name} sector to ${input.name}`,
        diff: { name: { from: row.name, to: input.name } },
      },
    };
  },
});

export const archiveSector = authedAction({
  minRole: "admin",
  input: z.object({ id: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(sector)
      .where(and(eq(sector.id, input.id), eq(sector.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Sector not found");
    await db.update(sector).set({ archivedAt: new Date() }).where(eq(sector.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "sector.archived",
        entityType: "sector",
        entityId: row.id,
        entityLabel: row.name,
        summary: `${ctx.member.displayName} archived the ${row.name} sector`,
      },
    };
  },
});

// ——— Deal sources ———

export const createDealSource = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().min(1).max(80),
    kind: z.enum(SOURCE_KINDS).default("other"),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .insert(dealSource)
      .values({ orgId: ctx.org.id, name: input.name, kind: input.kind })
      .returning();
    revalidateLookups();
    return {
      data: { id: row.id },
      activity: {
        verb: "deal_source.created",
        entityType: "deal_source",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} added the ${input.name} deal source`,
      },
    };
  },
});

export const updateDealSource = authedAction({
  minRole: "admin",
  input: z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(dealSource)
      .where(and(eq(dealSource.id, input.id), eq(dealSource.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Deal source not found");
    await db.update(dealSource).set({ name: input.name }).where(eq(dealSource.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "deal_source.updated",
        entityType: "deal_source",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} renamed the ${row.name} deal source to ${input.name}`,
        diff: { name: { from: row.name, to: input.name } },
      },
    };
  },
});

export const archiveDealSource = authedAction({
  minRole: "admin",
  input: z.object({ id: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(dealSource)
      .where(and(eq(dealSource.id, input.id), eq(dealSource.orgId, ctx.org.id)))
      .limit(1);
    if (!row || row.archivedAt) throw new ActionError("Deal source not found");
    await db.update(dealSource).set({ archivedAt: new Date() }).where(eq(dealSource.id, row.id));
    revalidateLookups();
    return {
      data: { ok: true },
      activity: {
        verb: "deal_source.archived",
        entityType: "deal_source",
        entityId: row.id,
        entityLabel: row.name,
        summary: `${ctx.member.displayName} archived the ${row.name} deal source`,
      },
    };
  },
});

