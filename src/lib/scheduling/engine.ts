import type { AvailabilityKind, MemberRole } from "@/db/schema";
import type { ScheduleBlock } from "./blocks";
import { termForDate, type Term } from "./terms";
import { dayMapper, eachDay, MINUTE, weekdayOf, zonedParts, type IsoDay } from "./time";

/**
 * The scheduler. Everyone's weekly class schedule is already on file, so
 * finding a time is arithmetic, not a poll: lay each member's term blocks on
 * real dates, add what is already on the club calendar, and read off the gaps.
 *
 * Three questions, three entry points:
 *   findGroupTimes  — "these people": when are they all free?
 *   whoIsFree       — "this time, N people": who can make it, and which N?
 *   findTimesForN   — "N people, sometime this week": the best (time, people) pairs.
 *
 * A member with no schedule for the term is UNKNOWN, never free: they are
 * reported separately and only counted when the caller opts in.
 *
 * Pure: no database, no clock (callers pass `now`), no I/O.
 */

// ——— Input ———

export type EngineMember = { id: string; name: string; role: MemberRole };

export type EngineBlock = ScheduleBlock & { memberId: string; termKey: string };

/** Something already on the club calendar. */
export type EngineEvent = {
  id: string;
  kind: "meeting" | "coffee_chat";
  title: string;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  /** A club meeting is busy for every member; a coffee chat for its attendees. */
  memberIds: readonly string[] | "all";
};

export type EngineInput = {
  timeZone: string;
  window: { dayStartMinute: number; dayEndMinute: number; weekends: boolean };
  terms: readonly Term[];
  members: readonly EngineMember[];
  blocks: readonly EngineBlock[];
  /** Members who said "this is my schedule" for a term — including an empty one. */
  confirmations: readonly { memberId: string; termKey: string }[];
  events: readonly EngineEvent[];
  /** Recent scheduling load per member (coffee chats in the last month and upcoming). */
  load: Readonly<Record<string, number>>;
  /** Epoch milliseconds. */
  now: number;
  /** Travel time kept clear either side of a class. Default 10. */
  bufferMinutes?: number;
  /** Nothing is suggested sooner than this from now. Default 60. */
  minLeadMinutes?: number;
};

export const SLOT_STEP_MINUTES = 15;
export const DEFAULT_BUFFER_MINUTES = 10;
const EDGE_MINUTES = 30;
const BACK_TO_BACK_MINUTES = 15;

// ——— Calendars ———

export type CommitmentKind = Exclude<AvailabilityKind, "prefer_not"> | "meeting" | "coffee_chat";

export type Commitment = {
  /** Busy interval including travel buffer, epoch ms. */
  start: number;
  end: number;
  /** The commitment itself, without buffer. */
  rawStart: number;
  rawEnd: number;
  kind: CommitmentKind;
  label: string | null;
};

type MemberCalendar = {
  hard: Commitment[];
  soft: { start: number; end: number }[];
  /** Days on which we have no schedule for this member. */
  unknownDays: Set<IsoDay>;
};

type SearchDay = { day: IsoDay; at: (minute: number) => number; term: Term | null };

export type Calendars = {
  days: SearchDay[];
  byMember: Map<string, MemberCalendar>;
};

function hasScheduleIndex(input: EngineInput): Set<string> {
  const known = new Set<string>();
  for (const c of input.confirmations) known.add(`${c.memberId}|${c.termKey}`);
  for (const b of input.blocks) known.add(`${b.memberId}|${b.termKey}`);
  return known;
}

/**
 * Lay every member's commitments onto the days from `fromDay` to `toDay`.
 * A day inside a term uses that term's blocks; a day between terms has no
 * classes, so members are known and only calendar events count. A club with
 * no terms at all has no schedules to trust, so everyone is unknown.
 */
