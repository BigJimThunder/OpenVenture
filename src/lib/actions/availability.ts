"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  application,
  availabilityBlock,
  availabilityConfirmation,
  AVAILABILITY_KINDS,
  company,
  organization,
} from "@/db/schema";
import { sendManualScheduleReminder } from "@/lib/automation/schedule-reminders";
import { notifyMany } from "@/lib/notify";
import { mergeOrgSettings, orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { atomic } from "@/lib/pipeline/atomic";
import {
  clubToday,
  getConfirmedAt,
  getScheduleBlocks,
  getSchedulingMembers,
  getTermRoster,
  loadEngineInput,
} from "@/lib/queries/availability";
import { MAX_BLOCKS_PER_TERM, MAX_LABEL_LENGTH, normalizeBlocks, type ScheduleBlock } from "@/lib/scheduling/blocks";
import { busyHeatmap, findGroupTimes, findTimesForN, whoIsFree, type EngineInput } from "@/lib/scheduling/engine";
import { zoneName } from "@/lib/scheduling/format";
import { currentTerm, previousTerm, sortTerms, validateTerms, type Term } from "@/lib/scheduling/terms";
import { addDays, isValidIsoDay, zonedParts, type IsoDay } from "@/lib/scheduling/time";
import { viewPresence, type AtResult, type FinderMeta, type GroupResult, type TeamResult } from "@/lib/scheduling/views";
import { AuthError, ForbiddenError, requireCtx, type Ctx } from "./context";
import { ActionError, authedAction, type ActionResult } from "./safe-action";

// ——— A member's own schedule ———

const blockSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
  kind: z.enum(AVAILABILITY_KINDS),
  label: z.string().max(MAX_LABEL_LENGTH).nullable(),
});

function requireTerm(ctx: Ctx, termKey: string): Term {
  const term = orgSettings(ctx.org).scheduling.terms.find((t) => t.key === termKey);
  if (!term) throw new ActionError("That term no longer exists. Reload the page.");
  return term;
}

/**
 * Replace the signed-in member's weekly schedule for one term. The editor
 * saves the whole week each time, so there is no partial state to reconcile.
 * Read-only members have a schedule too: they come to meetings.
 */
export const saveMySchedule = authedAction({
  minRole: "read_only",
  input: z.object({
    termKey: z.string().min(1).max(40),
    blocks: z.array(blockSchema).max(MAX_BLOCKS_PER_TERM * 2),
  }),
  handler: async (input, ctx) => {
    requireTerm(ctx, input.termKey);
    if (input.blocks.some((b) => b.startMinute >= b.endMinute)) {
      throw new ActionError("A block has to end after it starts.");
    }
    const blocks = normalizeBlocks(input.blocks);
    if (blocks.length > MAX_BLOCKS_PER_TERM) {
      throw new ActionError(`That is more than ${MAX_BLOCKS_PER_TERM} blocks in a week. Merge a few and try again.`);
    }
    const mine = and(
      eq(availabilityBlock.orgId, ctx.org.id),
      eq(availabilityBlock.memberId, ctx.member.id),
      eq(availabilityBlock.termKey, input.termKey)
    );
    await atomic((q) => [
      q.delete(availabilityBlock).where(mine),
      ...(blocks.length > 0
        ? [
            q
              .insert(availabilityBlock)
              .values(blocks.map((b) => ({ ...b, orgId: ctx.org.id, memberId: ctx.member.id, termKey: input.termKey }))),
          ]
        : []),
    ]);
    // Not logged: the editor saves on every change, and a class list is nobody else's news.
    return { data: { count: blocks.length } };
  },
});

/** "This is my schedule for the term" — including an empty one. */
export const confirmMySchedule = authedAction({
  minRole: "read_only",
  input: z.object({ termKey: z.string().min(1).max(40) }),
  handler: async (input, ctx) => {
    const term = requireTerm(ctx, input.termKey);
    const existing = await getConfirmedAt(ctx.org.id, ctx.member.id, term.key);
    if (existing) return { data: { confirmedAt: existing.toISOString() } };
    const [row] = await db
      .insert(availabilityConfirmation)
      .values({ orgId: ctx.org.id, memberId: ctx.member.id, termKey: term.key })
      .returning({ confirmedAt: availabilityConfirmation.confirmedAt });
    revalidatePath("/schedule");
    return {
      data: { confirmedAt: row.confirmedAt.toISOString() },
      activity: {
        verb: "schedule.confirmed",
        entityType: "member",
        entityId: ctx.member.id,
        entityLabel: ctx.member.displayName,
        summary: `${ctx.member.displayName} entered a schedule for ${term.name}`,
      },
    };
  },
});

