"use server";

import { z } from "zod";
import { and, eq, ne, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  member,
  onboardingTrack,
  onboardingAssignment,
  onboardingTask,
  onboardingCompletion,
  MEMBER_ROLES,
} from "@/db/schema";
import { authedAction } from "./safe-action";
import { sendEmail } from "@/lib/email";

export const inviteMember = authedAction({
  minRole: "admin",
  input: z.object({
    email: z.string().email(),
    displayName: z.string().min(1).max(120),
    role: z.enum(MEMBER_ROLES).default("analyst"),
    cohort: z.string().max(60).optional(),
    classYear: z.coerce.number().int().min(2000).max(2100).optional(),
  }),
  handler: async (input, ctx) => {
    const email = input.email.toLowerCase();

    // Domain restriction, if the org set one.
    const domains = ctx.org.allowedEmailDomains;
    if (domains.length > 0 && !domains.some((d) => email.endsWith(`@${d}`))) {
      throw new Error(`Email must be on ${domains.map((d) => `@${d}`).join(" or ")}`);
    }

    const [existing] = await db
      .select({ id: member.id, status: member.status })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), eq(member.email, email)))
      .limit(1);
    if (existing && existing.status !== "removed") {
      throw new Error("That email is already a member");
    }

    const [row] = await db
      .insert(member)
      .values({
        orgId: ctx.org.id,
        email,
        displayName: input.displayName,
        role: input.role,
        status: "invited",
        cohort: input.cohort,
        classYear: input.classYear,
      })
      .returning();

    // Auto-assign the default onboarding track.
    const [track] = await db
      .select({ id: onboardingTrack.id })
      .from(onboardingTrack)
      .where(
        and(
          eq(onboardingTrack.orgId, ctx.org.id),
          eq(onboardingTrack.isDefault, true),
          isNull(onboardingTrack.archivedAt)
        )
      )
      .limit(1);
    if (track) {
      await db.insert(onboardingAssignment).values({ memberId: row.id, trackId: track.id });
    }

    // getCtx links this member row by email on first sign-in — the invite
    // email only needs to point them at the login page.
    const base = process.env.BETTER_AUTH_URL ?? "";
    void sendEmail({
      to: email,
      subject: `You've been invited to ${ctx.org.name}`,
      html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <h2 style="font-size:16px;margin:0 0 8px">Welcome to ${ctx.org.name}</h2>
        <p style="color:#555;font-size:14px">${ctx.member.displayName} added you as ${input.role.replace("_", " ")}. Sign in with this email address — no password needed.</p>
        <p style="margin:16px 0"><a href="${base}/login" style="background:#4f46e5;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:14px">Sign in</a></p>
      </div>`,
    }).catch(() => {});

    revalidatePath("/members");
    return {
      data: { memberId: row.id },
      activity: {
        verb: "member.invited",
        entityType: "member",
        entityId: row.id,
        entityLabel: input.displayName,
        summary: `${ctx.member.displayName} invited ${input.displayName} as ${input.role.replace("_", " ")}`,
      },
    };
  },
});

export const updateMemberRole = authedAction({
  minRole: "admin",
  input: z.object({
    memberId: z.string().uuid(),
    role: z.enum(MEMBER_ROLES),
  }),
  handler: async (input, ctx) => {
    const [target] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, input.memberId), eq(member.orgId, ctx.org.id)))
      .limit(1);
    if (!target) throw new Error("Member not found");

    // Never demote the last admin — the lockout footgun.
    if (target.role === "admin" && input.role !== "admin") {
      const [admins] = await db
        .select({ n: count() })
        .from(member)
        .where(
          and(
            eq(member.orgId, ctx.org.id),
            eq(member.role, "admin"),
            eq(member.status, "active"),
            ne(member.id, target.id)
          )
        );
      if ((admins?.n ?? 0) === 0) throw new Error("Cannot demote the last admin");
    }

    await db
      .update(member)
      .set({ role: input.role, updatedAt: new Date() })
      .where(eq(member.id, target.id));
    revalidatePath("/members");
    revalidatePath(`/members/${target.id}`);
    return {
      data: { ok: true },
      activity: {
        verb: "member.role_changed",
        entityType: "member",
        entityId: target.id,
        entityLabel: target.displayName,
        summary: `${ctx.member.displayName} made ${target.displayName} ${input.role.replace("_", " ")}`,
        diff: { role: { from: target.role, to: input.role } },
      },
    };
  },
});

export const offboardMember = authedAction({
  minRole: "admin",
  input: z.object({ memberId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [target] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, input.memberId), eq(member.orgId, ctx.org.id)))
      .limit(1);
    if (!target) throw new Error("Member not found");
    if (target.id === ctx.member.id) throw new Error("You can't offboard yourself");
    if (target.role === "admin") {
      const [admins] = await db
        .select({ n: count() })
        .from(member)
        .where(
          and(
            eq(member.orgId, ctx.org.id),
            eq(member.role, "admin"),
            eq(member.status, "active"),
            ne(member.id, target.id)
          )
        );
      if ((admins?.n ?? 0) === 0) throw new Error("Cannot offboard the last admin");
    }

    // Alumni, not deletion — their memos, votes, and history stay attributed.
    await db
      .update(member)
      .set({ status: "alumni", offboardedAt: new Date(), updatedAt: new Date() })
      .where(eq(member.id, target.id));
    revalidatePath("/members");
    return {
      data: { ok: true },
      activity: {
        verb: "member.offboarded",
        entityType: "member",
        entityId: target.id,
        entityLabel: target.displayName,
        summary: `${target.displayName} moved to alumni`,
      },
    };
  },
});

export const toggleOnboardingTask = authedAction({
  minRole: "analyst",
  input: z.object({
    assignmentId: z.string().uuid(),
    taskId: z.string().uuid(),
    done: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const [assignment] = await db
      .select({
        id: onboardingAssignment.id,
        memberId: onboardingAssignment.memberId,
        trackId: onboardingAssignment.trackId,
        orgId: member.orgId,
        memberName: member.displayName,
      })
      .from(onboardingAssignment)
      .innerJoin(member, eq(onboardingAssignment.memberId, member.id))
      .where(eq(onboardingAssignment.id, input.assignmentId))
      .limit(1);
    if (!assignment || assignment.orgId !== ctx.org.id) throw new Error("Assignment not found");

    // Members check off their own list; admins can check anyone's.
    if (assignment.memberId !== ctx.member.id && ctx.member.role !== "admin") {
      throw new Error("You can only update your own onboarding");
    }

    if (input.done) {
      await db
        .insert(onboardingCompletion)
        .values({
          assignmentId: assignment.id,
          taskId: input.taskId,
          verifiedByMemberId: ctx.member.id !== assignment.memberId ? ctx.member.id : null,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(onboardingCompletion)
        .where(
          and(
            eq(onboardingCompletion.assignmentId, assignment.id),
            eq(onboardingCompletion.taskId, input.taskId)
          )
        );
    }

    // Auto-complete the assignment when every required task is done.
    const [tasks, completions] = await Promise.all([
      db
        .select({ id: onboardingTask.id, required: onboardingTask.required })
        .from(onboardingTask)
        .where(eq(onboardingTask.trackId, assignment.trackId)),
      db
        .select({ taskId: onboardingCompletion.taskId })
        .from(onboardingCompletion)
        .where(eq(onboardingCompletion.assignmentId, assignment.id)),
    ]);
    const doneIds = new Set(completions.map((c) => c.taskId));
    const allRequiredDone = tasks.filter((t) => t.required).every((t) => doneIds.has(t.id));
    await db
      .update(onboardingAssignment)
      .set({ completedAt: allRequiredDone ? new Date() : null })
      .where(eq(onboardingAssignment.id, assignment.id));

    revalidatePath("/onboarding");
    revalidatePath(`/members/${assignment.memberId}`);
    return {
      data: { ok: true, trackComplete: allRequiredDone },
      ...(input.done && allRequiredDone
        ? {
            activity: {
              verb: "onboarding.completed",
              entityType: "member",
              entityId: assignment.memberId,
              entityLabel: assignment.memberName,
              summary: `${assignment.memberName} completed onboarding 🎉`,
            },
          }
        : {}),
    };
  },
});
