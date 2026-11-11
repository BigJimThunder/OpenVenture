import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  availabilityBlock,
  availabilityConfirmation,
  coffeeChat,
  coffeeChatAttendee,
  company,
  meeting,
  member,
  notificationLog,
  organization,
  type MemberRole,
} from "@/db/schema";
import { orgSettings } from "@/lib/org-settings";
import type { ScheduleBlock } from "@/lib/scheduling/blocks";
import { COFFEE_CHAT_MINUTES, type EngineEvent, type EngineInput } from "@/lib/scheduling/engine";
import { MANUAL_REMINDER_KIND, REMINDER_KIND } from "@/lib/scheduling/reminders";
import { currentTerm, type Term } from "@/lib/scheduling/terms";
import { addDays, MINUTE, zonedParts, zonedToUtc, type IsoDay } from "@/lib/scheduling/time";

type Org = typeof organization.$inferSelect;

const LOAD_WINDOW_DAYS = 30;

export async function getScheduleBlocks(orgId: string, memberId: string, termKey: string): Promise<ScheduleBlock[]> {
  const rows = await db
    .select({
      dayOfWeek: availabilityBlock.dayOfWeek,
      startMinute: availabilityBlock.startMinute,
      endMinute: availabilityBlock.endMinute,
      kind: availabilityBlock.kind,
      label: availabilityBlock.label,
    })
    .from(availabilityBlock)
    .where(
      and(
        eq(availabilityBlock.orgId, orgId),
        eq(availabilityBlock.memberId, memberId),
        eq(availabilityBlock.termKey, termKey)
      )
    )
    .orderBy(asc(availabilityBlock.dayOfWeek), asc(availabilityBlock.startMinute));
  return rows;
}

export async function getConfirmedAt(orgId: string, memberId: string, termKey: string): Promise<Date | null> {
  const [row] = await db
    .select({ confirmedAt: availabilityConfirmation.confirmedAt })
    .from(availabilityConfirmation)
    .where(
      and(
        eq(availabilityConfirmation.orgId, orgId),
        eq(availabilityConfirmation.memberId, memberId),
        eq(availabilityConfirmation.termKey, termKey)
      )
    )
    .limit(1);
  return row?.confirmedAt ?? null;
}

export type ScheduleStatus = {
  /** The term members are being asked about; null when the club has set none. */
  term: Term | null;
  confirmedAt: Date | null;
  blockCount: number;
  /** True when there is a term and this member has not confirmed a schedule for it. */
  needsSchedule: boolean;
};

/**
 * Whether a member owes the club a schedule for the current term. Cheap (two
 * small queries); any screen can call it to show a "new term" nudge linking
 * to /schedule.
 */
export async function getScheduleStatus(org: Org, memberId: string, now: Date = new Date()): Promise<ScheduleStatus> {
  const term = currentTerm(orgSettings(org).scheduling, now, org.timezone);
  if (!term) return { term: null, confirmedAt: null, blockCount: 0, needsSchedule: false };
  const [confirmedAt, [count]] = await Promise.all([
    getConfirmedAt(org.id, memberId, term.key),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(availabilityBlock)
      .where(
        and(
          eq(availabilityBlock.orgId, org.id),
          eq(availabilityBlock.memberId, memberId),
          eq(availabilityBlock.termKey, term.key)
        )
      ),
  ]);
  return { term, confirmedAt, blockCount: count?.n ?? 0, needsSchedule: !confirmedAt };
}

export type SchedulingMember = { id: string; name: string; role: MemberRole; email: string };

/** Everyone who can be scheduled: active, not offboarded, in join order. */
export async function getSchedulingMembers(orgId: string): Promise<SchedulingMember[]> {
  return db
    .select({ id: member.id, name: member.displayName, role: member.role, email: member.email })
    .from(member)
    .where(and(eq(member.orgId, orgId), eq(member.status, "active"), isNull(member.offboardedAt)))
    .orderBy(asc(member.displayName));
}