export function buildCalendars(input: EngineInput, fromDay: IsoDay, toDay: IsoDay): Calendars {
  const buffer = (input.bufferMinutes ?? DEFAULT_BUFFER_MINUTES) * MINUTE;
  const allDays: SearchDay[] = eachDay(fromDay, toDay).map((day) => ({
    day,
    at: dayMapper(day, input.timeZone),
    term: termForDate(input.terms, day),
  }));
  const known = hasScheduleIndex(input);
  const byMember = new Map<string, MemberCalendar>();
  for (const m of input.members) byMember.set(m.id, { hard: [], soft: [], unknownDays: new Set() });

  const blocksByKey = new Map<string, EngineBlock[]>();
  for (const b of input.blocks) {
    const key = `${b.memberId}|${b.termKey}|${b.dayOfWeek}`;
    const list = blocksByKey.get(key);
    if (list) list.push(b);
    else blocksByKey.set(key, [b]);
  }

  for (const d of allDays) {
    const weekday = weekdayOf(d.day);
    for (const m of input.members) {
      const cal = byMember.get(m.id)!;
      if (!d.term) {
        if (input.terms.length === 0) cal.unknownDays.add(d.day);
        continue;
      }
      if (!known.has(`${m.id}|${d.term.key}`)) {
        cal.unknownDays.add(d.day);
        continue;
      }
      for (const b of blocksByKey.get(`${m.id}|${d.term.key}|${weekday}`) ?? []) {
        const rawStart = d.at(b.startMinute);
        const rawEnd = d.at(b.endMinute);
        if (b.kind === "prefer_not") {
          cal.soft.push({ start: rawStart, end: rawEnd });
        } else {
          const pad = b.kind === "class" ? buffer : 0;
          cal.hard.push({ start: rawStart - pad, end: rawEnd + pad, rawStart, rawEnd, kind: b.kind, label: b.label });
        }
      }
    }
  }

  const rangeStart = allDays[0]?.at(0) ?? 0;
  const rangeEnd = allDays.length > 0 ? allDays[allDays.length - 1].at(1440) : 0;
  for (const ev of input.events) {
    if (ev.end <= rangeStart || ev.start >= rangeEnd) continue;
    const ids = ev.memberIds === "all" ? input.members.map((m) => m.id) : ev.memberIds;
    for (const id of ids) {
      byMember.get(id)?.hard.push({
        start: ev.start,
        end: ev.end,
        rawStart: ev.start,
        rawEnd: ev.end,
        kind: ev.kind,
        label: ev.title,
      });
    }
  }
  for (const cal of byMember.values()) cal.hard.sort((a, b) => a.start - b.start);

  const days = allDays.filter((d) => {
    const weekday = weekdayOf(d.day);
    return input.window.weekends || (weekday !== 0 && weekday !== 6);
  });
  return { days, byMember };
}

// ——— One member at one time ———

export type Presence = {
  memberId: string;
  /** `maybe`: no schedule on file, nothing on the club calendar, and the caller opted in. */
  state: "free" | "maybe" | "busy" | "unknown";
  /** Free, but inside a "prefer not" block. */
  soft: boolean;
  /** The commitment in the way, when busy. */
  conflict: Commitment | null;
  /** Free, but wedged between two commitments with no break. */
  stranded: boolean;
};

function presenceOf(
  memberId: string,
  cal: MemberCalendar | undefined,
  day: IsoDay,
  start: number,
  end: number,
  includeUnknown: boolean
): Presence {
  if (!cal) return { memberId, state: "unknown", soft: false, conflict: null, stranded: false };
  const conflict = cal.hard.find((c) => c.start < end && c.end > start) ?? null;
  if (conflict) return { memberId, state: "busy", soft: false, conflict, stranded: false };
  if (cal.unknownDays.has(day)) {
    return { memberId, state: includeUnknown ? "maybe" : "unknown", soft: false, conflict: null, stranded: false };
  }
  const gap = BACK_TO_BACK_MINUTES * MINUTE;
  const before = cal.hard.some((c) => c.rawEnd <= start && c.rawEnd > start - gap);
  const after = cal.hard.some((c) => c.rawStart >= end && c.rawStart < end + gap);
  return {
    memberId,
    state: "free",
    soft: cal.soft.some((s) => s.start < end && s.end > start),
    conflict: null,
    stranded: before && after,
  };
}

