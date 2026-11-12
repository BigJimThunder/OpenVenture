"use server";

import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { application, pipelineStage, STAGE_KINDS } from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";

function revalidateStages() {
  revalidatePath("/settings");
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
}

async function loadStage(orgId: string, stageId: string) {
  const [stage] = await db
    .select()
    .from(pipelineStage)
    .where(and(eq(pipelineStage.id, stageId), eq(pipelineStage.orgId, orgId)))
    .limit(1);
  if (!stage || stage.archivedAt) throw new ActionError("Stage not found");
  return stage;
}

export const updateStage = authedAction({
  minRole: "admin",
  input: z.object({
    stageId: z.string().uuid(),
    name: z.string().min(1).max(60).optional(),
    slaDays: z.coerce.number().int().min(1).max(365).nullable().optional(),
    minAttendees: z.coerce.number().int().min(1).max(20).nullable().optional(),
    requiresMemo: z.boolean().optional(),
    requiresVote: z.boolean().optional(),
    colorToken: z.string().max(20).optional(),
  }),
  handler: async (input, ctx) => {
    const stage = await loadStage(ctx.org.id, input.stageId);

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const fields = ["name", "slaDays", "minAttendees", "requiresMemo", "requiresVote", "colorToken"] as const;
    for (const f of fields) {
      if (input[f] !== undefined && input[f] !== stage[f]) {
        diff[f] = { from: stage[f], to: input[f] };
      }
    }

    await db
      .update(pipelineStage)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.slaDays !== undefined ? { slaDays: input.slaDays } : {}),
        ...(input.minAttendees !== undefined ? { minAttendees: input.minAttendees } : {}),
        ...(input.requiresMemo !== undefined ? { requiresMemo: input.requiresMemo } : {}),
        ...(input.requiresVote !== undefined ? { requiresVote: input.requiresVote } : {}),
        ...(input.colorToken !== undefined ? { colorToken: input.colorToken } : {}),
      })
      .where(eq(pipelineStage.id, stage.id));

    revalidateStages();
    return {
      data: { ok: true },
      activity: {
        verb: "stage.updated",
        entityType: "pipeline_stage",
        entityId: stage.id,
        entityLabel: input.name ?? stage.name,
        summary: `${ctx.member.displayName} updated the ${input.name ?? stage.name} stage`,
        diff,
      },
    };
  },
});

export const createStage = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().min(1).max(60),
    kind: z.enum(STAGE_KINDS).default("active"),
    colorToken: z.string().max(20).default("cat-1"),
  }),
  handler: async (input, ctx) => {
    const stages = await db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.orgId, ctx.org.id), isNull(pipelineStage.archivedAt)))
      .orderBy(asc(pipelineStage.position));

    const slug = input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) throw new ActionError("Stage name must contain letters or numbers");
    if (stages.some((s) => s.slug === slug)) {
      throw new ActionError("A stage with a similar name already exists");
    }

    // Active stages slot between the last active and the first terminal;
    // terminal stages go at the very end.
    let position: number;
    if (input.kind === "active") {
      const actives = stages.filter((s) => s.kind === "active");
      const lastActive = actives.length ? Number(actives[actives.length - 1].position) : 0;
      const firstTerminal = stages.find((s) => s.kind !== "active");
      position = firstTerminal
        ? (lastActive + Number(firstTerminal.position)) / 2
        : lastActive + 1;
    } else {
      const last = stages.length ? Number(stages[stages.length - 1].position) : 0;
      position = last + 1;
    }

    const [row] = await db
      .insert(pipelineStage)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        slug,
        kind: input.kind,
        colorToken: input.colorToken,
        position: String(position),
      })
      .returning();

    revalidateStages();
    return {
      data: { stageId: row.id },
      activity: {
        verb: "stage.created",
        entityType: "pipeline_stage",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} added the ${input.name} stage`,
      },
    };
  },
});

export const reorderStage = authedAction({
  record: { did: "reordered the pipeline stages", entity: "pipeline_stage", id: "stageId" },
  minRole: "admin",
  input: z.object({
    stageId: z.string().uuid(),
    /** Move one slot up or down among same-kind neighbours. */
    direction: z.enum(["up", "down"]),
  }),
  handler: async (input, ctx) => {
    const stage = await loadStage(ctx.org.id, input.stageId);
    if (stage.isEntryStage) throw new ActionError("The entry stage stays first");

    const siblings = await db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.orgId, ctx.org.id), isNull(pipelineStage.archivedAt)))
      .orderBy(asc(pipelineStage.position));

    // Only reorder within the same kind — actives stay before terminals.
    const sameKind = siblings.filter((s) => s.kind === stage.kind);
    const idx = sameKind.findIndex((s) => s.id === stage.id);
    const swapWith = input.direction === "up" ? sameKind[idx - 1] : sameKind[idx + 1];
    if (!swapWith || swapWith.isEntryStage) {
      throw new ActionError("Nothing to swap with in that direction");
    }

    await Promise.all([
      db
        .update(pipelineStage)
        .set({ position: swapWith.position })
        .where(eq(pipelineStage.id, stage.id)),
      db
        .update(pipelineStage)
        .set({ position: stage.position })
        .where(eq(pipelineStage.id, swapWith.id)),
    ]);

    revalidateStages();
    return { data: { ok: true } };
  },
});

export const archiveStage = authedAction({
  minRole: "admin",
  input: z.object({ stageId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const stage = await loadStage(ctx.org.id, input.stageId);
    if (stage.isEntryStage) throw new ActionError("The entry stage can't be archived");

    if (stage.kind === "active") {
      const [{ n: activeCount }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(pipelineStage)
        .where(
          and(
            eq(pipelineStage.orgId, ctx.org.id),
            eq(pipelineStage.kind, "active"),
            isNull(pipelineStage.archivedAt)
          )
        );
      if (activeCount <= 1) throw new ActionError("The last active stage can't be archived");
    }

    const [{ n: residents }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .where(and(eq(application.stageId, stage.id), isNull(application.archivedAt)));
    if (residents > 0) {
      throw new ActionError(
        `Move the ${residents} application${residents === 1 ? "" : "s"} out of ${stage.name} first`
      );
    }

    await db
      .update(pipelineStage)
      .set({ archivedAt: new Date() })
      .where(eq(pipelineStage.id, stage.id));

    revalidateStages();
    return {
      data: { ok: true },
      activity: {
        verb: "stage.archived",
        entityType: "pipeline_stage",
        entityId: stage.id,
        entityLabel: stage.name,
        summary: `${ctx.member.displayName} archived the ${stage.name} stage`,
      },
    };
  },
});