export type RosterRow = {
  memberId: string;
  name: string;
  role: MemberRole;
  confirmedAt: Date | null;
  blockCount: number;
  lastRemindedAt: Date | null;
};

/** Who has and hasn't entered a schedule for a term — admins only (callers check). */
export async function getTermRoster(orgId: string, termKey: string): Promise<RosterRow[]> {
  const [members, confirmations, counts, reminders] = await Promise.all([
    getSchedulingMembers(orgId),
    db
      .select({ memberId: availabilityConfirmation.memberId, confirmedAt: availabilityConfirmation.confirmedAt })
      .from(availabilityConfirmation)
      .where(and(eq(availabilityConfirmation.orgId, orgId), eq(availabilityConfirmation.termKey, termKey))),
    db
      .select({ memberId: availabilityBlock.memberId, n: sql<number>`count(*)::int` })
      .from(availabilityBlock)
      .where(and(eq(availabilityBlock.orgId, orgId), eq(availabilityBlock.termKey, termKey)))
      .groupBy(availabilityBlock.memberId),
    getLastReminders(orgId, termKey),
  ]);
  const confirmed = new Map(confirmations.map((c) => [c.memberId, c.confirmedAt]));
  const blocks = new Map(counts.map((c) => [c.memberId, c.n]));
  return members.map((m) => ({
    memberId: m.id,
    name: m.name,
    role: m.role,
    confirmedAt: confirmed.get(m.id) ?? null,
    blockCount: blocks.get(m.id) ?? 0,
    lastRemindedAt: reminders.get(m.id) ?? null,
  }));
}

/** Latest schedule reminder per member for a term, automatic or manual. Keys are `${termKey}:${memberId}:…`. */
export async function getLastReminders(orgId: string, termKey: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({ key: notificationLog.key, sentAt: notificationLog.sentAt })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, orgId),
        inArray(notificationLog.kind, [REMINDER_KIND, MANUAL_REMINDER_KIND]),
        sql`starts_with(${notificationLog.key}, ${`${termKey}:`})`
      )
    );
  const last = new Map<string, Date>();
  for (const row of rows) {
    const memberId = row.key.slice(termKey.length + 1).split(":")[0];
    const prev = last.get(memberId);
    if (!prev || prev < row.sentAt) last.set(memberId, row.sentAt);
  }
  return last;
}

/**
 * Everything the engine needs for a date range: who can be scheduled, their
 * blocks for the terms the range touches, what is already on the club
 * calendar, and how many coffee chats each person has had lately.
 */
