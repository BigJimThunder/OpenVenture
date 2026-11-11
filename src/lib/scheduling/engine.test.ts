import { describe, expect, it } from "vitest";
import {
  busyHeatmap,
  findGroupTimes,
  findTimesForN,
  whoIsFree,
  type EngineBlock,
  type EngineEvent,
  type EngineInput,
  type EngineMember,
} from "./engine";
import { attendanceLabel, conflictPhrase, founderMessage, nameList, slotWindow } from "./format";
import { zonedToUtc } from "./time";

const NY = "America/New_York";
const fall = { key: "2026-fall", name: "Fall 2026", start: "2026-08-25", end: "2026-12-12" };
const at = (h: number, m = 0) => h * 60 + m;
const instant = (day: string, minute: number) => zonedToUtc(day, minute, NY);

const people: EngineMember[] = [
  { id: "ana", name: "Ana Ruiz", role: "analyst" },
  { id: "ben", name: "Ben Ito", role: "analyst" },
  { id: "cat", name: "Cat Moss", role: "partner" },
  { id: "dev", name: "Dev Shah", role: "analyst" },
  { id: "eli", name: "Eli Park", role: "admin" },
];

function block(memberId: string, days: number[], start: number, end: number, extra: Partial<EngineBlock> = {}): EngineBlock[] {
  return days.map((dayOfWeek) => ({
    memberId,
    termKey: fall.key,
    dayOfWeek,
    startMinute: start,
    endMinute: end,
    kind: "class",
    label: null,
    ...extra,
  }));
}

/** Wednesday 2026-11-11, 7 AM in New York. Window 9–5 so cases stay small. */
function input(over: Partial<EngineInput> = {}): EngineInput {
  return {
    timeZone: NY,
    window: { dayStartMinute: at(9), dayEndMinute: at(17), weekends: false },
    terms: [fall],
    members: people,
    blocks: [],
    confirmations: people.map((p) => ({ memberId: p.id, termKey: fall.key })),
    events: [],
    load: {},
    now: instant("2026-11-11", at(7)),
    ...over,
  };
}

const WED = "2026-11-11";
const THU = "2026-11-12";
const FRI = "2026-11-13";