// ——— Reads ———

/** Same envelope as authedAction, for server functions that only read. */
async function read<S extends z.ZodType, T>(
  schema: S,
  raw: z.input<S>,
  minRole: "read_only" | "analyst",
  run: (input: z.output<S>, ctx: Ctx) => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, code: "validation", error: parsed.error.issues.map((i) => i.message).join("; ") };
    }
    return { ok: true, data: await run(parsed.data, await requireCtx(minRole)) };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, code: "auth", error: "Please sign in." };
    if (e instanceof ForbiddenError) return { ok: false, code: "forbidden", error: "You don't have permission to do that." };
    if (e instanceof ActionError) return { ok: false, code: "error", error: e.message };
    console.error("[availability]", e);
    return { ok: false, code: "error", error: "Something went wrong." };
  }
}

export type MyScheduleData = {
  term: Term | null;
  terms: Term[];
  blocks: ScheduleBlock[];
  confirmedAt: string | null;
  /** Last term's blocks, for "copy from last term"; null when there is nothing to copy. */
  previous: { term: Term; blocks: ScheduleBlock[] } | null;
  window: { dayStartMinute: number; dayEndMinute: number; weekends: boolean };
  timeZone: string;
  canManageClub: boolean;
};

/** Everything the schedule editor needs, for the signed-in member. */
export async function getMyScheduleData(input: { termKey?: string } = {}): Promise<ActionResult<MyScheduleData>> {
  return read(z.object({ termKey: z.string().max(40).optional() }), input, "read_only", async ({ termKey }, ctx) => {
    const { scheduling } = orgSettings(ctx.org);
    const terms = sortTerms(scheduling.terms);
    const term = terms.find((t) => t.key === termKey) ?? currentTerm(scheduling, new Date(), ctx.org.timezone);
    const before = term ? previousTerm(terms, term) : null;
    const [blocks, confirmedAt, previousBlocks] = await Promise.all([
      term ? getScheduleBlocks(ctx.org.id, ctx.member.id, term.key) : [],
      term ? getConfirmedAt(ctx.org.id, ctx.member.id, term.key) : null,
      before ? getScheduleBlocks(ctx.org.id, ctx.member.id, before.key) : [],
    ]);
    return {
      term,
      terms,
      blocks,
      confirmedAt: confirmedAt?.toISOString() ?? null,
      previous: before && previousBlocks.length > 0 ? { term: before, blocks: previousBlocks } : null,
      window: {
        dayStartMinute: scheduling.dayStartMinute,
        dayEndMinute: scheduling.dayEndMinute,
        weekends: scheduling.weekends,
      },
      timeZone: ctx.org.timezone,
      canManageClub: can(ctx.member.role, "manageClub"),
    };
  });
}

const rangeShape = {
  /** Defaults to today, club time. */
  fromDay: z.string().refine(isValidIsoDay, "Pick a date").optional(),
  days: z.number().int().min(1).max(28).default(14),
  durationMinutes: z.number().int().min(15).max(480),
  includeUnknown: z.boolean().default(false),
};

const ids = z.array(z.string().uuid()).max(200);

async function engineFor(
  ctx: Ctx,
  range: { fromDay?: IsoDay; days: number },
  excludeMeetingId?: string
): Promise<{ input: EngineInput; meta: FinderMeta }> {
  const now = new Date();
  const today = clubToday(ctx.org, now);
  const fromDay = range.fromDay && range.fromDay > today ? range.fromDay : today;
  const toDay = addDays(fromDay, range.days - 1);
  const input = await loadEngineInput(ctx.org, { fromDay, toDay, now, excludeMeetingId });
  return {
    input,
    meta: {
      timeZone: ctx.org.timezone,
      zone: zoneName(now.getTime(), ctx.org.timezone),
      orgName: ctx.org.name,
      members: input.members.map((m) => ({ ...m })),
      hasTerms: input.terms.length > 0,
      fromDay,
      toDay,
    },
  };
}

/** People who take part in scheduled work by default: everyone but read-only members. */
function defaultPool(input: EngineInput): string[] {
  return input.members.filter((m) => m.role !== "read_only").map((m) => m.id);
}

async function applicationContext(ctx: Ctx, applicationId: string | undefined) {
  if (!applicationId) return { ownerId: null, companyName: null };
  const [row] = await db
    .select({ ownerId: application.ownerMemberId, companyName: company.name })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .where(and(eq(application.id, applicationId), eq(application.orgId, ctx.org.id)))
    .limit(1);
  return { ownerId: row?.ownerId ?? null, companyName: row?.companyName ?? null };
}