export async function loadEngineInput(
  org: Org,
  opts: { fromDay: IsoDay; toDay: IsoDay; now: Date; excludeMeetingId?: string | null }
): Promise<EngineInput> {
  const { scheduling } = orgSettings(org);
  const rangeStart = new Date(zonedToUtc(opts.fromDay, 0, org.timezone));
  const rangeEnd = new Date(zonedToUtc(addDays(opts.toDay, 1), 0, org.timezone));
  const termKeys = scheduling.terms.filter((t) => t.start <= opts.toDay && t.end >= opts.fromDay).map((t) => t.key);
  const loadSince = new Date(opts.now.getTime() - LOAD_WINDOW_DAYS * 86_400_000);
  // A meeting that began the evening before can still run into the range.
  const meetingsFrom = new Date(rangeStart.getTime() - 8 * 60 * MINUTE);

  const [members, blocks, confirmations, meetings, chats, recentChats] = await Promise.all([
    getSchedulingMembers(org.id),
    termKeys.length === 0
      ? []
      : db
          .select({
            memberId: availabilityBlock.memberId,
            termKey: availabilityBlock.termKey,
            dayOfWeek: availabilityBlock.dayOfWeek,
            startMinute: availabilityBlock.startMinute,
            endMinute: availabilityBlock.endMinute,
            kind: availabilityBlock.kind,
            label: availabilityBlock.label,
          })
          .from(availabilityBlock)
          .where(and(eq(availabilityBlock.orgId, org.id), inArray(availabilityBlock.termKey, termKeys))),
    termKeys.length === 0
      ? []
      : db
          .select({ memberId: availabilityConfirmation.memberId, termKey: availabilityConfirmation.termKey })
          .from(availabilityConfirmation)
          .where(and(eq(availabilityConfirmation.orgId, org.id), inArray(availabilityConfirmation.termKey, termKeys))),
    db
      .select({ id: meeting.id, title: meeting.title, scheduledAt: meeting.scheduledAt, durationMinutes: meeting.durationMinutes })
      .from(meeting)
      .where(
        and(
          eq(meeting.orgId, org.id),
          inArray(meeting.status, ["scheduled", "in_progress"]),
          gte(meeting.scheduledAt, meetingsFrom),
          lt(meeting.scheduledAt, rangeEnd)
        )
      ),
    db
      .select({
        id: coffeeChat.id,
        scheduledAt: coffeeChat.scheduledAt,
        companyName: company.name,
        memberId: coffeeChatAttendee.memberId,
      })
      .from(coffeeChat)
      .innerJoin(coffeeChatAttendee, eq(coffeeChatAttendee.coffeeChatId, coffeeChat.id))
      .innerJoin(application, eq(coffeeChat.applicationId, application.id))
      .innerJoin(company, eq(application.companyId, company.id))
      .where(
        and(
          eq(coffeeChat.orgId, org.id),
          isNull(coffeeChat.happenedAt),
          gte(coffeeChat.scheduledAt, new Date(rangeStart.getTime() - COFFEE_CHAT_MINUTES * MINUTE)),
          lt(coffeeChat.scheduledAt, rangeEnd)
        )
      ),
    db
      .select({ memberId: coffeeChatAttendee.memberId, n: sql<number>`count(*)::int` })
      .from(coffeeChatAttendee)
      .innerJoin(coffeeChat, eq(coffeeChatAttendee.coffeeChatId, coffeeChat.id))
      .where(
        and(
          eq(coffeeChat.orgId, org.id),
          or(gte(coffeeChat.happenedAt, loadSince), and(isNull(coffeeChat.happenedAt), gte(coffeeChat.scheduledAt, loadSince)))
        )
      )
      .groupBy(coffeeChatAttendee.memberId),
  ]);

  const events: EngineEvent[] = meetings
    .filter((m) => m.id !== opts.excludeMeetingId)
    .map((m) => ({
      id: m.id,
      kind: "meeting" as const,
      title: m.title,
      start: m.scheduledAt.getTime(),
      end: m.scheduledAt.getTime() + m.durationMinutes * MINUTE,
      memberIds: "all" as const,
    }));
  const chatEvents = new Map<string, EngineEvent & { memberIds: string[] }>();
  for (const c of chats) {
    if (!c.scheduledAt) continue;
    const existing = chatEvents.get(c.id);
    if (existing) existing.memberIds.push(c.memberId);
    else
      chatEvents.set(c.id, {
        id: c.id,
        kind: "coffee_chat",
        title: c.companyName,
        start: c.scheduledAt.getTime(),
        end: c.scheduledAt.getTime() + COFFEE_CHAT_MINUTES * MINUTE,
        memberIds: [c.memberId],
      });
  }

  return {
    timeZone: org.timezone,
    window: {
      dayStartMinute: scheduling.dayStartMinute,
      dayEndMinute: Math.max(scheduling.dayEndMinute, scheduling.dayStartMinute + 60),
      weekends: scheduling.weekends,
    },
    terms: scheduling.terms,
    members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
    blocks,
    confirmations,
    events: [...events, ...chatEvents.values()],
    load: Object.fromEntries(recentChats.map((r) => [r.memberId, r.n])),
    now: opts.now.getTime(),
  };
}

/** Today in the club's timezone. */
export function clubToday(org: Pick<Org, "timezone">, now: Date = new Date()): IsoDay {
  return zonedParts(now, org.timezone).day;
}
