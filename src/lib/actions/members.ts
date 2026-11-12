"use server";

import { z } from "zod";
import { orgSettings } from "@/lib/org-settings";
import { and, eq, ne, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  apiToken,
  activity,
  member,
  onboardingTrack,
  onboardingAssignment,
  onboardingTask,
  onboardingCompletion,
  session,
  MEMBER_ROLES,
  type MemberRole,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { notifyMany, sendEmailSafe } from "@/lib/notify";
import { ROLE_LABEL } from "@/lib/permissions";
import { inviteEmail, type OnboardingPlan } from "@/lib/onboarding/emails";
import { MAX_BULK_INVITES, parseInviteLines, type BulkInviteResult } from "@/lib/onboarding/invites";
import { getJourney, INVITED_VERB } from "@/lib/onboarding/load";
import { DEFAULT_DUE_DAYS, dueDateFrom, entry } from "@/lib/onboarding/progress";
import { syncOnboarding } from "@/lib/onboarding/sync";
import type { Ctx } from "./context";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));
const optionalUrl = z
  .string()
  .trim()
  .url()
  .max(300)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));
const classYear = z.coerce.number().int().min(2000).max(2100);

export const updateMyProfile = authedAction({
  // Explicitly below the analyst default: read_only members own their profile too.
  minRole: "read_only",
  input: z.object({
    displayName: z.string().trim().min(1).max(120),
    cohort: z.string().max(60).nullable().optional(),
    classYear: classYear.nullable().optional(),
    major: optionalText(120),
    title: optionalText(80),
    bio: z.string().max(1000).nullable().optional(),
    linkedinUrl: optionalUrl,
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
        ...(input.major !== undefined ? { major: input.major } : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
        updatedAt: new Date(),
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

/**
 * The "Your details" step of the welcome flow. Stricter than a profile edit:
 * class year and major are required, because having both is what marks the
 * details as confirmed (see profileConfirmed).
 */
export const confirmMyDetails = authedAction({
  minRole: "read_only",
  input: z.object({
    displayName: z.string().trim().min(1, "Add your name").max(120),
    classYear: classYear,
    major: z.string().trim().min(2, "Add your major or program").max(120),
    title: optionalText(80),
    bio: optionalText(1000),
    linkedinUrl: optionalUrl,
  }),
  handler: async (input, ctx) => {
    await db
      .update(member)
      .set({
        displayName: input.displayName,
        classYear: input.classYear,
        major: input.major,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.bio !== undefined ? { bio: input.bio } : {}),
        ...(input.linkedinUrl !== undefined ? { linkedinUrl: input.linkedinUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(member.id, ctx.member.id));
    const first = !ctx.member.major && !ctx.member.onboardedAt;
    await syncOnboarding(ctx.org.id, ctx.member.id);
    revalidatePath("/onboarding");
    revalidatePath("/members");
    return {
      data: { ok: true },
      ...(first
        ? {
            activity: {
              verb: "onboarding.details_confirmed",
              entityType: "member",
              entityId: ctx.member.id,
              entityLabel: input.displayName,
              summary: `${input.displayName} signed in and confirmed their details`,
            },
          }
        : {}),
    };
  },
});

/**
 * Leave the welcome flow for the app. Allowed once nothing required is left;
 * `later` is the escape for admins, who may always come back to it.
 */
export const finishOnboarding = authedAction({
  minRole: "read_only",
  input: z.object({ later: z.boolean().default(false) }),
  handler: async (input, ctx) => {
    const synced = await syncOnboarding(ctx.org.id, ctx.member.id);
    if (!synced) throw new ActionError("Member not found");
    const { journey } = synced;
    if (journey.member.onboardedAt) {
      return {
        data: { ok: true },
        ...(ctx.member.onboardedAt
          ? {}
          : {
              activity: {
                verb: "onboarding.completed",
                entityType: "member",
                entityId: ctx.member.id,
                entityLabel: ctx.member.displayName,
                summary: `${ctx.member.displayName} finished onboarding`,
              },
            }),
      };
    }
    if (!(input.later && entry(journey.member, journey.items, orgSettings(ctx.org).onboarding).canFinishLater)) {
      throw new ActionError("Finish the required items first.");
    }
    await db
      .update(member)
      .set({ onboardedAt: new Date(), updatedAt: new Date() })
      .where(eq(member.id, ctx.member.id));
    revalidatePath("/onboarding");
    return {
      data: { ok: true },
      activity: {
        verb: "onboarding.deferred",
        entityType: "member",
        entityId: ctx.member.id,
        entityLabel: ctx.member.displayName,
        summary: `${ctx.member.displayName} skipped the rest of onboarding for now`,
      },
    };
  },
});

// ——— Invites ———

const inviteOptions = {
  role: z.enum(MEMBER_ROLES).default("analyst"),
  cohort: z.string().trim().max(60).optional(),
  classYear: classYear.optional(),
  /** Omit for the club's default track; null for no onboarding. */
  trackId: z.string().uuid().nullable().optional(),
  /** Omit for the default; null for no due date. */
  dueInDays: z.number().int().min(1).max(180).nullable().optional(),
};
type InviteOptions = {
  role: MemberRole;
  cohort?: string;
  classYear?: number;
  trackId?: string | null;
  dueInDays?: number | null;
};

/** The track an invite enrolls on, with what the email needs to describe it. */
async function resolveInviteTrack(orgId: string, opts: InviteOptions) {
  if (opts.trackId === null) return null;
  const [track] = await db
    .select({ id: onboardingTrack.id, name: onboardingTrack.name })
    .from(onboardingTrack)
    .where(
      and(
        eq(onboardingTrack.orgId, orgId),
        opts.trackId ? eq(onboardingTrack.id, opts.trackId) : eq(onboardingTrack.isDefault, true),
        isNull(onboardingTrack.archivedAt)
      )
    )
    .limit(1);
  if (!track) {
    if (opts.trackId) throw new ActionError("That onboarding track no longer exists");
    return null;
  }
  const tasks = await db
    .select({ required: onboardingTask.required, minutes: onboardingTask.estimatedMinutes })
    .from(onboardingTask)
    .where(eq(onboardingTask.trackId, track.id));
  const required = tasks.filter((t) => t.required);
  const plan: OnboardingPlan = {
    requiredCount: required.length,
    minutes: required.reduce((n, t) => n + (t.minutes ?? 0), 0),
    dueAt: dueDateFrom(new Date(), opts.dueInDays === undefined ? DEFAULT_DUE_DAYS : opts.dueInDays),
  };
  return { ...track, plan };
}

async function createInvite(
  ctx: Ctx,
  person: { email: string; displayName: string },
  opts: InviteOptions,
  track: Awaited<ReturnType<typeof resolveInviteTrack>>
) {
  const [row] = await db
    .insert(member)
    .values({
      orgId: ctx.org.id,
      email: person.email,
      displayName: person.displayName,
      role: opts.role,
      status: "invited",
      cohort: opts.cohort || null,
      classYear: opts.classYear,
    })
    .returning();
  if (track) {
    await db
      .insert(onboardingAssignment)
      .values({ memberId: row.id, trackId: track.id, dueAt: track.plan.dueAt });
  }
  return row;
}

function inviteMessage(
  ctx: Ctx,
  to: { email: string; displayName: string; role: MemberRole },
  plan: OnboardingPlan | null,
  reminder = false
) {
  return inviteEmail({
    org: ctx.org,
    inviterName: ctx.member.displayName,
    inviterEmail: ctx.member.email,
    to,
    plan,
    reminder,
  });
}

function assertAllowedDomain(ctx: Ctx, email: string) {
  const domains = ctx.org.allowedEmailDomains;
  if (domains.length > 0 && !domains.some((d) => email.endsWith(`@${d}`))) {
    throw new ActionError(`Email must be on ${domains.map((d) => `@${d}`).join(" or ")}`);
  }
}

export const inviteMember = authedAction({
  minRole: "admin",
  input: z.object({
    email: z.string().trim().email(),
    displayName: z.string().trim().min(1).max(120),
    ...inviteOptions,
  }),
  handler: async (input, ctx) => {
    const email = input.email.toLowerCase();
    assertAllowedDomain(ctx, email);

    const [existing] = await db
      .select({ id: member.id, status: member.status })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), eq(member.email, email), ne(member.status, "removed")))
      .limit(1);
    if (existing) throw new ActionError("That email is already a member");

    const track = await resolveInviteTrack(ctx.org.id, input);
    const row = await createInvite(ctx, { email, displayName: input.displayName }, input, track);

    // getCtx links this member row by email on first sign-in — the invite
    // email only needs to point them at the login page.
    after(() =>
      sendEmailSafe(
        inviteMessage(ctx, { email, displayName: input.displayName, role: input.role }, track?.plan ?? null)
      )
    );

    revalidatePath("/members");
    revalidatePath("/onboarding");
    return {
      data: { memberId: row.id, trackName: track?.name ?? null },
      activity: {
        verb: INVITED_VERB,
        entityType: "member",
        entityId: row.id,
        entityLabel: input.displayName,
        summary: `${ctx.member.displayName} invited ${input.displayName} as ${ROLE_LABEL[input.role].toLowerCase()}${track ? ` and enrolled them on “${track.name}”` : ""}`,
      },
    };
  },
});

/** Invite a pasted list — one person per line — with a shared role, cohort and track. */
export const inviteMembers = authedAction({
  minRole: "admin",
  input: z.object({ lines: z.string().max(20_000), ...inviteOptions }),
  handler: async (input, ctx) => {
    const current = await db
      .select({ email: member.email })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), ne(member.status, "removed")));
    const parsed = parseInviteLines(input.lines, {
      allowedDomains: ctx.org.allowedEmailDomains,
      existingEmails: current.map((m) => m.email),
    });
    if (parsed.length === 0) throw new ActionError("Paste at least one email address");
    const valid = parsed.filter((p) => p.ok);
    if (valid.length > MAX_BULK_INVITES) {
      throw new ActionError(`That's ${valid.length} people. Invite up to ${MAX_BULK_INVITES} at a time.`);
    }

    const track = valid.length > 0 ? await resolveInviteTrack(ctx.org.id, input) : null;
    const emails: ReturnType<typeof inviteMessage>[] = [];
    for (const person of valid) {
      const row = await createInvite(ctx, { email: person.email, displayName: person.name }, input, track);
      // One log entry per person, so each invite keeps who sent it.
      await db.insert(activity).values({
        orgId: ctx.org.id,
        actorMemberId: ctx.member.id,
        actorType: "member",
        verb: INVITED_VERB,
        entityType: "member",
        entityId: row.id,
        entityLabel: person.name,
        summary: `${ctx.member.displayName} invited ${person.name} as ${ROLE_LABEL[input.role].toLowerCase()}${track ? ` and enrolled them on “${track.name}”` : ""}`,
      });
      emails.push(
        inviteMessage(ctx, { email: person.email, displayName: person.name, role: input.role }, track?.plan ?? null)
      );
    }
    after(() => notifyMany(emails.map((e) => () => sendEmailSafe(e))));

    revalidatePath("/members");
    revalidatePath("/onboarding");
    const results: BulkInviteResult[] = parsed.map((p) => ({
      line: p.line,
      raw: p.raw,
      ok: p.ok,
      detail: p.ok ? `${p.name} · ${p.email}` : p.error,
    }));
    return { data: { invited: valid.length, results, trackName: track?.name ?? null } };
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
    // Their access tokens already stop working (context.ts); revoke them too
    // so nothing stale is left listed against the club.
    await db
      .update(apiToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiToken.memberId, target.id), isNull(apiToken.revokedAt)));
    // And end their browser sessions, so an open tab stops at its next click.
    if (target.userId) await db.delete(session).where(eq(session.userId, target.userId));
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

/** Tick or untick one onboarding item. Members do their own; admins can do anyone's. */
export const toggleOnboardingTask = authedAction({
  // Read-only members are onboarded like everyone else.
  minRole: "read_only",
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

    const self = assignment.memberId === ctx.member.id;
    if (!self && ctx.member.role !== "admin") {
      throw new ActionError("You can only update your own onboarding");
    }
    const [task] = await db
      .select({ id: onboardingTask.id })
      .from(onboardingTask)
      .where(and(eq(onboardingTask.id, input.taskId), eq(onboardingTask.trackId, assignment.trackId)))
      .limit(1);
    if (!task) throw new ActionError("That item isn't on this track");

    if (input.done) {
      await db
        .insert(onboardingCompletion)
        .values({
          assignmentId: assignment.id,
          taskId: task.id,
          verifiedByMemberId: self ? null : ctx.member.id,
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(onboardingCompletion)
        .where(
          and(eq(onboardingCompletion.assignmentId, assignment.id), eq(onboardingCompletion.taskId, task.id))
        );
    }

    const synced = await syncOnboarding(ctx.org.id, assignment.memberId);
    revalidatePath("/onboarding");
    revalidatePath(`/members/${assignment.memberId}`);
    return {
      data: { ok: true, trackComplete: synced?.journey.stage === "complete" },
      ...(input.done && synced?.justCompleted
        ? {
            activity: {
              verb: "onboarding.completed",
              entityType: "member",
              entityId: assignment.memberId,
              entityLabel: assignment.memberName,
              summary: `${assignment.memberName} finished onboarding`,
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
    const journey = await getJourney(ctx.org.id, target.id);
    const sent = await sendEmailSafe(
      inviteMessage(
        ctx,
        target,
        journey && journey.assignments.length > 0
          ? {
              requiredCount: journey.summary.requiredTotal,
              minutes: journey.summary.minutesTotal,
              dueAt: journey.dueAt,
            }
          : null,
        true
      )
    );
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