describe("findGroupTimes — these people", () => {
  it("offers the whole window when nobody has anything on", () => {
    const res = findGroupTimes(input(), { memberIds: ["ana", "ben"], durationMinutes: 30, fromDay: WED, toDay: WED });
    expect(res.everyoneFree).toBe(true);
    expect(res.best).toHaveLength(1);
    expect(res.best[0]).toMatchObject({ day: WED, windowStart: at(9), windowEnd: at(17), available: ["ana", "ben"] });
    // Suggests a civil hour away from the edges of the day, not 9:00 sharp.
    expect(res.best[0].startMinute).toBe(at(10));
  });

  it("subtracts classes, with travel time either side", () => {
    const res = findGroupTimes(
      input({ blocks: [...block("ana", [3], at(10), at(11)), ...block("ben", [3], at(13), at(14), { kind: "busy" })] }),
      { memberIds: ["ana", "ben"], durationMinutes: 60, fromDay: WED, toDay: WED }
    );
    const windows = res.byDay[0].options.map((o) => [o.windowStart, o.windowEnd]);
    // Ana's class is padded 10 minutes, so the 15-minute grid resumes at 11:15;
    // Ben's job has no padding. Before Ana's class only 9:00–9:45 start would fit — none on the grid ends by 9:50 with 60 min.
    expect(windows).toEqual([
      [at(11, 15), at(13)],
      [at(14), at(17)],
    ]);
  });

  it("collapses adjacent starts into one range and describes it", () => {
    const res = findGroupTimes(input({ blocks: block("ana", [3], at(9), at(14)) }), {
      memberIds: ["ana", "ben"],
      durationMinutes: 30,
      fromDay: WED,
      toDay: WED,
    });
    expect(res.best).toHaveLength(1);
    expect(slotWindow(res.best[0])).toBe("2:15–5:00 PM, any 30 minutes");
  });

  it("never suggests a time that has passed or is inside the lead time", () => {
    const res = findGroupTimes(input({ now: instant(WED, at(14, 5)) }), {
      memberIds: ["ana"],
      durationMinutes: 30,
      fromDay: WED,
      toDay: WED,
    });
    expect(res.best[0].windowStart).toBe(at(15, 15));
  });

  it("skips weekends unless the club allows them", () => {
    const q = { memberIds: ["ana"], durationMinutes: 60, fromDay: "2026-11-14", toDay: "2026-11-15" };
    expect(findGroupTimes(input(), q).best).toEqual([]);
    const open = findGroupTimes(input({ window: { dayStartMinute: at(9), dayEndMinute: at(17), weekends: true } }), q);
    expect(open.byDay.map((d) => d.day)).toEqual(["2026-11-14", "2026-11-15"]);
  });

  it("counts club meetings for everyone and coffee chats for their attendees", () => {
    const events: EngineEvent[] = [
      { id: "m", kind: "meeting", title: "General meeting", start: instant(WED, at(9)), end: instant(WED, at(12)), memberIds: "all" },
      { id: "c", kind: "coffee_chat", title: "Acme", start: instant(WED, at(12)), end: instant(WED, at(16)), memberIds: ["ben"] },
    ];
    const res = findGroupTimes(input({ events }), { memberIds: ["ana", "ben"], durationMinutes: 30, fromDay: WED, toDay: WED });
    expect(res.best[0]).toMatchObject({ windowStart: at(16), windowEnd: at(17) });
    const solo = findGroupTimes(input({ events }), { memberIds: ["ana"], durationMinutes: 30, fromDay: WED, toDay: WED });
    expect(solo.best[0]).toMatchObject({ windowStart: at(12), windowEnd: at(17) });
  });

  it("prefers a slot nobody would rather avoid, then the sooner day", () => {
    const blocks = [
      ...block("ana", [3], at(9), at(17), { kind: "prefer_not" }),
      ...block("ben", [4], at(9), at(15)),
    ];
    const res = findGroupTimes(input({ blocks }), { memberIds: ["ana", "ben"], durationMinutes: 60, fromDay: WED, toDay: FRI });
    expect(res.best.map((o) => [o.day, o.reluctant.length])).toEqual([
      [THU, 0],
      [FRI, 0],
      [WED, 1],
    ]);
    expect(res.best[2].reluctant).toEqual(["ana"]);
  });

  it("when no time fits everyone, shows the best attendance and who is missing", () => {
    const blocks = [
      ...block("ana", [3], at(9), at(13)),
      ...block("ben", [3], at(12), at(17)),
      ...block("cat", [3], at(9), at(17)),
    ];
    const res = findGroupTimes(input({ blocks }), {
      memberIds: ["ana", "ben", "cat", "dev"],
      durationMinutes: 60,
      fromDay: WED,
      toDay: WED,
    });
    expect(res.everyoneFree).toBe(false);
    expect(res.best[0].available).toHaveLength(2);
    expect(res.best[0].missing).toContainEqual({ memberId: "cat", reason: "busy" });
    const names = (id: string) => people.find((p) => p.id === id)!.name;
    expect(attendanceLabel(res.best[0], names)).toMatch(/^2 of 4, without /);
  });

  it("returns only full-attendance slots when any exist", () => {
    const res = findGroupTimes(input({ blocks: block("ana", [3], at(9), at(15)) }), {
      memberIds: ["ana", "ben"],
      durationMinutes: 30,
      fromDay: WED,
      toDay: THU,
    });
    expect(res.byDay.flatMap((d) => d.options).every((o) => o.missing.length === 0)).toBe(true);
  });

  it("caps the list: five overall, two of them at most from one day, three per day", () => {
    // Classes on the hour leave four separate half-hour gaps every day.
    const blocks = [10, 11, 13, 15].flatMap((h) => block("ana", [1, 2, 3, 4, 5], at(h), at(h, 20)));
    const res = findGroupTimes(input({ blocks }), { memberIds: ["ana"], durationMinutes: 30, fromDay: WED, toDay: "2026-11-20" });
    expect(res.best).toHaveLength(5);
    const perDay = new Map<string, number>();
    for (const o of res.best) perDay.set(o.day, (perDay.get(o.day) ?? 0) + 1);
    expect(Math.max(...perDay.values())).toBe(2);
    expect(res.byDay.every((d) => d.options.length <= 3)).toBe(true);
    expect(res.byDay.length).toBeGreaterThan(5);
  });

  it("avoids stranding someone between back-to-back commitments", () => {
    // Ana: class to 11:50, class from 13:10. The 12:00 hour leaves her no break; later is clear.
    const blocks = [...block("ana", [3], at(11), at(11, 50)), ...block("ana", [3], at(13, 10), at(14))];
    const res = findGroupTimes(input({ blocks, window: { dayStartMinute: at(11), dayEndMinute: at(16), weekends: false } }), {
      memberIds: ["ana"],
      durationMinutes: 60,
      fromDay: WED,
      toDay: WED,
    });
    expect(res.best[0].startMinute).toBe(at(14, 30));
  });

  describe("members without a schedule", () => {
    const unconfirmed = input({ confirmations: [{ memberId: "ana", termKey: fall.key }], blocks: block("ben", [3], at(9), at(17)) });

    it("treats them as unknown, not free", () => {
      const res = findGroupTimes(unconfirmed, { memberIds: ["ana", "cat"], durationMinutes: 30, fromDay: WED, toDay: WED });
      expect(res.unknown).toEqual(["cat"]);
      expect(res.considered).toBe(1);
      expect(res.best[0].available).toEqual(["ana"]);
      expect(res.best[0].missing).toEqual([]);
    });

    it("counts someone as known once they have any block, confirmed or not", () => {
      const res = findGroupTimes(unconfirmed, { memberIds: ["ana", "ben"], durationMinutes: 30, fromDay: WED, toDay: WED });
      expect(res.unknown).toEqual([]);
      expect(res.everyoneFree).toBe(false);
    });

    it("includes them as possibly free on request, still honouring the club calendar", () => {
      const events: EngineEvent[] = [
        { id: "c", kind: "coffee_chat", title: "Acme", start: instant(WED, at(9)), end: instant(WED, at(13)), memberIds: ["cat"] },
      ];
      const res = findGroupTimes({ ...unconfirmed, events }, {
        memberIds: ["ana", "cat"],
        durationMinutes: 30,
        fromDay: WED,
        toDay: WED,
        includeUnknown: true,
      });
      expect(res.considered).toBe(2);
      expect(res.best[0]).toMatchObject({ windowStart: at(13), available: ["ana", "cat"], maybe: ["cat"] });
    });

    it("finds nothing when nobody in the group has a schedule", () => {
      const res = findGroupTimes(unconfirmed, { memberIds: ["cat", "dev"], durationMinutes: 30, fromDay: WED, toDay: FRI });
      expect(res.best).toEqual([]);
      expect(res.unknown).toEqual(["cat", "dev"]);
    });

    it("has nothing to trust when the club has no terms, and only the calendar between terms", () => {
      const q = { memberIds: ["ana"], durationMinutes: 30, fromDay: WED, toDay: WED };
      expect(findGroupTimes(input({ terms: [] }), q).unknown).toEqual(["ana"]);
      const later = { key: "s", name: "Spring", start: "2027-01-13", end: "2027-05-08" };
      const res = findGroupTimes(input({ terms: [later], confirmations: [] }), q);
      expect(res.unknown).toEqual([]);
      expect(res.everyoneFree).toBe(true);
    });
  });

  it("uses the blocks of the term each date falls in", () => {
    const spring = { key: "2027-spring", name: "Spring 2027", start: "2027-01-13", end: "2027-05-08" };
    const blocks = [
      ...block("ana", [3], at(9), at(17)),
      ...block("ana", [3], at(9), at(12), { termKey: spring.key }),
    ];
    const res = findGroupTimes(
      input({ terms: [fall, spring], blocks, now: instant("2027-01-18", at(7)) }),
      { memberIds: ["ana"], durationMinutes: 60, fromDay: "2027-01-20", toDay: "2027-01-20" }
    );
    expect(res.best[0]).toMatchObject({ day: "2027-01-20", windowStart: at(12, 15), windowEnd: at(17) });
  });

  it("stays on the wall clock across a clock change", () => {
    // Clocks go back on Sunday Nov 1. A 10:00–11:00 class must block 10–11 local on both Fridays.
    const res = findGroupTimes(
      input({ blocks: block("ana", [5], at(10), at(11)), now: instant("2026-10-29", at(7)), bufferMinutes: 0 }),
      { memberIds: ["ana"], durationMinutes: 60, fromDay: "2026-10-30", toDay: "2026-11-06" }
    );
    for (const day of ["2026-10-30", "2026-11-06"]) {
      const options = res.byDay.find((d) => d.day === day)!.options;
      expect(options.map((o) => [o.windowStart, o.windowEnd])).toEqual([
        [at(9), at(10)],
        [at(11), at(17)],
      ]);
    }
    const before = res.byDay.find((d) => d.day === "2026-10-30")!.options[0];
    const after = res.byDay.find((d) => d.day === "2026-11-06")!.options[0];
    expect(new Date(before.start).toISOString()).toBe("2026-10-30T13:00:00.000Z");
    expect(new Date(after.start).toISOString()).toBe("2026-11-06T14:00:00.000Z");
  });
});