const canAttend = (p: Presence) => p.state === "free" || p.state === "maybe";

// ——— Slots ———

type Candidate = { day: IsoDay; minute: number; start: number; end: number };

function* candidates(input: EngineInput, cals: Calendars, durationMinutes: number): Generator<Candidate> {
  const earliest = input.now + (input.minLeadMinutes ?? 60) * MINUTE;
  const { dayStartMinute, dayEndMinute } = input.window;
  for (const d of cals.days) {
    for (let minute = dayStartMinute; minute + durationMinutes <= dayEndMinute; minute += SLOT_STEP_MINUTES) {
      const start = d.at(minute);
      if (start < earliest) continue;
      yield { day: d.day, minute, start, end: start + durationMinutes * MINUTE };
    }
  }
}

/** Lower is better: awkward hours, people left without a break, odd start times. */
function awkwardness(input: EngineInput, minute: number, durationMinutes: number, stranded: number): number {
  const { dayStartMinute, dayEndMinute } = input.window;
  const edge = minute < dayStartMinute + EDGE_MINUTES || minute + durationMinutes > dayEndMinute - EDGE_MINUTES;
  const round = minute % 60 === 0 ? 0 : minute % 30 === 0 ? 1 : 2;
  return (edge ? 100 : 0) + stranded * 10 + round;
}

export type MissingMember = { memberId: string; reason: "busy" | "unknown" };

export type SlotOption = {
  day: IsoDay;
  /** The suggested start, minutes from local midnight, and as an instant. */
  startMinute: number;
  start: number;
  end: number;
  durationMinutes: number;
  /**
   * The stretch this suggestion stands for: any start from `windowStart` that
   * ends by `windowEnd` works for the same people.
   */
  windowStart: number;
  windowEnd: number;
  available: string[];
  /** Counted as possibly free: no schedule on file. Subset of `available`. */
  maybe: string[];
  missing: MissingMember[];
  /** Available, but would rather not. Subset of `available`. */
  reluctant: string[];
};

type Scored<T extends SlotOption> = { option: T; signature: string; lastMinute: number; penalty: number };

/** Fold consecutive start times that work for the same people into one window. */
function collapse<T extends SlotOption>(
  rows: { option: T; signature: string; penalty: number }[]
): Scored<T>[] {
  const out: Scored<T>[] = [];
  for (const row of rows) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.option.day === row.option.day &&
      prev.signature === row.signature &&
      row.option.startMinute === prev.lastMinute + SLOT_STEP_MINUTES
    ) {
      prev.lastMinute = row.option.startMinute;
      const windowStart = prev.option.windowStart;
      const windowEnd = row.option.startMinute + row.option.durationMinutes;
      // Keep the least awkward start as the one we suggest.
      if (row.penalty < prev.penalty) {
        prev.option = { ...row.option, windowStart, windowEnd };
        prev.penalty = row.penalty;
      } else {
        prev.option = { ...prev.option, windowEnd };
      }
    } else {
      out.push({ ...row, lastMinute: row.option.startMinute });
    }
  }
  return out;
}

/** The best few overall (at most two a day, so one good afternoon cannot fill the list). */
function pickBest<T>(sorted: T[], dayOf: (t: T) => IsoDay, limit: number, perDay: number, apart?: (a: T, b: T) => boolean): T[] {
  const picked: T[] = [];
  const perDayCount = new Map<IsoDay, number>();
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const day = dayOf(item);
    if ((perDayCount.get(day) ?? 0) >= perDay) continue;
    if (apart && picked.some((p) => dayOf(p) === day && !apart(p, item))) continue;
    picked.push(item);
    perDayCount.set(day, (perDayCount.get(day) ?? 0) + 1);
  }
  return picked;
}

function unknownIn(cals: Calendars, memberIds: readonly string[]): string[] {
  return memberIds.filter((id) => {
    const cal = cals.byMember.get(id);
    return !cal || cals.days.some((d) => cal.unknownDays.has(d.day));
  });
}

// ——— Mode A: these people ———

