"use server";

import { z } from "zod";
import { and, eq, asc, isNull, count, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  meeting,
  agendaItem,
  attendance,
  actionItem,
  member,
  voteRound,
  MEETING_KINDS,
  AGENDA_ITEM_KINDS,
  ATTENDANCE_STATUSES,
} from "@/db/schema";
import { emailLayout, escapeHtml, notifyMany, sendEmailSafe, appUrl } from "@/lib/notify";
import { withRef } from "@/lib/refs-server";
import { authedAction, ActionError } from "./safe-action";
import { format } from "date-fns";

async function loadMeeting(orgId: string, meetingId: string) {
  const [m] = await db
    .select()
    .from(meeting)
    .where(and(eq(meeting.id, meetingId), eq(meeting.orgId, orgId)))
    .limit(1);
  if (!m) throw new ActionError("Meeting not found");
  return m;
}

export const createMeeting = authedAction({
  minRole: "analyst",
  input: z.object({
    title: z.string().min(1).max(200),
    kind: z.enum(MEETING_KINDS).default("general"),
    scheduledAt: z.coerce.date(),
    durationMinutes: z.coerce.number().int().min(5).max(480).default(60),
    location: z.string().max(200).optional(),
  }),
  handler: async (input, ctx) => {
    const row = await withRef(meeting, meeting.orgId, meeting.ref, ctx.org.id, async (ref) => {
      const [inserted] = await db
        .insert(meeting)
        .values({
          orgId: ctx.org.id,
          ref,
          title: input.title,
          kind: input.kind,
          scheduledAt: input.scheduledAt,
          durationMinutes: input.durationMinutes,
          location: input.location,
          createdByMemberId: ctx.member.id,
        })
        .returning();
      return inserted;
    });
    revalidatePath("/meetings");
    return {
      data: { meetingId: row.id },
      activity: {
        verb: "meeting.created",
        entityType: "meeting",
        entityId: row.id,
        entityLabel: input.title,
        summary: `${ctx.member.displayName} scheduled “${input.title}” for ${format(input.scheduledAt, "MMM d")}`,
      },
    };
  },
});

export const addAgendaItem = authedAction({
  minRole: "analyst",
  input: z.object({
    meetingId: z.string().uuid(),
    title: z.string().min(1).max(300),
    kind: z.enum(AGENDA_ITEM_KINDS).default("other"),
    applicationId: z.string().uuid().optional(),
    voteRoundId: z.string().uuid().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(240).optional(),
    presenterMemberId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    const existing = await db
      .select({ position: agendaItem.position })
      .from(agendaItem)
      .where(eq(agendaItem.meetingId, m.id))
      .orderBy(asc(agendaItem.position));
    const nextPos = existing.length > 0 ? Number(existing[existing.length - 1].position) + 1 : 1;

    const [row] = await db
      .insert(agendaItem)
      .values({
        meetingId: m.id,
        title: input.title,
        kind: input.kind,
        applicationId: input.applicationId,
        voteRoundId: input.voteRoundId,
        durationMinutes: input.durationMinutes,
        presenterMemberId: input.presenterMemberId,
        position: String(nextPos),
      })
      .returning();

    // Backfill the reverse link so the vote knows which meeting it ran in.
    if (input.voteRoundId) {
      await db
        .update(voteRound)
        .set({ meetingId: m.id })
        .where(
          and(
            eq(voteRound.id, input.voteRoundId),
            eq(voteRound.orgId, ctx.org.id),
            isNull(voteRound.meetingId)
          )
        );
    }

    revalidatePath(`/meetings/${m.id}`);
    return { data: { agendaItemId: row.id } };
  },
});

export const removeAgendaItem = authedAction({
  minRole: "analyst",
  input: z.object({ agendaItemId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [item] = await db
      .select({ id: agendaItem.id, meetingId: agendaItem.meetingId, orgId: meeting.orgId })
      .from(agendaItem)
      .innerJoin(meeting, eq(agendaItem.meetingId, meeting.id))
      .where(eq(agendaItem.id, input.agendaItemId))
      .limit(1);
    if (!item || item.orgId !== ctx.org.id) throw new ActionError("Agenda item not found");
    await db.delete(agendaItem).where(eq(agendaItem.id, item.id));
    revalidatePath(`/meetings/${item.meetingId}`);
    return { data: { ok: true } };
  },
});

export const setAttendance = authedAction({
  minRole: "analyst",
  input: z.object({
    meetingId: z.string().uuid(),
    memberId: z.string().uuid(),
    status: z.enum(ATTENDANCE_STATUSES),
  }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    const [attendee] = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.id, input.memberId), eq(member.orgId, ctx.org.id)))
      .limit(1);
    if (!attendee) throw new ActionError("Member not found");
    await db
      .insert(attendance)
      .values({
        meetingId: m.id,
        memberId: input.memberId,
        status: input.status,
        recordedByMemberId: ctx.member.id,
      })
      .onConflictDoUpdate({
        target: [attendance.meetingId, attendance.memberId],
        set: { status: input.status, recordedByMemberId: ctx.member.id, recordedAt: new Date() },
      });
    revalidatePath(`/meetings/${m.id}`);
    return { data: { ok: true } };
  },
});

