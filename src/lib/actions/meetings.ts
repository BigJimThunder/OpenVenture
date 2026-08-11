"use server";

import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  meeting,
  agendaItem,
  attendance,
  actionItem,
  member,
  MEETING_KINDS,
  AGENDA_ITEM_KINDS,
  ATTENDANCE_STATUSES,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { sendEmail } from "@/lib/email";
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
    const [row] = await db
      .insert(meeting)
      .values({
        orgId: ctx.org.id,
        title: input.title,
        kind: input.kind,
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        location: input.location,
        createdByMemberId: ctx.member.id,
      })
      .returning();
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
    const [row] = await db
      .insert(actionItem)
      .values({
        orgId: ctx.org.id,
        title: input.title,
        meetingId: input.meetingId,
        agendaItemId: input.agendaItemId,
        applicationId: input.applicationId,
        assigneeMemberId: input.assigneeMemberId ?? ctx.member.id,
        createdByMemberId: ctx.member.id,
        dueAt: input.dueAt,
      })
      .returning();
    if (input.meetingId) revalidatePath(`/meetings/${input.meetingId}`);
    revalidatePath("/");
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
    revalidatePath("/");
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

      const html = `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="font-size:16px;margin:0 0 4px">${m.title} — recap</h2>
        <p style="color:#777;font-size:12px;margin:0 0 16px">${format(m.scheduledAt, "EEEE, MMM d")} · ${present}/${attendanceRows.length || "?"} attended</p>
        <h3 style="font-size:13px;margin:16px 0 6px">Agenda</h3>
        <ul style="color:#444;font-size:13px;padding-left:18px;margin:0">
          ${items
            .map(
              (i) =>
                `<li style="margin:3px 0">${i.title} <span style="color:#999">— ${i.status}</span>${
                  i.notes ? `<br/><span style="color:#777;font-size:12px">${i.notes}</span>` : ""
                }</li>`
            )
            .join("")}
        </ul>
        ${
          actions.length
            ? `<h3 style="font-size:13px;margin:16px 0 6px">Action items</h3>
        <ul style="color:#444;font-size:13px;padding-left:18px;margin:0">
          ${actions
            .map(
              (a) =>
                `<li style="margin:3px 0">${a.title} — <strong>${a.assigneeName ?? "unassigned"}</strong>${
                  a.dueAt ? ` (due ${format(a.dueAt, "MMM d")})` : ""
                }</li>`
            )
            .join("")}
        </ul>`
            : ""
        }
      </div>`;

      void Promise.allSettled(
        activeMembers.map((mm) =>
          sendEmail({ to: mm.email, subject: `Recap: ${m.title}`, html }).catch(() => {})
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