export type GroupQuery = {
  memberIds: readonly string[];
  durationMinutes: number;
  fromDay: IsoDay;
  toDay: IsoDay;
  /** Count members with no schedule as possibly free. Default false. */
  includeUnknown?: boolean;
};

export type GroupTimes = {
  /**
   * How many people the suggestions account for: the group, minus members
   * with no schedule unless `includeUnknown`.
   */
  considered: number;
  /** True when at least one slot has everyone considered. */
  everyoneFree: boolean;
  /** The best few across the whole range, best first. */
  best: SlotOption[];
  /** Up to three per day, in date order; includes the `best` ones. */
  byDay: { day: IsoDay; options: SlotOption[] }[];
  /** Members with no schedule on file for some day searched. */
  unknown: string[];
};

export const BEST_OVERALL = 5;
export const BEST_PER_DAY = 3;

export function findGroupTimes(input: EngineInput, query: GroupQuery): GroupTimes {
  const cals = buildCalendars(input, query.fromDay, query.toDay);
  const includeUnknown = query.includeUnknown ?? false;
  const memberIds = [...new Set(query.memberIds)].filter((id) => cals.byMember.has(id));
  const unknown = unknownIn(cals, memberIds);

  const rows: { option: SlotOption; signature: string; penalty: number }[] = [];
  let mostAvailable = 0;
  for (const c of candidates(input, cals, query.durationMinutes)) {
    const presences = memberIds.map((id) => presenceOf(id, cals.byMember.get(id), c.day, c.start, c.end, includeUnknown));
    const available = presences.filter(canAttend);
    if (available.length === 0) continue;
    mostAvailable = Math.max(mostAvailable, available.length);
    const option: SlotOption = {
      day: c.day,
      startMinute: c.minute,
      start: c.start,
      end: c.end,
      durationMinutes: query.durationMinutes,
      windowStart: c.minute,
      windowEnd: c.minute + query.durationMinutes,
      available: available.map((p) => p.memberId),
      maybe: available.filter((p) => p.state === "maybe").map((p) => p.memberId),
      // Without the opt-in, a member with no schedule is left out of the count rather than called busy.
      missing: presences
        .filter((p) => p.state === "busy" || (p.state === "unknown" && includeUnknown))
        .map((p) => ({ memberId: p.memberId, reason: p.state === "busy" ? ("busy" as const) : ("unknown" as const) })),
      reluctant: available.filter((p) => p.soft).map((p) => p.memberId),
    };
    rows.push({
      option,
      signature: `${option.available.join(",")}|${option.reluctant.join(",")}`,
      penalty: awkwardness(input, c.minute, query.durationMinutes, available.filter((p) => p.stranded).length),
    });
  }

  // When nobody-missing slots exist they are the answer. Otherwise show the
  // best attendance and one short of it; "2 of 6" is noise.
  const floor = Math.max(1, mostAvailable - 1);
  const windows = collapse(rows.filter((r) => r.option.missing.length === 0 || r.option.available.length >= floor));
  const full = windows.filter((w) => w.option.missing.length === 0);
  const pool = full.length > 0 ? full : windows;
  const ranked = [...pool].sort(
    (a, b) =>
      b.option.available.length - a.option.available.length ||
      a.option.reluctant.length - b.option.reluctant.length ||
      a.option.maybe.length - b.option.maybe.length ||
      a.option.day.localeCompare(b.option.day) ||
      a.penalty - b.penalty ||
      a.option.startMinute - b.option.startMinute
  );

  const best = pickBest(ranked, (w) => w.option.day, BEST_OVERALL, 2).map((w) => w.option);
  const byDayMap = new Map<IsoDay, SlotOption[]>();
  for (const w of ranked) {
    const list = byDayMap.get(w.option.day) ?? [];
    if (list.length < BEST_PER_DAY) byDayMap.set(w.option.day, [...list, w.option]);
  }
  const byDay = [...byDayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, options]) => ({ day, options: options.sort((a, b) => a.startMinute - b.startMinute) }));

  return {
    considered: includeUnknown ? memberIds.length : memberIds.length - unknown.length,
    everyoneFree: full.length > 0,
    best,
    byDay,
    unknown,
  };
}