describe("whoIsFree — this time, N people", () => {
  const start = instant(THU, at(14));
  const pool = people.map((p) => p.id);

  it("sorts everyone into free, busy and unknown, with what is in the way", () => {
    const res = whoIsFree(
      input({
        blocks: block("ana", [4], at(14), at(15, 20), { label: "ECON 201" }),
        confirmations: people.filter((p) => p.id !== "dev").map((p) => ({ memberId: p.id, termKey: fall.key })),
      }),
      { start, durationMinutes: 30, pool, n: 2 }
    );
    const state = Object.fromEntries(res.presences.map((p) => [p.memberId, p.state]));
    expect(state).toEqual({ ana: "busy", ben: "free", cat: "free", dev: "unknown", eli: "free" });
    expect(res.availableCount).toBe(3);
    const conflict = res.presences.find((p) => p.memberId === "ana")!.conflict!;
    expect(conflict).toMatchObject({ kind: "class", label: "ECON 201" });
    expect(conflictPhrase("Ana", { ...conflict, startMinute: at(14), endMinute: at(15, 20) })).toBe("Ana has ECON 201 2:00–3:20 PM");
    expect(conflictPhrase("Ana", { kind: "class", label: null, startMinute: at(14), endMinute: at(15, 20) })).toBe(
      "Ana is busy 2:00–3:20 PM"
    );
  });

  it("picks whoever has done the least lately and says why", () => {
    const res = whoIsFree(input({ load: { ana: 3, ben: 0, cat: 2, dev: 1, eli: 4 } }), { start, durationMinutes: 30, pool, n: 2 });
    expect(res.combinations[0].picks).toEqual([
      { memberId: "ben", reason: "no chats this month" },
      { memberId: "dev", reason: "1 chat this month" },
    ]);
  });

  it("offers alternates that each swap the last seat for the next person in line — not every combination", () => {
    const res = whoIsFree(input({ load: { ana: 3, ben: 0, cat: 2, dev: 1, eli: 4 } }), { start, durationMinutes: 30, pool, n: 2 });
    expect(res.combinations.map((c) => c.picks.map((p) => p.memberId))).toEqual([
      ["ben", "dev"],
      ["ben", "cat"],
      ["ben", "ana"],
      ["ben", "eli"],
    ]);
    expect(res.combinations[1].swap).toEqual({ in: "cat", out: "dev" });
    expect(res.combinations.length).toBeLessThanOrEqual(5);
  });

  it("prefers the application's owner even when they have been busy", () => {
    const res = whoIsFree(input({ load: { ana: 9 } }), { start, durationMinutes: 30, pool, n: 2, ownerId: "ana" });
    expect(res.combinations[0].picks[0]).toEqual({ memberId: "ana", reason: "owns this application" });
    // The owner keeps their seat in every alternate.
    expect(res.combinations.every((c) => c.picks.some((p) => p.memberId === "ana"))).toBe(true);
  });

  it("keeps a partner in the room when asked, and says so when none is free", () => {
    const load = { ana: 0, ben: 0, dev: 0, cat: 5, eli: 6 };
    const res = whoIsFree(input({ load }), { start, durationMinutes: 30, pool, n: 2, requirePartner: true });
    expect(res.combinations[0].picks).toEqual([
      { memberId: "ana", reason: "no chats this month" },
      { memberId: "cat", reason: "partner" },
    ]);
    expect(res.combinations.every((c) => c.picks.some((p) => p.memberId === "cat" || p.memberId === "eli"))).toBe(true);

    const none = whoIsFree(
      input({ load, blocks: [...block("cat", [4], at(9), at(17)), ...block("eli", [4], at(9), at(17))] }),
      { start, durationMinutes: 30, pool, n: 2, requirePartner: true }
    );
    expect(none.combinations[0].noPartner).toBe(true);
  });

  it("always seats the people already chosen", () => {
    const res = whoIsFree(input({ load: { eli: 9 } }), { start, durationMinutes: 30, pool, required: ["eli"], n: 3 });
    expect(res.combinations[0].picks[0]).toEqual({ memberId: "eli", reason: "already chosen" });
    expect(res.combinations[0].picks).toHaveLength(3);
  });

  it("offers nothing when too few are free or a chosen person is busy", () => {
    const busy = input({ blocks: ["ana", "ben", "cat", "dev"].flatMap((id) => block(id, [4], at(9), at(17))) });
    expect(whoIsFree(busy, { start, durationMinutes: 30, pool, n: 2 }).combinations).toEqual([]);
    expect(whoIsFree(busy, { start, durationMinutes: 30, pool, required: ["ana"], n: 2 }).combinations).toEqual([]);
    expect(whoIsFree(busy, { start, durationMinutes: 30, pool, n: 1 }).combinations[0].picks[0].memberId).toBe("eli");
  });

  it("only picks someone with no schedule when asked to, and last", () => {
    const partial = input({ confirmations: [{ memberId: "ana", termKey: fall.key }] });
    expect(whoIsFree(partial, { start, durationMinutes: 30, pool, n: 2 }).combinations).toEqual([]);
    const res = whoIsFree(partial, { start, durationMinutes: 30, pool, n: 2, includeUnknown: true });
    expect(res.combinations[0].picks[0].memberId).toBe("ana");
    expect(res.combinations[0].picks[1].reason).toBe("no schedule on file");
  });

  it("puts someone who would rather not behind everyone else", () => {
    const res = whoIsFree(
      input({ blocks: block("ana", [4], at(13), at(16), { kind: "prefer_not" }), members: people.slice(0, 3) }),
      { start, durationMinutes: 30, pool: ["ana", "ben", "cat"], n: 2 }
    );
    expect(res.combinations[0].picks.map((p) => p.memberId)).toEqual(["ben", "cat"]);
    expect(res.combinations[1].picks[1]).toEqual({ memberId: "ana", reason: "free, but would rather not" });
  });
});

