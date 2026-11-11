"use server";

import { z } from "zod";
import { and, eq, ne, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  member,
  onboardingTrack,
  onboardingAssignment,
  onboardingTask,
  onboardingCompletion,
  MEMBER_ROLES,
  type MemberRole,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { appUrl, emailLayout, escapeHtml, sendEmailSafe } from "@/lib/notify";
import { ROLE_LABEL } from "@/lib/permissions";
import type { Ctx } from "./context";

function inviteEmail(ctx: Ctx, to: { email: string; role: MemberRole }) {
  return {
    to: to.email,
    subject: `You've been invited to ${ctx.org.name}`,
    html: emailLayout({
      orgName: ctx.org.name,
      heading: `Welcome to ${ctx.org.name}`,
      bodyHtml: `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a">${escapeHtml(
        ctx.member.displayName
      )} added you as ${escapeHtml(ROLE_LABEL[to.role].toLowerCase())}. Sign in with this email address — there is no password, we email you a link.</p>`,
      cta: { label: "Sign in", url: appUrl("/login") },
    }),
  };
}

export const updateMyProfile = authedAction({
  // Explicitly below the analyst default: read_only members own their profile too.
  minRole: "read_only",
  input: z.object({
    displayName: z.string().min(1).max(120),
    cohort: z.string().max(60).nullable().optional(),
    classYear: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
    bio: z.string().max(1000).nullable().optional(),
    linkedinUrl: z.string().url().max(300).nullable().optional().or(z.literal("").transform(() => null)),
  }),
  handler: async (input, ctx) => {
    // Operates only on the caller's own row — there is deliberately no
    // memberId parameter, so no cross-member edit is possible.
    await db
      .update(member)
      .set({
        displayName: input.displayName,
        ...(input.cohort !== undefined ? { cohort: input.cohort } : {}),
        ...(input.classYear !== undefined ? { classYear: input.classYear } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
      })
      .where(eq(member.id, ctx.member.id));

    revalidatePath(`/members/${ctx.member.id}`);
    revalidatePath("/members");
    return {
      data: { ok: true },
      activity: {
        verb: "member.profile_updated",
        entityType: "member",
        entityId: ctx.member.id,
        entityLabel: input.displayName,
        summary: `${input.displayName} updated their profile`,
      },
    };
  },
});

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
      throw new ActionError(`Email must be on ${domains.map((d) => `@${d}`).join(" or ")}`);
    }

    const [existing] = await db
      .select({ id: member.id, status: member.status })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), eq(member.email, email)))
      .limit(1);
    if (existing && existing.status !== "removed") {
      throw new ActionError("That email is already a member");
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
    after(() => sendEmailSafe(inviteEmail(ctx, { email, role: input.role })));

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
    if (!target) throw new ActionError("Member not found");

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
      if ((admins?.n ?? 0) === 0) throw new ActionError("Cannot demote the last admin");
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
    if (!target) throw new ActionError("Member not found");
    if (target.id === ctx.member.id) throw new ActionError("You can't offboard yourself");
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
      if ((admins?.n ?? 0) === 0) throw new ActionError("Cannot offboard the last admin");
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
    if (!assignment || assignment.orgId !== ctx.org.id) throw new ActionError("Assignment not found");

    // Members check off their own list; admins can check anyone's.
    if (assignment.memberId !== ctx.member.id && ctx.member.role !== "admin") {
      throw new ActionError("You can only update your own onboarding");
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

async function loadPendingInvite(orgId: string, memberId: string) {
  const [target] = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.orgId, orgId)))
    .limit(1);
  if (!target) throw new ActionError("Member not found");
  if (target.status !== "invited" || target.userId) {
    throw new ActionError(`${target.displayName} has already signed in`);
  }
  return target;
}

export const resendInvite = authedAction({
  minRole: "admin",
  input: z.object({ memberId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const target = await loadPendingInvite(ctx.org.id, input.memberId);
    const sent = await sendEmailSafe(inviteEmail(ctx, { email: target.email, role: target.role }));
    if (!sent) throw new ActionError("The invite email couldn't be sent. Check Settings → Email.");
    return {
      data: { ok: true },
      activity: {
        verb: "member.invite_resent",
        entityType: "member",
        entityId: target.id,
        entityLabel: target.displayName,
        summary: `${ctx.member.displayName} re-sent ${target.displayName}'s invite`,
      },
    };
  },
});

/**
 * Withdraw an invite nobody has used yet. The row is deleted outright (it is
 * only an invitation, and a leftover row would re-link if that person signed
 * in). If the invitee has already been given work or marked at a meeting the
 * delete is refused — those records need a member to point at.
 */
export const revokeInvite = authedAction({
  minRole: "admin",
  input: z.object({ memberId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const target = await loadPendingInvite(ctx.org.id, input.memberId);
    try {
      await db.delete(member).where(eq(member.id, target.id));
    } catch (e) {
      const code = (e as { code?: string; cause?: { code?: string } })?.cause?.code ?? (e as { code?: string })?.code;
      if (code !== "23503") throw e;
      throw new ActionError(
        `${target.displayName} is already attached to club records (attendance, assigned applications or action items). Reassign those first, then withdraw the invite.`
      );
    }
    revalidatePath("/members");
    revalidatePath("/onboarding");
    return {
      data: { ok: true },
      activity: {
        verb: "member.invite_revoked",
        entityType: "member",
        entityId: target.id,
        entityLabel: target.displayName,
        summary: `${ctx.member.displayName} withdrew ${target.displayName}'s invite`,
      },
    };
  },
});

/** Admin edit of the roster fields a member can't be relied on to keep tidy. */
export const updateMemberDetails = authedAction({
  minRole: "admin",
  input: z.object({
    memberId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(120),
    title: z.string().trim().max(80).nullable(),
    cohort: z.string().trim().max(60).nullable(),
    classYear: z.coerce.number().int().min(2000).max(2100).nullable(),
  }),
  handler: async (input, ctx) => {
    const [target] = await db
      .select()
      .from(member)
      .where(and(eq(member.id, input.memberId), eq(member.orgId, ctx.org.id)))
      .limit(1);
    if (!target) throw new ActionError("Member not found");
    await db
      .update(member)
      .set({
        displayName: input.displayName,
        title: input.title || null,
        cohort: input.cohort || null,
        classYear: input.classYear,
        updatedAt: new Date(),
      })
      .where(eq(member.id, target.id));
    revalidatePath("/members");
    revalidatePath(`/members/${target.id}`);
    return {
      data: { ok: true },
      activity: {
        verb: "member.details_updated",
        entityType: "member",
        entityId: target.id,
        entityLabel: input.displayName,
        summary: `${ctx.member.displayName} updated ${input.displayName}'s roster details`,
      },
    };
  },
});