// ——— Mode B: this time, N people ———

export type Pick = {
  memberId: string;
  /** Why this person: "owns this application", "fewest chats this month". */
  reason: string;
};

export type Combination = {
  picks: Pick[];
  /** For an alternate: who was swapped in for whom, relative to the first combination. */
  swap: { in: string; out: string } | null;
  /** Set when `requirePartner` could not be met. */
  noPartner: boolean;
};

export type TeamQuery = {
  /** Who may be picked. */
  pool: readonly string[];
  /** Always in the group (the person scheduling, members already chosen). */
  required?: readonly string[];
  /** Group size, including `required`. */
  n: number;
  /** Preferred when free — usually the application's owner. */
  ownerId?: string | null;
  /** Keep at least one partner or admin in the group when one is free. */
  requirePartner?: boolean;
  includeUnknown?: boolean;
};

export type WhoIsFree = {
  day: IsoDay;
  startMinute: number;
  presences: Presence[];
  /** The suggested group first, then alternates that each swap one person. Empty when fewer than N can make it. */
  combinations: Combination[];
  /** How many of the pool (and required) can make it. */
  availableCount: number;
};

export const MAX_COMBINATIONS = 5;

const isSenior = (role: MemberRole) => role === "partner" || role === "admin";

type Ranked = { presence: Presence; member: EngineMember; load: number };

function chatWord(n: number): string {
  return n === 1 ? "1 chat this month" : `${n} chats this month`;
}

/**
 * Choose N from the people who can make a slot. Fairness first: the owner if
 * they are free, then whoever has done the least lately, so the same three
 * people do not take every coffee chat. Returns the group plus alternates
 * that each trade the last seat for the next person in line.
 */
function combine(input: EngineInput, presences: Presence[], query: TeamQuery): Combination[] {
  const members = new Map(input.members.map((m) => [m.id, m]));
  const byId = new Map(presences.map((p) => [p.memberId, p]));
  const required = [...new Set(query.required ?? [])];
  if (required.some((id) => !byId.get(id) || !canAttend(byId.get(id)!))) return [];
  const seats = query.n - required.length;

  const ranked: Ranked[] = [...new Set(query.pool)]
    .filter((id) => !required.includes(id))
    .flatMap((id) => {
      const presence = byId.get(id);
      const member = members.get(id);
      return presence && member && canAttend(presence) ? [{ presence, member, load: input.load[id] ?? 0 }] : [];
    })
    .sort(
      (a, b) =>
        Number(b.member.id === query.ownerId) - Number(a.member.id === query.ownerId) ||
        Number(a.presence.soft) - Number(b.presence.soft) ||
        Number(a.presence.state === "maybe") - Number(b.presence.state === "maybe") ||
        a.load - b.load ||
        a.member.name.localeCompare(b.member.name)
    );
  if (seats < 0 || ranked.length < seats) return [];

  const minLoad = ranked.reduce((min, r) => Math.min(min, r.load), Infinity);
  const requiredSenior = required.some((id) => isSenior(members.get(id)?.role ?? "analyst"));
  const needSenior = Boolean(query.requirePartner) && !requiredSenior && seats > 0;

  const reasonFor = (r: Ranked, forPartner: boolean): string => {
    if (r.member.id === query.ownerId) return "owns this application";
    if (forPartner) return r.member.role === "admin" ? "admin, to have a partner in the room" : "partner";
    if (r.presence.state === "maybe") return "no schedule on file";
    if (r.presence.soft) return "free, but would rather not";
    if (r.load === minLoad) return r.load === 0 ? "no chats this month" : "fewest chats this month";
    return chatWord(r.load);
  };

  /** Fill the seats from `order`, then make room for a partner if one is needed and free. */
  const build = (order: Ranked[]): { chosen: Ranked[]; seniorSeat: Ranked | null; noPartner: boolean } => {
    const chosen = order.slice(0, seats);
    if (!needSenior || chosen.some((r) => isSenior(r.member.role))) return { chosen, seniorSeat: null, noPartner: false };
    const senior = order.slice(seats).find((r) => isSenior(r.member.role));
    if (!senior) return { chosen, seniorSeat: null, noPartner: true };
    // Give up the last seat that is not the owner's.
    const index = chosen.findLastIndex((r) => r.member.id !== query.ownerId);
    if (index < 0) return { chosen, seniorSeat: null, noPartner: true };
    const next = [...chosen];
    next[index] = senior;
    return { chosen: next, seniorSeat: senior, noPartner: false };
  };

  const toCombination = (
    built: ReturnType<typeof build>,
    swap: Combination["swap"]
  ): Combination => ({
    picks: [
      ...required.map((id) => ({ memberId: id, reason: "already chosen" })),
      ...built.chosen.map((r) => ({ memberId: r.member.id, reason: reasonFor(r, r === built.seniorSeat) })),
    ],
    swap,
    noPartner: built.noPartner,
  });

  const first = build(ranked);
  const combinations = [toCombination(first, null)];
  if (seats === 0) return combinations;

  // Alternates: the weakest seat goes to each next person in line, in turn.
  const firstIds = new Set(first.chosen.map((r) => r.member.id));
  const seatIndex = first.chosen.findLastIndex((r) => r.member.id !== query.ownerId && r !== first.seniorSeat);
  const out = seatIndex >= 0 ? first.chosen[seatIndex] : null;
  if (!out) return combinations;
  for (const candidate of ranked) {
    if (combinations.length >= MAX_COMBINATIONS) break;
    if (firstIds.has(candidate.member.id)) continue;
    const chosen = [...first.chosen];
    chosen[seatIndex] = candidate;
    const lostSenior = needSenior && !first.noPartner && !chosen.some((r) => isSenior(r.member.role));
    if (lostSenior) continue;
    combinations.push(
      toCombination(
        { chosen, seniorSeat: first.seniorSeat, noPartner: first.noPartner },
        { in: candidate.member.id, out: out.member.id }
      )
    );
  }
  return combinations;
}