export const createActionItem = authedAction({
  minRole: "analyst",
  input: z.object({
    title: z.string().min(1).max(300),
    meetingId: z.string().uuid().optional(),
    agendaItemId: z.string().uuid().optional(),
    applicationId: z.string().uuid().optional(),
    assigneeMemberId: z.string().uuid().optional(),
    dueAt: z.coerce.date().optional(),
  }),
  handler: async (input, ctx) => {
    const row = await withRef(
      actionItem,
      actionItem.orgId,
      actionItem.ref,
      ctx.org.id,
      async (ref) => {
        const [inserted] = await db
          .insert(actionItem)
          .values({
            orgId: ctx.org.id,
            ref,
            title: input.title,
            meetingId: input.meetingId,
            agendaItemId: input.agendaItemId,
            applicationId: input.applicationId,
            assigneeMemberId: input.assigneeMemberId ?? ctx.member.id,
            createdByMemberId: ctx.member.id,
            dueAt: input.dueAt,
          })
          .returning();
        return inserted;
      }
    );
    if (input.meetingId) revalidatePath(`/meetings/${input.meetingId}`);
    revalidatePath("/inbox");
    return { data: { actionItemId: row.id } };
  },
});

export const toggleActionItem = authedAction({
  minRole: "analyst",
  input: z.object({ actionItemId: z.string().uuid(), done: z.boolean() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select()
      .from(actionItem)
      .where(and(eq(actionItem.id, input.actionItemId), eq(actionItem.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new ActionError("Action item not found");
    await db
      .update(actionItem)
      .set({
        status: input.done ? "done" : "open",
        completedAt: input.done ? new Date() : null,
      })
      .where(eq(actionItem.id, row.id));
    if (row.meetingId) revalidatePath(`/meetings/${row.meetingId}`);
    revalidatePath("/inbox");
    revalidatePath("/my-work");
    return { data: { ok: true } };
  },
});

export const startMeeting = authedAction({
  minRole: "analyst",
  input: z.object({ meetingId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    if (m.status !== "scheduled") throw new ActionError(`Meeting is ${m.status}`);
    await db.update(meeting).set({ status: "in_progress" }).where(eq(meeting.id, m.id));
    revalidatePath(`/meetings/${m.id}`);
    return {
      data: { ok: true },
      activity: {
        verb: "meeting.started",
        entityType: "meeting",
        entityId: m.id,
        entityLabel: m.title,
        summary: `${ctx.member.displayName} started “${m.title}”`,
      },
    };
  },
});

export const setAgendaItemStatus = authedAction({
  minRole: "analyst",
  input: z.object({
    agendaItemId: z.string().uuid(),
    status: z.enum(["pending", "in_progress", "done", "deferred"]),
    notes: z.string().max(10_000).optional(),
  }),
  handler: async (input, ctx) => {
    const [item] = await db
      .select({ id: agendaItem.id, meetingId: agendaItem.meetingId, orgId: meeting.orgId, startedAt: agendaItem.startedAt })
      .from(agendaItem)
      .innerJoin(meeting, eq(agendaItem.meetingId, meeting.id))
      .where(eq(agendaItem.id, input.agendaItemId))
      .limit(1);
    if (!item || item.orgId !== ctx.org.id) throw new ActionError("Agenda item not found");
    const now = new Date();
    await db
      .update(agendaItem)
      .set({
        status: input.status,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status === "in_progress" && !item.startedAt ? { startedAt: now } : {}),
        ...(input.status === "done" || input.status === "deferred" ? { endedAt: now } : {}),
      })
      .where(eq(agendaItem.id, item.id));
    revalidatePath(`/meetings/${item.meetingId}`);
    return { data: { ok: true } };
  },
});

export const endMeeting = authedAction({
  minRole: "analyst",
  input: z.object({ meetingId: z.string().uuid(), sendRecap: z.boolean().default(true) }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    await db.update(meeting).set({ status: "completed" }).where(eq(meeting.id, m.id));

    if (input.sendRecap && !m.recapSentAt) {
      const [items, actions, attendanceRows, activeMembers] = await Promise.all([
        db
          .select()
          .from(agendaItem)
          .where(eq(agendaItem.meetingId, m.id))
          .orderBy(asc(agendaItem.position)),
        db
          .select({
            title: actionItem.title,
            dueAt: actionItem.dueAt,
            assigneeName: member.displayName,
          })
          .from(actionItem)
          .leftJoin(member, eq(actionItem.assigneeMemberId, member.id))
          .where(and(eq(actionItem.meetingId, m.id), eq(actionItem.status, "open"))),
        db.select().from(attendance).where(eq(attendance.meetingId, m.id)),
        db
          .select({ email: member.email })
          .from(member)
          .where(and(eq(member.orgId, ctx.org.id), eq(member.status, "active"))),
      ]);
      const present = attendanceRows.filter((a) =>
        ["present", "remote", "late"].includes(a.status)
      ).length;

      const list = (rows: string[]) =>
        `<ul style="color:#3f3f46;font-size:14px;line-height:1.5;padding-left:18px;margin:0 0 14px">${rows.join("")}</ul>`;
      const h = (text: string) =>
        `<h2 style="font-size:13px;margin:18px 0 6px;color:#18181b">${text}</h2>`;
      const html = emailLayout({
        orgName: ctx.org.name,
        heading: `${m.title} — recap`,
        bodyHtml: [
          `<p style="margin:0 0 14px;font-size:13px;color:#71717a">${escapeHtml(format(m.scheduledAt, "EEEE, MMM d"))} · ${present} of ${attendanceRows.length || "?"} attended</p>`,
          items.length
            ? h("Agenda") +
              list(
                items.map(
                  (i) =>
                    `<li style="margin:4px 0">${escapeHtml(i.title)} <span style="color:#a1a1aa">— ${escapeHtml(i.status.replace("_", " "))}</span>${
                      i.notes
                        ? `<br><span style="color:#71717a;font-size:13px">${escapeHtml(i.notes).replace(/\n/g, "<br>")}</span>`
                        : ""
                    }</li>`
                )
              )
            : "",
          actions.length
            ? h("Action items") +
              list(
                actions.map(
                  (a) =>
                    `<li style="margin:4px 0">${escapeHtml(a.title)} — <strong>${escapeHtml(a.assigneeName ?? "unassigned")}</strong>${
                      a.dueAt ? ` (due ${escapeHtml(format(a.dueAt, "MMM d"))})` : ""
                    }</li>`
                )
              )
            : "",
        ].join(""),
        cta: { label: "Open the meeting", url: appUrl(`/meetings/${m.id}`) },
        footer: `You are getting this because you are an active member of ${ctx.org.name}.`,
      });

      after(() =>
        notifyMany(
          activeMembers.map(
            (mm) => () => sendEmailSafe({ to: mm.email, subject: `Recap: ${m.title}`, html })
          )
        )
      );
      await db.update(meeting).set({ recapSentAt: new Date() }).where(eq(meeting.id, m.id));
    }

    revalidatePath(`/meetings/${m.id}`);
    revalidatePath("/meetings");
    return {
      data: { ok: true },
      activity: {
        verb: "meeting.completed",
        entityType: "meeting",
        entityId: m.id,
        entityLabel: m.title,
        summary: `“${m.title}” wrapped${input.sendRecap ? " — recap sent" : ""}`,
      },
    };
  },
});

const EDITABLE_MEETING = ["scheduled", "in_progress"] as const;

export const updateMeeting = authedAction({
  minRole: "analyst",
  input: z.object({
    meetingId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    kind: z.enum(MEETING_KINDS),
    scheduledAt: z.coerce.date(),
    durationMinutes: z.coerce.number().int().min(5).max(480),
    location: z.string().trim().max(200).nullable(),
    videoUrl: z.string().trim().url().max(500).nullable().or(z.literal("").transform(() => null)),
  }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (m.title !== input.title) diff.title = { from: m.title, to: input.title };
    if (m.kind !== input.kind) diff.kind = { from: m.kind, to: input.kind };
    if (m.scheduledAt.getTime() !== input.scheduledAt.getTime())
      diff.scheduledAt = { from: m.scheduledAt.toISOString(), to: input.scheduledAt.toISOString() };
    if (m.durationMinutes !== input.durationMinutes)
      diff.durationMinutes = { from: m.durationMinutes, to: input.durationMinutes };
    if ((m.location ?? null) !== (input.location || null))
      diff.location = { from: m.location, to: input.location || null };

    await db
      .update(meeting)
      .set({
        title: input.title,
        kind: input.kind,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        location: input.location || null,
        videoUrl: input.videoUrl,
      })
      .where(eq(meeting.id, m.id));
    revalidatePath(`/meetings/${m.id}`);
    revalidatePath("/meetings");
    return {
      data: { ok: true },
      activity: {
        verb: "meeting.updated",
        entityType: "meeting",
        entityId: m.id,
        entityLabel: input.title,
        summary: `${ctx.member.displayName} edited “${input.title}”`,
        diff,
      },
    };
  },
});

/** Cancel keeps the record (and its agenda); restore puts it back on the calendar. */
export const setMeetingCancelled = authedAction({
  minRole: "analyst",
  input: z.object({ meetingId: z.string().uuid(), cancelled: z.boolean() }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    if (input.cancelled && m.status === "completed") {
      throw new ActionError("This meeting already happened — it can't be cancelled");
    }
    if (!input.cancelled && m.status !== "cancelled") throw new ActionError("Meeting isn't cancelled");
    await db
      .update(meeting)
      .set({ status: input.cancelled ? "cancelled" : "scheduled" })
      .where(eq(meeting.id, m.id));
    revalidatePath(`/meetings/${m.id}`);
    revalidatePath("/meetings");
    return {
      data: { ok: true },
      activity: {
        verb: input.cancelled ? "meeting.cancelled" : "meeting.restored",
        entityType: "meeting",
        entityId: m.id,
        entityLabel: m.title,
        summary: `${ctx.member.displayName} ${input.cancelled ? "cancelled" : "restored"} “${m.title}”`,
      },
    };
  },
});

/**
 * Hard delete is for mistakes only. A meeting that has attendance or a recap
 * is part of the club's record (attendance minimums are computed from it), so
 * those can be cancelled but not deleted.
 */
export const deleteMeeting = authedAction({
  minRole: "analyst",
  input: z.object({ meetingId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    if (m.status === "completed" || m.status === "in_progress") {
      throw new ActionError("This meeting has been run — it stays in the record. Cancel it instead.");
    }
    const [[att], [votes]] = await Promise.all([
      db.select({ n: count() }).from(attendance).where(eq(attendance.meetingId, m.id)),
      db
        .select({ n: count() })
        .from(voteRound)
        .where(and(eq(voteRound.orgId, ctx.org.id), eq(voteRound.meetingId, m.id))),
    ]);
    if ((att?.n ?? 0) > 0) {
      throw new ActionError(
        "Attendance has been recorded for this meeting, and attendance history counts toward members' records. Cancel it instead."
      );
    }
    if ((votes?.n ?? 0) > 0) {
      throw new ActionError("A vote is linked to this meeting. Cancel it instead.");
    }
    // Agenda rows cascade; action items keep existing with the link cleared.
    await db.delete(meeting).where(eq(meeting.id, m.id));
    revalidatePath("/meetings");
    return {
      data: { ok: true },
      activity: {
        verb: "meeting.deleted",
        entityType: "meeting",
        entityId: m.id,
        entityLabel: m.title,
        summary: `${ctx.member.displayName} deleted “${m.title}”`,
      },
    };
  },
});

async function loadAgendaItem(orgId: string, agendaItemId: string) {
  const [row] = await db
    .select({ item: agendaItem, orgId: meeting.orgId, meetingStatus: meeting.status })
    .from(agendaItem)
    .innerJoin(meeting, eq(agendaItem.meetingId, meeting.id))
    .where(eq(agendaItem.id, agendaItemId))
    .limit(1);
  if (!row || row.orgId !== orgId) throw new ActionError("Agenda item not found");
  return row;
}

export const updateAgendaItem = authedAction({
  minRole: "analyst",
  input: z.object({
    agendaItemId: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    kind: z.enum(AGENDA_ITEM_KINDS),
    durationMinutes: z.coerce.number().int().min(1).max(240).nullable(),
    presenterMemberId: z.string().uuid().nullable(),
    notes: z.string().max(10_000).nullable(),
  }),
  handler: async (input, ctx) => {
    const { item } = await loadAgendaItem(ctx.org.id, input.agendaItemId);
    if (input.presenterMemberId) {
      const [presenter] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.id, input.presenterMemberId), eq(member.orgId, ctx.org.id)))
        .limit(1);
      if (!presenter) throw new ActionError("Presenter not found");
    }
    await db
      .update(agendaItem)
      .set({
        title: input.title,
        kind: input.kind,
        durationMinutes: input.durationMinutes,
        presenterMemberId: input.presenterMemberId,
        notes: input.notes || null,
      })
      .where(eq(agendaItem.id, item.id));
    revalidatePath(`/meetings/${item.meetingId}`);
    return { data: { ok: true } };
  },
});

/** Swap with the neighbour above or below. */
export const moveAgendaItem = authedAction({
  minRole: "analyst",
  input: z.object({ agendaItemId: z.string().uuid(), direction: z.enum(["up", "down"]) }),
  handler: async (input, ctx) => {
    const { item, meetingStatus } = await loadAgendaItem(ctx.org.id, input.agendaItemId);
    if (!EDITABLE_MEETING.includes(meetingStatus as (typeof EDITABLE_MEETING)[number])) {
      throw new ActionError("This meeting is closed");
    }
    const siblings = await db
      .select({ id: agendaItem.id, position: agendaItem.position })
      .from(agendaItem)
      .where(eq(agendaItem.meetingId, item.meetingId))
      .orderBy(asc(agendaItem.position));
    const i = siblings.findIndex((s) => s.id === item.id);
    const j = input.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= siblings.length) return { data: { ok: true } };
    // Renumber the whole list so legacy duplicate positions can't block a swap.
    const order = siblings.map((s) => s.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [idx, id] of order.entries()) {
      await db.update(agendaItem).set({ position: String(idx + 1) }).where(eq(agendaItem.id, id));
    }
    revalidatePath(`/meetings/${item.meetingId}`);
    return { data: { ok: true } };
  },
});

async function loadActionItem(orgId: string, actionItemId: string) {
  const [row] = await db
    .select()
    .from(actionItem)
    .where(and(eq(actionItem.id, actionItemId), eq(actionItem.orgId, orgId)))
    .limit(1);
  if (!row) throw new ActionError("Action item not found");
  return row;
}

function revalidateActionItem(row: { meetingId: string | null }) {
  if (row.meetingId) revalidatePath(`/meetings/${row.meetingId}`);
  revalidatePath("/inbox");
  revalidatePath("/my-work");
}

export const updateActionItem = authedAction({
  minRole: "analyst",
  input: z.object({
    actionItemId: z.string().uuid(),
    title: z.string().trim().min(1).max(300),
    assigneeMemberId: z.string().uuid().nullable(),
    dueAt: z.coerce.date().nullable(),
  }),
  handler: async (input, ctx) => {
    const row = await loadActionItem(ctx.org.id, input.actionItemId);
    if (input.assigneeMemberId) {
      const [assignee] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.id, input.assigneeMemberId), eq(member.orgId, ctx.org.id)))
        .limit(1);
      if (!assignee) throw new ActionError("Assignee not found");
    }
    await db
      .update(actionItem)
      .set({
        title: input.title,
        assigneeMemberId: input.assigneeMemberId,
        dueAt: input.dueAt,
      })
      .where(eq(actionItem.id, row.id));
    revalidateActionItem(row);
    return { data: { ok: true } };
  },
});

