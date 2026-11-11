"use server";

import { z } from "zod";
import { and, asc, desc, eq, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  member,
  onboardingTrack,
  onboardingTask,
  onboardingAssignment,
  onboardingCompletion,
  ONBOARDING_TASK_KINDS,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";

/** Onboarding tracks and their tasks. Admin-only: this is club configuration. */

function revalidateOnboarding() {
  revalidatePath("/onboarding");
  revalidatePath("/members");
}

async function loadTrack(orgId: string, trackId: string) {
  const [t] = await db
    .select()
    .from(onboardingTrack)
    .where(and(eq(onboardingTrack.id, trackId), eq(onboardingTrack.orgId, orgId)))
    .limit(1);
  if (!t) throw new ActionError("Track not found");
  return t;
}

async function loadTask(orgId: string, taskId: string) {
  const [row] = await db
    .select({ task: onboardingTask, orgId: onboardingTrack.orgId })
    .from(onboardingTask)
    .innerJoin(onboardingTrack, eq(onboardingTask.trackId, onboardingTrack.id))
    .where(eq(onboardingTask.id, taskId))
    .limit(1);
  if (!row || row.orgId !== orgId) throw new ActionError("Task not found");
  return row.task;
}

/** Re-derive whether an assignment is complete after its track's tasks change. */
async function recomputeTrackCompletion(trackId: string) {
  const [tasks, assignments] = await Promise.all([
    db
      .select({ id: onboardingTask.id, required: onboardingTask.required })
      .from(onboardingTask)
      .where(eq(onboardingTask.trackId, trackId)),
    db
      .select({ id: onboardingAssignment.id, completedAt: onboardingAssignment.completedAt })
      .from(onboardingAssignment)
      .where(eq(onboardingAssignment.trackId, trackId)),
  ]);
  const required = tasks.filter((t) => t.required).map((t) => t.id);
  for (const a of assignments) {
    const done = await db
      .select({ taskId: onboardingCompletion.taskId })
      .from(onboardingCompletion)
      .where(eq(onboardingCompletion.assignmentId, a.id));
    const doneIds = new Set(done.map((d) => d.taskId));
    const complete = required.length > 0 && required.every((id) => doneIds.has(id));
    if (complete !== Boolean(a.completedAt)) {
      await db
        .update(onboardingAssignment)
        .set({ completedAt: complete ? new Date() : null })
        .where(eq(onboardingAssignment.id, a.id));
    }
  }
}

const trackFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).nullable(),
};

