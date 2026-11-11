"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  doc,
  member,
  notificationLog,
  onboardingTrack,
  onboardingTask,
  onboardingAssignment,
  onboardingCompletion,
  ONBOARDING_TASK_KINDS,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { requireCtx } from "./context";
import { fetchSiteMeta } from "@/lib/enrichment/fetch-meta";
import { sendEmailSafe } from "@/lib/notify";
import { nudgeEmail } from "@/lib/onboarding/emails";
import { getJourney, NUDGE_KIND, WAIVED_VERB } from "@/lib/onboarding/load";
import { DEFAULT_DUE_DAYS, dueDateFrom } from "@/lib/onboarding/progress";
import { detectKind, safeHttpUrl, videoEmbed } from "@/lib/onboarding/resource";
import { syncOnboarding } from "@/lib/onboarding/sync";

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

/** Re-derive completion for everyone on a track after its tasks change. */
async function recomputeTrackCompletion(orgId: string, trackId: string) {
  const assignments = await db
    .select({ memberId: onboardingAssignment.memberId })
    .from(onboardingAssignment)
    .where(eq(onboardingAssignment.trackId, trackId));
  for (const memberId of new Set(assignments.map((a) => a.memberId))) {
    await syncOnboarding(orgId, memberId);
  }
}

/**
 * The tracks an invite can enrol on, for the invite dialog. A read, so it is
 * not an authedAction, but it is still a public endpoint: admin-only.
 */
export async function loadInviteTracks() {
  const ctx = await requireCtx("admin");
  const tracks = await db
    .select({ id: onboardingTrack.id, name: onboardingTrack.name, isDefault: onboardingTrack.isDefault })
    .from(onboardingTrack)
    .where(and(eq(onboardingTrack.orgId, ctx.org.id), isNull(onboardingTrack.archivedAt)))
    .orderBy(desc(onboardingTrack.isDefault), asc(onboardingTrack.name));
  if (tracks.length === 0) return [];
  const tasks = await db
    .select({
      trackId: onboardingTask.trackId,
      required: onboardingTask.required,
      minutes: onboardingTask.estimatedMinutes,
    })
    .from(onboardingTask)
    .where(
      inArray(
        onboardingTask.trackId,
        tracks.map((t) => t.id)
      )
    );
  return tracks.map((t) => {
    const required = tasks.filter((k) => k.trackId === t.id && k.required);
    return {
      ...t,
      requiredCount: required.length,
      minutes: required.reduce((n, k) => n + (k.minutes ?? 0), 0),
    };
  });
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
  /** Instructions for a task; the policy text for an acknowledgement. */
  description: z
    .string()
    .trim()
    .max(4000)
    .nullable()
    .transform((v) => v || null),
  resourceUrl: z.string().trim().url().max(500).nullable().or(z.literal("").transform(() => null)),
  /** One of the club's docs, read inside the flow instead of a link. */
  docId: z.string().uuid().nullable(),
  required: z.boolean(),
  estimatedMinutes: z.number().int().min(1).max(600).nullable(),
};

type TaskFields = {
  title: string;
  kind: (typeof ONBOARDING_TASK_KINDS)[number];
  description: string | null;
  resourceUrl: string | null;
  docId: string | null;
  required: boolean;
  estimatedMinutes: number | null;
};

async function checkedTaskFields(orgId: string, input: TaskFields): Promise<TaskFields> {
  if (input.resourceUrl && !safeHttpUrl(input.resourceUrl)) {
    throw new ActionError("The link needs to start with https://");
  }
  if (input.kind === "submit" && !input.description) {
    throw new ActionError("Write the text the member is agreeing to");
  }
  if (input.docId) {
    // Every new member must be able to open it, whatever their role.
    const [d] = await db
      .select({ visibility: doc.visibility })
      .from(doc)
      .where(and(eq(doc.id, input.docId), eq(doc.orgId, orgId), isNull(doc.archivedAt)))
      .limit(1);
    if (!d) throw new ActionError("That doc no longer exists");
    if (d.visibility !== "all") throw new ActionError("Pick a doc that every member can open");
  }
  const { title, kind, description, resourceUrl, docId, required, estimatedMinutes } = input;
  return { title, kind, description, resourceUrl: docId ? null : resourceUrl, docId, required, estimatedMinutes };
}

export const addOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ trackId: z.string().uuid(), ...taskFields }),
  handler: async (input, ctx) => {
    const t = await loadTrack(ctx.org.id, input.trackId);
    const fields = await checkedTaskFields(ctx.org.id, input);
    const [last] = await db
      .select({ position: onboardingTask.position })
      .from(onboardingTask)
      .where(eq(onboardingTask.trackId, t.id))
      .orderBy(desc(onboardingTask.position))
      .limit(1);
    const [row] = await db
      .insert(onboardingTask)
      .values({ trackId: t.id, ...fields, position: (last?.position ?? 0) + 1 })
      .returning();
    // A new required task re-opens assignments that were complete.
    if (input.required) await recomputeTrackCompletion(ctx.org.id, t.id);
    revalidateOnboarding();
    return { data: { taskId: row.id } };
  },
});