describe("findTimesForN — N people, sometime", () => {
  const pool = people.map((p) => p.id);

  it("pairs each good time with its fairest group", () => {
    const res = findTimesForN(input({ load: { ana: 2, ben: 0, cat: 1, dev: 0, eli: 3 } }), {
      pool,
      n: 2,
      durationMinutes: 30,
      fromDay: WED,
      toDay: WED,
    });
    expect(res.options[0].combination.picks.map((p) => p.memberId)).toEqual(["ben", "dev"]);
    expect(res.options[0].alsoFree).toEqual(expect.arrayContaining(["ana", "cat", "eli"]));
  });

  it("returns a handful of distinct options across days, not every slot", () => {
    const res = findTimesForN(input(), { pool, n: 2, durationMinutes: 30, fromDay: WED, toDay: "2026-11-24" });
    expect(res.options).toHaveLength(5);
    const days = new Set(res.options.map((o) => o.day));
    expect(days.size).toBeGreaterThanOrEqual(3);
    for (const a of res.options) {
      for (const b of res.options) {
        if (a !== b && a.day === b.day) expect(Math.abs(a.startMinute - b.startMinute)).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it("changes the group as the day goes on, around people's classes", () => {
    const blocks = [...block("ben", [3], at(9), at(12, 50)), ...block("dev", [3], at(13), at(17))];
    const res = findTimesForN(input({ blocks, load: { ana: 5, cat: 5, eli: 5 } }), {
      pool: ["ana", "ben", "dev"],
      n: 2,
      durationMinutes: 60,
      fromDay: WED,
      toDay: WED,
    });
    const groups = res.options.map((o) => [o.windowStart, o.combination.picks.map((p) => p.memberId).sort()]);
    expect(groups).toContainEqual([at(9), ["ana", "dev"]]);
    expect(groups).toContainEqual([at(13), ["ana", "ben"]]);
  });

  it("requires the chosen people and prefers times the owner can make", () => {
    const blocks = block("ana", [3], at(9), at(17));
    const res = findTimesForN(input({ blocks }), {
      pool,
      required: ["eli"],
      ownerId: "ana",
      n: 2,
      durationMinutes: 30,
      fromDay: WED,
      toDay: THU,
    });
    // Thursday first: Ana (the owner) is in class all Wednesday.
    expect(res.options[0].day).toBe(THU);
    expect(res.options[0].combination.picks.map((p) => p.memberId)).toEqual(["eli", "ana"]);
    expect(res.options.every((o) => o.available.includes("eli"))).toBe(true);
  });

  it("leaves out people with no schedule, and reports them", () => {
    const partial = input({ confirmations: ["ana", "ben"].map((memberId) => ({ memberId, termKey: fall.key })) });
    const res = findTimesForN(partial, { pool, n: 2, durationMinutes: 30, fromDay: WED, toDay: WED });
    expect(res.unknown).toEqual(["cat", "dev", "eli"]);
    expect(res.considered).toBe(2);
    expect(res.options.every((o) => o.available.sort().join() === "ana,ben")).toBe(true);
    expect(findTimesForN(partial, { pool, n: 3, durationMinutes: 30, fromDay: WED, toDay: WED }).options).toEqual([]);
  });
});

describe("busyHeatmap", () => {
  it("counts who is busy in each half hour, leaving out people with no schedule", () => {
    const res = busyHeatmap(
      input({
        blocks: [...block("ana", [3], at(10), at(11)), ...block("ben", [3], at(10, 30), at(12))],
        confirmations: ["ana", "ben"].map((memberId) => ({ memberId, termKey: fall.key })),
      }),
      { memberIds: ["ana", "ben", "cat"], fromDay: WED, toDay: THU }
    );
    expect(res.known).toBe(2);
    expect(res.unknown).toEqual(["cat"]);
    expect(res.rows[0]).toBe(at(9));
    const wed = res.days[0].busy;
    expect(wed.slice(0, 7)).toEqual([0, 0, 1, 2, 1, 1, 0]);
    expect(res.days[1].busy.every((n) => n === 0)).toBe(true);
  });
});

describe("words", () => {
  it("lists names", () => {
    expect(nameList(["A"])).toBe("A");
    expect(nameList(["A", "B"])).toBe("A and B");
    expect(nameList(["A", "B", "C"])).toBe("A, B and C");
    expect(nameList(["A", "B", "C", "D", "E"])).toBe("A, B and 3 others");
  });

  it("writes the note to a founder with the zone named", () => {
    const res = findGroupTimes(input(), { memberIds: ["ana", "ben"], durationMinutes: 30, fromDay: WED, toDay: FRI });
    const text = founderMessage({ options: res.best, timeZone: NY, orgName: "Cardinal Ventures", companyName: "Acme" });
    expect(text).toContain("Eastern Time (EST)");
    expect(text).toContain("- Wed, Nov 11, 10:00–10:30 AM");
    expect(text.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(3);
    expect(text).toContain("coffee chat about Acme");
  });
});