export function whoIsFree(
  input: EngineInput,
  query: TeamQuery & { start: number; durationMinutes: number }
): WhoIsFree {
  const local = zonedParts(query.start, input.timeZone);
  const end = query.start + query.durationMinutes * MINUTE;
  const endDay = zonedParts(end, input.timeZone).day;
  const cals = buildCalendars(input, local.day, endDay);
  const ids = [...new Set([...(query.required ?? []), ...query.pool])].filter((id) => cals.byMember.has(id));
  const presences = ids.map((id) =>
    presenceOf(id, cals.byMember.get(id), local.day, query.start, end, query.includeUnknown ?? false)
  );
  return {
    day: local.day,
    startMinute: local.minute,
    presences,
    combinations: combine(input, presences, query),
    availableCount: presences.filter(canAttend).length,
  };
}

// ——— Mode C: N people, sometime in a range ———

export type TeamOption = SlotOption & {
  combination: Combination;
  /** Others who could also make this time, best first. */
  alsoFree: string[];
};

export type TeamTimes = {
  options: TeamOption[];
  unknown: string[];
  /** People who can be picked from, after leaving out unknowns. */
  considered: number;
};

export type TeamRangeQuery = TeamQuery & { durationMinutes: number; fromDay: IsoDay; toDay: IsoDay };

export const MAX_TEAM_OPTIONS = 5;
/** Two suggestions on the same day are at least this far apart. */
const DISTINCT_MINUTES = 120;