export const updateOnboardingTask = authedAction({
  minRole: "admin",
  input: z.object({ taskId: z.string().uuid(), ...taskFields }),
  handler: async (input, ctx) => {
    const task = await loadTask(ctx.org.id, input.taskId);
    const fields = await checkedTaskFields(ctx.org.id, input);
    await db.update(onboardingTask).set(fields).where(eq(onboardingTask.id, task.id));
    if (task.required !== input.required) await recomputeTrackCompletion(ctx.org.id, task.trackId);
    revalidateOnboarding();
    return { data: { ok: true } };
  },
});

/**
 * Paste-a-link helper for the track editor: says whether the link is a video
 * we can play or an article, and suggests a title. Video titles come from the
 * provider's fixed oEmbed endpoint; article titles from the same guarded
 * fetch the company enrichment uses (public hosts only, capped, timed out).
 * A failed lookup is not an error — the admin just types the title.
 */
export const suggestOnboardingResource = authedAction({
  minRole: "admin",
  input: z.object({ url: z.string().trim().url().max(500) }),
  handler: async (input) => {
    const detected = detectKind(input.url);
    if (!detected) throw new ActionError("The link needs to start with https://");
    let title: string | null = null;
    try {
      if (detected.kind === "watch") {
        const endpoint = {
          YouTube: "https://www.youtube.com/oembed?format=json&url=",
          Vimeo: "https://vimeo.com/api/oembed.json?url=",
          Loom: "https://www.loom.com/v1/oembed?url=",
        }[videoEmbed(input.url)!.provider];
        const res = await fetch(endpoint + encodeURIComponent(input.url), {
          signal: AbortSignal.timeout(5000),
          redirect: "error",
        });
        if (res.ok) {
          const body: unknown = await res.json();
          const t = (body as { title?: unknown } | null)?.title;
          if (typeof t === "string") title = t;
        }
      } else {
        title = (await fetchSiteMeta(input.url)).meta.title;
      }
    } catch {
      title = null;
    }
    return { data: { ...detected, title: title?.trim().slice(0, 160) || null } };
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
    await recomputeTrackCompletion(ctx.org.id, task.trackId);
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
  input: z.object({
    trackId: z.string().uuid(),
    memberIds: z.array(z.string().uuid()).min(1).max(100),
    /** Omit for the default; null for no due date. */
    dueInDays: z.number().int().min(1).max(180).nullable().optional(),
  }),
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
        .values(
          toAdd.map((memberId) => ({
            memberId,
            trackId: t.id,
            dueAt: dueDateFrom(new Date(), input.dueInDays === undefined ? DEFAULT_DUE_DAYS : input.dueInDays),
          }))
        );
      for (const memberId of toAdd) await syncOnboarding(ctx.org.id, memberId);
    }
    revalidateOnboarding();
    return {
      data: { assigned: toAdd.length },
      ...(toAdd.length > 0
        ? {
            activity: {
              verb: "onboarding.enrolled",
              entityType: "onboarding_track",
              entityId: t.id,
              entityLabel: t.name,
              summary: `${ctx.member.displayName} enrolled ${toAdd.length} member${toAdd.length === 1 ? "" : "s"} on “${t.name}”`,
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

// ——— One member's progress, from the admin board ———

async function loadItemFor(orgId: string, assignmentId: string, taskId: string) {
  const [row] = await db
    .select({
      assignmentId: onboardingAssignment.id,
      memberId: member.id,
      memberName: member.displayName,
      taskId: onboardingTask.id,
      taskTitle: onboardingTask.title,
    })
    .from(onboardingAssignment)
    .innerJoin(member, eq(onboardingAssignment.memberId, member.id))
    .innerJoin(onboardingTask, eq(onboardingTask.trackId, onboardingAssignment.trackId))
    .where(
      and(
        eq(onboardingAssignment.id, assignmentId),
        eq(onboardingTask.id, taskId),
        eq(member.orgId, orgId)
      )
    )
    .limit(1);
  if (!row) throw new ActionError("That item isn't on this member's track");
  return row;
}

const itemRef = z.object({ assignmentId: z.string().uuid(), taskId: z.string().uuid() });

/** Confirm a tick the member made themselves, e.g. after seeing them at the coffee chat. */
export const verifyOnboardingItem = authedAction({
  minRole: "admin",
  input: itemRef,
  handler: async (input, ctx) => {
    const item = await loadItemFor(ctx.org.id, input.assignmentId, input.taskId);
    const updated = await db
      .update(onboardingCompletion)
      .set({ verifiedByMemberId: ctx.member.id })
      .where(
        and(
          eq(onboardingCompletion.assignmentId, item.assignmentId),
          eq(onboardingCompletion.taskId, item.taskId)
        )
      )
      .returning({ id: onboardingCompletion.id });
    if (updated.length === 0) throw new ActionError(`${item.memberName} hasn't marked that done yet`);
    revalidateOnboarding();
    return {
      data: { ok: true },
      activity: {
        verb: "onboarding.item_verified",
        entityType: "member",
        entityId: item.memberId,
        entityLabel: item.memberName,
        summary: `${ctx.member.displayName} verified “${item.taskTitle}” for ${item.memberName}`,
      },
    };
  },
});

/** Excuse a member from one item. It counts as done and is shown as waived. */
export const waiveOnboardingItem = authedAction({
  minRole: "admin",
  input: itemRef,
  handler: async (input, ctx) => {
    const item = await loadItemFor(ctx.org.id, input.assignmentId, input.taskId);
    const inserted = await db
      .insert(onboardingCompletion)
      .values({ assignmentId: item.assignmentId, taskId: item.taskId, verifiedByMemberId: ctx.member.id })
      .onConflictDoNothing()
      .returning({ id: onboardingCompletion.id });
    if (inserted.length === 0) throw new ActionError("That item is already done");
    await syncOnboarding(ctx.org.id, item.memberId);
    revalidateOnboarding();
    revalidatePath(`/members/${item.memberId}`);
    return {
      data: { ok: true },
      activity: {
        verb: WAIVED_VERB,
        entityType: "member",
        entityId: item.memberId,
        entityLabel: item.memberName,
        summary: `${ctx.member.displayName} waived “${item.taskTitle}” for ${item.memberName}`,
        // Read back by the onboarding loader to tell a waiver from a verified tick.
        diff: { waived: { from: null, to: item.taskId } },
      },
    };
  },
});

export const setOnboardingDueDate = authedAction({
  minRole: "admin",
  input: z.object({
    memberId: z.string().uuid(),
    /** YYYY-MM-DD, or null to clear. */
    dueOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  }),
  handler: async (input, ctx) => {
    const journey = await getJourney(ctx.org.id, input.memberId);
    if (!journey || journey.assignments.length === 0) throw new ActionError("This member isn't on a track");
    // Midday UTC: the same calendar date in every timezone a club is likely to be in.
    const dueAt = input.dueOn ? new Date(`${input.dueOn}T12:00:00Z`) : null;
    await db
      .update(onboardingAssignment)
      .set({ dueAt })
      .where(
        inArray(
          onboardingAssignment.id,
          journey.assignments.map((a) => a.id)
        )
      );
    revalidateOnboarding();
    return { data: { ok: true } };
  },
});

/** A reminder email, sent now, from the admin. Counts toward the job's three-day gap. */
export const nudgeOnboarding = authedAction({
  minRole: "admin",
  input: z.object({ memberId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const journey = await getJourney(ctx.org.id, input.memberId);
    if (!journey) throw new ActionError("Member not found");
    if (journey.stage === "invited") {
      throw new ActionError(`${journey.member.displayName} hasn't signed in yet. Resend the invite instead.`);
    }
    if (journey.stage === "complete") throw new ActionError("Nothing left to nudge about");
    const sent = await sendEmailSafe(
      nudgeEmail({
        org: ctx.org,
        to: journey.member,
        kind: "manual",
        fromName: ctx.member.displayName,
        remaining: journey.summary.requiredTotal - journey.summary.requiredDone,
        nextTitle: journey.summary.next?.title ?? null,
        minutesLeft: journey.summary.minutesLeft,
        dueAt: journey.dueAt,
        locked: !journey.member.onboardedAt,
      })
    );
    if (!sent) throw new ActionError("The email couldn't be sent. Check Settings → Email.");
    await db
      .insert(notificationLog)
      .values({
        orgId: ctx.org.id,
        kind: NUDGE_KIND,
        key: `manual:${journey.member.id}:${Date.now()}`,
        recipient: journey.member.email,
        summary: `Nudged by ${ctx.member.displayName}`,
      })
      .onConflictDoNothing();
    revalidateOnboarding();
    return {
      data: { ok: true },
      activity: {
        verb: "onboarding.nudged",
        entityType: "member",
        entityId: journey.member.id,
        entityLabel: journey.member.displayName,
        summary: `${ctx.member.displayName} nudged ${journey.member.displayName} about onboarding`,
      },
    };
  },
});