const groupSchema = z.object({
  ...rangeShape,
  /** Empty means every active member. */
  memberIds: ids,
  /** When moving an existing meeting, don't let it conflict with itself. */
  excludeMeetingId: z.string().uuid().optional(),
});

/** Mode A — "these people": when are they all free? Also returns the group's week at a glance. */
export async function findGroupTimesAction(
  raw: z.input<typeof groupSchema>
): Promise<ActionResult<GroupResult>> {
  return read(groupSchema, raw, "analyst", async (q, ctx) => {
    const { input, meta } = await engineFor(ctx, q, q.excludeMeetingId);
    const memberIds = q.memberIds.length > 0 ? q.memberIds : input.members.map((m) => m.id);
    return {
      ...meta,
      ...findGroupTimes(input, { ...q, memberIds, fromDay: meta.fromDay, toDay: meta.toDay }),
      heatmap: busyHeatmap(input, { memberIds, fromDay: meta.fromDay, toDay: addDays(meta.fromDay, 6) }),
    };
  });
}

const teamShape = {
  pool: ids.optional(),
  required: ids.default([]),
  n: z.number().int().min(1).max(20),
  applicationId: z.string().uuid().optional(),
  requirePartner: z.boolean().default(false),
};

const teamSchema = z.object({ ...rangeShape, ...teamShape });

/** Mode C — "N people, sometime": the best (time, people) pairs. */
export async function findTeamTimesAction(raw: z.input<typeof teamSchema>): Promise<ActionResult<TeamResult>> {
  return read(teamSchema, raw, "analyst", async (q, ctx) => {
    const [{ input, meta }, app] = await Promise.all([engineFor(ctx, q), applicationContext(ctx, q.applicationId)]);
    if (q.required.length > q.n) throw new ActionError(`You chose ${q.required.length} people for a group of ${q.n}.`);
    return {
      ...meta,
      ...findTimesForN(input, {
        ...q,
        pool: q.pool ?? defaultPool(input),
        ownerId: app.ownerId,
        fromDay: meta.fromDay,
        toDay: meta.toDay,
      }),
      ...app,
    };
  });
}

const atSchema = z.object({
  start: z.coerce.date(),
  durationMinutes: z.number().int().min(15).max(480),
  includeUnknown: z.boolean().default(false),
  pool: ids.optional(),
  required: ids.default([]),
  /** Omit to only check the `required` people. */
  n: z.number().int().min(1).max(20).optional(),
  applicationId: z.string().uuid().optional(),
  requirePartner: z.boolean().default(false),
  excludeMeetingId: z.string().uuid().optional(),
});

/**
 * Mode B — "this time": who is free at a specific start, what is in the way
 * for those who are not, and (when `n` is given) which N to send.
 */
export async function checkTimeAction(raw: z.input<typeof atSchema>): Promise<ActionResult<AtResult>> {
  return read(atSchema, raw, "analyst", async (q, ctx) => {
    const day = zonedParts(q.start, ctx.org.timezone).day;
    const now = new Date();
    const [input, app] = await Promise.all([
      loadEngineInput(ctx.org, { fromDay: day, toDay: addDays(day, 1), now, excludeMeetingId: q.excludeMeetingId }),
      applicationContext(ctx, q.applicationId),
    ]);
    const pool = q.pool ?? (q.n ? defaultPool(input) : []);
    const res = whoIsFree(input, {
      start: q.start.getTime(),
      durationMinutes: q.durationMinutes,
      pool,
      required: q.required,
      n: q.n ?? q.required.length,
      ownerId: app.ownerId,
      requirePartner: q.requirePartner,
      includeUnknown: q.includeUnknown,
    });
    const viewer = { memberId: ctx.member.id, isAdmin: can(ctx.member.role, "manageMembers") };
    return {
      timeZone: ctx.org.timezone,
      zone: zoneName(q.start.getTime(), ctx.org.timezone),
      orgName: ctx.org.name,
      members: input.members.map((m) => ({ ...m })),
      hasTerms: input.terms.length > 0,
      fromDay: day,
      toDay: day,
      day: res.day,
      startMinute: res.startMinute,
      durationMinutes: q.durationMinutes,
      start: q.start.toISOString(),
      people: res.presences.map((p) => viewPresence(p, viewer, ctx.org.timezone)),
      combinations: q.n ? res.combinations : [],
      availableCount: res.availableCount,
      ownerId: app.ownerId,
    };
  });
}

// ——— Admin: terms, roster, reminders ———

const termSchema = z.object({
  key: z.string().min(1).max(40),
  name: z.string().trim().min(1, "Give the term a name").max(60),
  start: z.string().refine(isValidIsoDay, "Pick a start date"),
  end: z.string().refine(isValidIsoDay, "Pick an end date"),
});