/** Soft delete: the row stays (status cancelled) so refs like TSK-84 never dangle. */
export const cancelActionItem = authedAction({
  minRole: "analyst",
  input: z.object({ actionItemId: z.string().uuid(), cancelled: z.boolean().default(true) }),
  handler: async (input, ctx) => {
    const row = await loadActionItem(ctx.org.id, input.actionItemId);
    await db
      .update(actionItem)
      .set({ status: input.cancelled ? "cancelled" : "open", completedAt: null })
      .where(eq(actionItem.id, row.id));
    revalidateActionItem(row);
    return { data: { ok: true } };
  },
});

/** Notes only — unlike setAgendaItemStatus this never touches status or timestamps. */
export const saveAgendaNotes = authedAction({
  minRole: "analyst",
  input: z.object({ agendaItemId: z.string().uuid(), notes: z.string().max(10_000) }),
  handler: async (input, ctx) => {
    const { item } = await loadAgendaItem(ctx.org.id, input.agendaItemId);
    await db
      .update(agendaItem)
      .set({ notes: input.notes.trim() || null })
      .where(eq(agendaItem.id, item.id));
    revalidatePath(`/meetings/${item.meetingId}`);
    return { data: { ok: true } };
  },
});

/** "Mark the rest present": one round trip instead of one per member. */
export const setAttendanceBulk = authedAction({
  minRole: "analyst",
  input: z.object({
    meetingId: z.string().uuid(),
    memberIds: z.array(z.string().uuid()).min(1).max(200),
    status: z.enum(ATTENDANCE_STATUSES),
  }),
  handler: async (input, ctx) => {
    const m = await loadMeeting(ctx.org.id, input.meetingId);
    const valid = await db
      .select({ id: member.id })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), inArray(member.id, input.memberIds)));
    if (valid.length === 0) return { data: { marked: 0 } };
    const now = new Date();
    await db
      .insert(attendance)
      .values(
        valid.map((v) => ({
          meetingId: m.id,
          memberId: v.id,
          status: input.status,
          recordedByMemberId: ctx.member.id,
        }))
      )
      .onConflictDoUpdate({
        target: [attendance.meetingId, attendance.memberId],
        set: { status: input.status, recordedByMemberId: ctx.member.id, recordedAt: now },
      });
    revalidatePath(`/meetings/${m.id}`);
    return { data: { marked: valid.length } };
  },
});
