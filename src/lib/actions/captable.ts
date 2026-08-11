"use server";

import { z } from "zod";
import { and, eq, desc, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { capTable, capEvent } from "@/db/schema";
import { CapEventPayload, CapEventInput } from "@/lib/captable/types";
import { foldCapTable } from "@/lib/captable/engine";
import { getPreset } from "@/lib/captable/presets";
import { authedAction, ActionError } from "./safe-action";

async function loadTable(orgId: string, capTableId: string) {
  const [t] = await db
    .select()
    .from(capTable)
    .where(and(eq(capTable.id, capTableId), eq(capTable.orgId, orgId)))
    .limit(1);
  if (!t) throw new ActionError("Cap table not found");
  return t;
}

async function loadEvents(capTableId: string) {
  const rows = await db
    .select()
    .from(capEvent)
    .where(eq(capEvent.capTableId, capTableId))
    .orderBy(asc(capEvent.seq));
  return rows.map((r) => ({
    seq: r.seq,
    effectiveDate: r.effectiveDate.toISOString(),
    label: r.label ?? undefined,
    payload: r.payload as CapEventInput["payload"],
  }));
}

export const createCapTable = authedAction({
  minRole: "analyst",
  input: z.object({
    name: z.string().min(1).max(120),
    presetKey: z.string().default("blank"),
    companyId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const preset = getPreset(input.presetKey);
    const [t] = await db
      .insert(capTable)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        companyId: input.companyId ?? null,
        source: preset && preset.key !== "blank" ? "preset" : "manual",
        createdByMemberId: ctx.member.id,
      })
      .returning();

    if (preset && preset.events.length > 0) {
      await db.insert(capEvent).values(
        preset.events.map((e, i) => ({
          capTableId: t.id,
          seq: i + 1,
          effectiveDate: new Date(),
          kind: e.payload.kind,
          label: e.label,
          payload: e.payload as unknown as Record<string, unknown>,
          createdByMemberId: ctx.member.id,
        }))
      );
    }

    revalidatePath("/lab");
    return {
      data: { capTableId: t.id },
      activity: {
        verb: "captable.created",
        entityType: "cap_table",
        entityId: t.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} created the cap table “${input.name}”${
          preset && preset.key !== "blank" ? ` from the ${preset.name} preset` : ""
        }`,
      },
    };
  },
});

export const addCapEvent = authedAction({
  minRole: "analyst",
  input: z.object({
    capTableId: z.string().uuid(),
    label: z.string().max(200).optional(),
    payload: CapEventPayload,
  }),
  handler: async (input, ctx) => {
    const t = await loadTable(ctx.org.id, input.capTableId);
    const existing = await loadEvents(t.id);
    const nextSeq = existing.length > 0 ? existing[existing.length - 1].seq + 1 : 1;

    // Validate by folding: the new ledger must be computable BEFORE we save.
    // This is what turns bad input into a friendly error instead of a
    // broken table (grant exceeds pool, transfer overdraws, unattainable
    // pool target, SAFEs promising ≥100%…).
    const candidate = [
      ...existing,
      {
        seq: nextSeq,
        effectiveDate: new Date().toISOString(),
        label: input.label,
        payload: input.payload,
      },
    ];
    try {
      foldCapTable(candidate);
    } catch (e) {
      throw new ActionError(e instanceof Error ? e.message : "That event makes the ledger inconsistent");
    }

    await db.insert(capEvent).values({
      capTableId: t.id,
      seq: nextSeq,
      effectiveDate: new Date(),
      kind: input.payload.kind,
      label: input.label,
      payload: input.payload as unknown as Record<string, unknown>,
      createdByMemberId: ctx.member.id,
    });

    revalidatePath(`/lab/${t.id}`);
    return { data: { seq: nextSeq } };
  },
});

/** Only the LAST event is deletable — an append-only ledger you can undo. */
export const deleteLastCapEvent = authedAction({
  minRole: "analyst",
  input: z.object({ capTableId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const t = await loadTable(ctx.org.id, input.capTableId);
    const [last] = await db
      .select()
      .from(capEvent)
      .where(eq(capEvent.capTableId, t.id))
      .orderBy(desc(capEvent.seq))
      .limit(1);
    if (!last) throw new ActionError("No events to undo");
    await db.delete(capEvent).where(eq(capEvent.id, last.id));
    revalidatePath(`/lab/${t.id}`);
    return { data: { removedSeq: last.seq } };
  },
});

export const duplicateAsScenario = authedAction({
  minRole: "analyst",
  input: z.object({ capTableId: z.string().uuid(), name: z.string().min(1).max(120) }),
  handler: async (input, ctx) => {
    const t = await loadTable(ctx.org.id, input.capTableId);
    const events = await db
      .select()
      .from(capEvent)
      .where(eq(capEvent.capTableId, t.id))
      .orderBy(asc(capEvent.seq));

    const [clone] = await db
      .insert(capTable)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        companyId: t.companyId,
        source: t.source,
        isScenario: true,
        parentCapTableId: t.id,
        createdByMemberId: ctx.member.id,
      })
      .returning();
    if (events.length > 0) {
      await db.insert(capEvent).values(
        events.map((e) => ({
          capTableId: clone.id,
          seq: e.seq,
          effectiveDate: e.effectiveDate,
          kind: e.kind,
          label: e.label,
          isProjected: e.isProjected,
          payload: e.payload,
          createdByMemberId: ctx.member.id,
        }))
      );
    }
    revalidatePath("/lab");
    return { data: { capTableId: clone.id } };
  },
});

export const archiveCapTable = authedAction({
  minRole: "analyst",
  input: z.object({ capTableId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const t = await loadTable(ctx.org.id, input.capTableId);
    await db
      .update(capTable)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(capTable.id, t.id));
    revalidatePath("/lab");
    return { data: { ok: true } };
  },
});