export const createOnboardingTrack = authedAction({
  minRole: "admin",
  input: z.object(trackFields),
  handler: async (input, ctx) => {
    const [anyLive] = await db
      .select({ id: onboardingTrack.id })
      .from(onboardingTrack)
      .where(and(eq(onboardingTrack.orgId, ctx.org.id), isNull(onboardingTrack.archivedAt)))
      .limit(1);
    const [row] = await db
      .insert(onboardingTrack)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        description: input.description || null,
        // The first track becomes the one new invitees get automatically.
        isDefault: !anyLive,
      })
      .returning();
    revalidateOnboarding();
    return {
      data: { trackId: row.id },
      activity: {
        verb: "onboarding_track.created",
        entityType: "onboarding_track",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} created the onboarding track “${input.name}”`,
      },
    };
  },
});

export const updateOnboardingTrack = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid(), ...trackFields }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    await db
      .update(onboardingTrack)
      .set({ name: input.name, description: input.description || null })
      .where(eq(onboardingTrack.id, t.id));
    revalidateOnboarding();
    return { data: { ok: true } };
  },
});

export const setDefaultOnboardingTrack = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    if (t.archivedAt) throw new ActionError("Restore the track before making it the default");
    await db
      .update(onboardingTrack)
      .set({ isDefault: false })
      .where(eq(onboardingTrack.orgId, ctx.org.id));
    await db.update(onboardingTrack).set({ isDefault: true }).where(eq(onboardingTrack.id, t.id));
    revalidateOnboarding();
    return {
      data: { ok: true },
      activity: {
        verb: "onboarding_track.default_set",
        entityType: "onboarding_track",
        entityId: t.id,
        entityLabel: t.name,
        summary: `${ctx.member.displayName} made “${t.name}” the default onboarding track`,
      },
    };
  },
});

/** Archive hides the track; members already on it keep their progress. */
export const setOnboardingTrackArchived = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid(), archived: z.boolean() }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    await db
      .update(onboardingTrack)
      .set({
        archivedAt: input.archived ? new Date() : null,
        // An archived track can't stay the default — invites would silently skip onboarding.
        ...(input.archived ? { isDefault: false } : {}),
      })
      .where(eq(onboardingTrack.id, t.id));
    revalidateOnboarding();
    return {
      data: { wasDefault: input.archived && t.isDefault },
      activity: {
        verb: input.archived ? "onboarding_track.archived" : "onboarding_track.restored",
        entityType: "onboarding_track",
        entityId: t.id,
        entityLabel: t.name,
        summary: `${ctx.member.displayName} ${input.archived ? "archived" : "restored"} the onboarding track “${t.name}”`,
      },
    };
  },
});

const taskFields = {
  title: z.string().trim().min(1).max(160),
  kind: z.enum(ONBOARDING_TASK_KINDS),
  resourceUrl: z.string().trim().url().max(500).nullable().or(z.literal("").transform(() => null)),
  required: z.boolean(),
};

export const addOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid(), ...taskFields }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    const [last] = await db
      .select({ position: onboardingTask.position })
      .from(onboardingTask)
      .where(eq(onboardingTask.trackId, t.id))
      .orderBy(desc(onboardingTask.position))
      .limit(1);
    const [row] = await db
      .insert(onboardingTask)
      .values({
        trackId: t.id,
        title: input.title,
        kind: input.kind,
        resourceUrl: input.resourceUrl,
        required: input.required,
        position: (last?.position ?? 0) + 1,
      })
      .returning();
    // A new required task re-opens assignments that were complete.
    if (input.required) await recomputeTrackCompletion(t.id);
    revalidateOnboarding();
    return { data: { taskId: row.id } };
  },
});

export const updateOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ taskId: z.string().uuid(), ...taskFields }),
  handler: async (input, ctx) => {
    const task = await loadTask(ctx.org.id, input.taskId);
    await db
      .update(onboardingTask)
      .set({
        title: input.title,
        kind: input.kind,
        resourceUrl: input.resourceUrl,
        required: input.required,
      })
      .where(eq(onboardingTask.id, task.id));
    if (task.required !== input.required) await recomputeTrackCompletion(task.trackId);
    revalidateOnboarding();
    return { data: { ok: true } };
  },
});

export const moveOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ taskId: z.string().uuid(), direction: z.enum(["up", "down"]) }),
  handler: async (input, ctx) => {
    const task = await loadTask(ctx.org.id, input.taskId);
    const siblings = await db
      .select({ id: onboardingTask.id })
      .from(onboardingTask)
      .where(eq(onboardingTask.trackId, task.trackId))
      .orderBy(asc(onboardingTask.position), asc(onboardingTask.title));
    const order = siblings.map((s) => s.id);
    const i = order.indexOf(task.id);
    const j = input.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= order.length) return { data: { ok: true } };
    [order[i], order[j]] = [order[j], order[i]];
    for (const [idx, id] of order.entries()) {
      await db.update(onboardingTask).set({ position: idx + 1 }).where(eq(onboardingTask.id, id));
    }
    revalidateOnboarding();
    return { data: { ok: true } };
  },
});

/**
 * Tasks have no archive flag. Deleting one also removes the check marks
 * members made against it — the UI says so before asking.
 */
export const deleteOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ taskId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const task = await loadTask(ctx.org.id, input.taskId);
    await db.delete(onboardingCompletion).where(eq(onboardingCompletion.taskId, task.id));
    await db.delete(onboardingTask).where(eq(onboardingTask.id, task.id));
    await recomputeTrackCompletion(task.trackId);
    revalidateOnboarding();
    return {
      data: { ok: true },
      activity: {
        verb: "onboarding_task.deleted",
        entityType: "onboarding_track",
        entityId: task.trackId,
        entityLabel: task.title,
        summary: `${ctx.member.displayName} removed the onboarding task “${task.title}”`,
      },
    };
  },
});

export const assignOnboardingTrack = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid(), memberIds: z.array(z.string().uuid()).min(1).max(100) }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    if (t.archivedAt) throw new ActionError("This track is archived");
    const [members, existing] = await Promise.all([
      db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.orgId, ctx.org.id), isNull(member.offboardedAt))),
      db
        .select({ memberId: onboardingAssignment.memberId })
        .from(onboardingAssignment)
        .where(eq(onboardingAssignment.trackId, t.id)),
    ]);
    const valid = new Set(members.map((m) => m.id));
    const already = new Set(existing.map((e) => e.memberId));
    const toAdd = [...new Set(input.memberIds)].filter((id) => valid.has(id) && !already.has(id));
    if (toAdd.length > 0) {
      await db
        .insert(onboardingAssignment)
        .values(toAdd.map((memberId) => ({ memberId, trackId: t.id })));
    }
    revalidateOnboarding();
    return {
      data: { assigned: toAdd.length },
      ...(toAdd.length > 0
        ? {
            activity: {
              verb: "onboarding_track.assigned",
              entityType: "onboarding_track",
              entityId: t.id,
              entityLabel: t.name,
              summary: `${ctx.member.displayName} assigned “${t.name}” to ${toAdd.length} member${toAdd.length === 1 ? "" : "s"}`,
            },
          }
        : {}),
    };
  },
});

/** Take a member off a track. Their check marks for it go with the assignment. */
export const unassignOnboardingTrack = authedAction({
  minRole: "admin",
  input: z.object({ assignmentId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select({
        id: onboardingAssignment.id,
        memberId: onboardingAssignment.memberId,
        orgId: member.orgId,
        memberName: member.displayName,
      })
      .from(onboardingAssignment)
      .innerJoin(member, eq(onboardingAssignment.memberId, member.id))
      .where(eq(onboardingAssignment.id, input.assignmentId))
      .limit(1);
    if (!row || row.orgId !== ctx.org.id) throw new ActionError("Assignment not found");
    const [done] = await db
      .select({ n: count() })
      .from(onboardingCompletion)
      .where(eq(onboardingCompletion.assignmentId, row.id));
    await db.delete(onboardingAssignment).where(eq(onboardingAssignment.id, row.id));
    revalidateOnboarding();
    revalidatePath(`/members/${row.memberId}`);
    return {
      data: { removedChecks: done?.n ?? 0 },
      activity: {
        verb: "onboarding_track.unassigned",
        entityType: "member",
        entityId: row.memberId,
        entityLabel: row.memberName,
        summary: `${ctx.member.displayName} took ${row.memberName} off an onboarding track`,
      },
    };
  },
});