/**
 * The academic calendar and the hours the scheduler may suggest. Separate
 * from updateClubPreferences because a term list has rules a field-by-field
 * patch cannot check: no overlaps, each term ends after it starts.
 */
export const saveCalendarSettings = authedAction({
  minRole: "admin",
  input: z.object({
    system: z.enum(["quarter", "semester"]),
    terms: z.array(termSchema).max(24),
    dayStartMinute: z.number().int().min(0).max(1380).multipleOf(15),
    dayEndMinute: z.number().int().min(60).max(1440).multipleOf(15),
    weekends: z.boolean(),
  }),
  handler: async (input, ctx) => {
    const [issue] = validateTerms(input.terms);
    if (issue) {
      const name = input.terms.find((t) => t.key === issue.key)?.name ?? "A term";
      throw new ActionError(`${name}: ${issue.message}`);
    }
    if (input.dayEndMinute - input.dayStartMinute < 120) {
      throw new ActionError("Leave at least two hours between the earliest and latest time.");
    }
    const next = mergeOrgSettings(ctx.org.settings, { scheduling: { ...input, terms: sortTerms(input.terms) } });
    await db.update(organization).set({ settings: next, updatedAt: new Date() }).where(eq(organization.id, ctx.org.id));
    revalidatePath("/", "layout");
    return {
      data: { ok: true },
      activity: {
        verb: "org.calendar_updated",
        entityType: "organization",
        entityId: ctx.org.id,
        summary: `${ctx.member.displayName} updated the academic calendar (${input.terms.length} term${input.terms.length === 1 ? "" : "s"})`,
      },
    };
  },
});

/**
 * Email members who have not confirmed a schedule for a term. One member, or
 * everyone outstanding. Pressing it twice in a day sends nothing the second time.
 */
export const remindSchedules = authedAction({
  minRole: "admin",
  input: z.object({ termKey: z.string().min(1).max(40), memberIds: ids.optional() }),
  handler: async (input, ctx) => {
    const term = requireTerm(ctx, input.termKey);
    const [roster, members] = await Promise.all([getTermRoster(ctx.org.id, term.key), getSchedulingMembers(ctx.org.id)]);
    const outstanding = new Set(roster.filter((r) => !r.confirmedAt).map((r) => r.memberId));
    const targets = members.filter(
      (m) => outstanding.has(m.id) && m.id !== ctx.member.id && (!input.memberIds || input.memberIds.includes(m.id))
    );
    const now = new Date();
    let sent = 0;
    await notifyMany(
      targets.map((m) => async () => {
        const ok = await sendManualScheduleReminder({
          org: ctx.org,
          to: { id: m.id, email: m.email, displayName: m.name },
          term,
          fromName: ctx.member.displayName,
          now,
        });
        if (ok) sent++;
      })
    );
    revalidatePath("/schedule");
    revalidatePath("/settings");
    return {
      data: { sent, alreadyReminded: targets.length - sent },
      activity:
        sent > 0
          ? {
              verb: "schedule.reminded",
              entityType: "organization",
              entityId: ctx.org.id,
              summary: `${ctx.member.displayName} reminded ${sent} member${sent === 1 ? "" : "s"} to enter a ${term.name} schedule`,
            }
          : undefined,
    };
  },
});

export type MemberScheduleView = { term: Term | null; blocks: ScheduleBlock[]; confirmedAt: string | null };

/**
 * Another member's week. Admins get the blocks with their labels; nobody
 * else can call this for anyone but themselves.
 */
export async function getMemberSchedule(input: { memberId: string; termKey?: string }): Promise<ActionResult<MemberScheduleView>> {
  return read(
    z.object({ memberId: z.string().uuid(), termKey: z.string().max(40).optional() }),
    input,
    "read_only",
    async (q, ctx) => {
      if (q.memberId !== ctx.member.id && !can(ctx.member.role, "manageMembers")) throw new ForbiddenError();
      const members = await getSchedulingMembers(ctx.org.id);
      if (!members.some((m) => m.id === q.memberId)) throw new ActionError("Member not found");
      const { scheduling } = orgSettings(ctx.org);
      const term = scheduling.terms.find((t) => t.key === q.termKey) ?? currentTerm(scheduling, new Date(), ctx.org.timezone);
      if (!term) return { term: null, blocks: [], confirmedAt: null };
      const [blocks, confirmedAt] = await Promise.all([
        getScheduleBlocks(ctx.org.id, q.memberId, term.key),
        getConfirmedAt(ctx.org.id, q.memberId, term.key),
      ]);
      return { term, blocks, confirmedAt: confirmedAt?.toISOString() ?? null };
    }
  );
}