export function findTimesForN(input: EngineInput, query: TeamRangeQuery): TeamTimes {
  const cals = buildCalendars(input, query.fromDay, query.toDay);
  const includeUnknown = query.includeUnknown ?? false;
  const ids = [...new Set([...(query.required ?? []), ...query.pool])].filter((id) => cals.byMember.has(id));
  const unknown = unknownIn(cals, ids);

  type Row = { option: TeamOption; signature: string; penalty: number; rank: number[] };
  const rows: Row[] = [];
  for (const c of candidates(input, cals, query.durationMinutes)) {
    const presences = ids.map((id) => presenceOf(id, cals.byMember.get(id), c.day, c.start, c.end, includeUnknown));
    const [combination] = combine(input, presences, query);
    if (!combination) continue;
    const byId = new Map(presences.map((p) => [p.memberId, p]));
    const picked = combination.picks.map((p) => byId.get(p.memberId)!);
    const pickedIds = new Set(combination.picks.map((p) => p.memberId));
    const reluctant = picked.filter((p) => p.soft).map((p) => p.memberId);
    const maybe = picked.filter((p) => p.state === "maybe").map((p) => p.memberId);
    const option: TeamOption = {
      day: c.day,
      startMinute: c.minute,
      start: c.start,
      end: c.end,
      durationMinutes: query.durationMinutes,
      windowStart: c.minute,
      windowEnd: c.minute + query.durationMinutes,
      available: [...pickedIds],
      maybe,
      missing: [],
      reluctant,
      combination,
      alsoFree: presences.filter((p) => canAttend(p) && !pickedIds.has(p.memberId)).map((p) => p.memberId),
    };
    const penalty = awkwardness(input, c.minute, query.durationMinutes, picked.filter((p) => p.stranded).length);
    rows.push({
      option,
      signature: `${[...pickedIds].sort().join(",")}|${reluctant.join(",")}|${maybe.join(",")}`,
      penalty,
      rank: [
        reluctant.length,
        maybe.length,
        query.ownerId && !pickedIds.has(query.ownerId) ? 1 : 0,
        combination.noPartner ? 1 : 0,
      ],
    });
  }

  const rankOf = new Map(rows.map((r) => [`${r.option.day}|${r.option.startMinute}`, r.rank]));
  const windows = collapse(rows).sort((a, b) => {
    const ra = rankOf.get(`${a.option.day}|${a.option.startMinute}`)!;
    const rb = rankOf.get(`${b.option.day}|${b.option.startMinute}`)!;
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return (
      a.option.day.localeCompare(b.option.day) || a.penalty - b.penalty || a.option.startMinute - b.option.startMinute
    );
  });

  const options = pickBest(
    windows,
    (w) => w.option.day,
    MAX_TEAM_OPTIONS,
    2,
    (a, b) => Math.abs(a.option.startMinute - b.option.startMinute) >= DISTINCT_MINUTES
  ).map((w) => w.option);

  return {
    options,
    unknown,
    considered: includeUnknown ? ids.length : ids.length - unknown.length,
  };
}

// ——— The week at a glance ———

export type Heatmap = {
  /** Start minute of each row. */
  rows: number[];
  stepMinutes: number;
  days: { day: IsoDay; busy: number[] }[];
  /** Members with a schedule, i.e. the denominator. */
  known: number;
  unknown: string[];
};

/** How many of the group are busy in each half hour of each day. */
export function busyHeatmap(
  input: EngineInput,
  query: { memberIds: readonly string[]; fromDay: IsoDay; toDay: IsoDay; stepMinutes?: number }
): Heatmap {
  const step = query.stepMinutes ?? 30;
  const cals = buildCalendars(input, query.fromDay, query.toDay);
  const memberIds = [...new Set(query.memberIds)].filter((id) => cals.byMember.has(id));
  const unknown = unknownIn(cals, memberIds);
  const knownIds = memberIds.filter((id) => !unknown.includes(id));
  const rows: number[] = [];
  for (let m = input.window.dayStartMinute; m < input.window.dayEndMinute; m += step) rows.push(m);
  const days = cals.days.map((d) => ({
    day: d.day,
    busy: rows.map((minute) => {
      const start = d.at(minute);
      const end = d.at(Math.min(minute + step, 1440));
      return knownIds.filter((id) => cals.byMember.get(id)!.hard.some((c) => c.rawStart < end && c.rawEnd > start))
        .length;
    }),
  }));
  return { rows, stepMinutes: step, days, known: knownIds.length, unknown };
}
