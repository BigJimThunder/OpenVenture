import { describe, expect, it } from "vitest";
import { pickAssignee } from "./assign";
import {
  checkinDue,
  findSlaBreaches,
  isDigestDay,
  localDate,
  routeToOwnerOrAdmins,
  voteIsOverdue,
  voteNeedsReminder,
} from "./rules";
import { digestHasContent, renderDigest, type DigestInput } from "./digest";

const at = (iso: string) => new Date(iso);
const hoursFrom = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);
const daysBefore = (base: Date, d: number) => new Date(base.getTime() - d * 86_400_000);

describe("pickAssignee", () => {
  it("returns null with nobody to assign", () => {
    expect(pickAssignee([])).toBeNull();
  });

  it("prefers the member carrying the fewest open applications", () => {
    const picked = pickAssignee([
      { id: "a", openCount: 3, lastAssignedAt: null },
      { id: "b", openCount: 1, lastAssignedAt: at("2026-11-10T00:00:00Z") },
      { id: "c", openCount: 2, lastAssignedAt: null },
    ]);
    expect(picked?.id).toBe("b");
  });

  it("breaks ties by who was assigned least recently, never-assigned first", () => {
    const picked = pickAssignee([
      { id: "a", openCount: 1, lastAssignedAt: at("2026-11-09T00:00:00Z") },
      { id: "b", openCount: 1, lastAssignedAt: at("2026-11-01T00:00:00Z") },
      { id: "c", openCount: 1, lastAssignedAt: null },
    ]);
    expect(picked?.id).toBe("c");
  });

  it("rotates through equally loaded members", () => {
    const team = ["a", "b", "c"].map((id) => ({ id, openCount: 0, lastAssignedAt: null as Date | null }));
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = pickAssignee(team)!;
      order.push(next.id);
      next.openCount++;
      next.lastAssignedAt = at(`2026-11-0${i + 1}T00:00:00Z`);
    }
    expect(order).toEqual(["a", "b", "c", "a", "b", "c"]);
  });
});

describe("localDate", () => {
  it("uses the club's timezone, not UTC", () => {
    // 03:00 UTC on Monday is still Sunday evening in New York.
    const now = at("2026-11-09T03:00:00Z");
    expect(localDate(now, "UTC").weekday).toBe(1);
    expect(localDate(now, "America/New_York")).toMatchObject({ date: "2026-11-08", weekday: 0 });
    expect(isDigestDay(now, "America/New_York")).toBe(false);
    expect(isDigestDay(at("2026-11-09T12:00:00Z"), "America/New_York")).toBe(true);
  });

  it("computes ISO weeks across year boundaries", () => {
    expect(localDate(at("2026-11-09T12:00:00Z"), "UTC").isoWeek).toBe("2026-W46");
    expect(localDate(at("2027-01-01T12:00:00Z"), "UTC").isoWeek).toBe("2026-W53");
    expect(localDate(at("2024-12-30T12:00:00Z"), "UTC").isoWeek).toBe("2025-W01");
  });

  it("labels quarters and survives a bad timezone", () => {
    expect(localDate(at("2026-11-09T12:00:00Z"), "UTC").quarter).toBe("2026-Q4");
    expect(localDate(at("2026-03-31T12:00:00Z"), "Not/AZone").quarter).toBe("2026-Q1");
  });
});

describe("votes", () => {
  const now = at("2026-11-11T12:00:00Z");
  const opened = daysBefore(now, 2);

  it("reminds inside the 36-hour window only", () => {
    expect(voteNeedsReminder({ opensAt: opened, closesAt: hoursFrom(now, 24) }, now)).toBe(true);
    expect(voteNeedsReminder({ opensAt: opened, closesAt: hoursFrom(now, 36) }, now)).toBe(true);
    expect(voteNeedsReminder({ opensAt: opened, closesAt: hoursFrom(now, 37) }, now)).toBe(false);
    expect(voteNeedsReminder({ opensAt: opened, closesAt: hoursFrom(now, -1) }, now)).toBe(false);
    expect(voteNeedsReminder({ opensAt: opened, closesAt: null }, now)).toBe(false);
  });

  it("stays quiet for a round that only just opened", () => {
    expect(voteNeedsReminder({ opensAt: hoursFrom(now, -2), closesAt: hoursFrom(now, 20) }, now)).toBe(false);
  });

  it("closes rounds at or past the deadline, never ones without one", () => {
    expect(voteIsOverdue({ closesAt: now }, now)).toBe(true);
    expect(voteIsOverdue({ closesAt: hoursFrom(now, 1) }, now)).toBe(false);
    expect(voteIsOverdue({ closesAt: null }, now)).toBe(false);
  });
});

describe("findSlaBreaches", () => {
  const now = at("2026-11-11T12:00:00Z");

  it("flags only applications past the stage SLA, worst first", () => {
    const breaches = findSlaBreaches(
      [
        { applicationId: "fresh", enteredStageAt: daysBefore(now, 2), slaDays: 7 },
        { applicationId: "edge", enteredStageAt: daysBefore(now, 7), slaDays: 7 },
        { applicationId: "over", enteredStageAt: daysBefore(now, 9), slaDays: 7 },
        { applicationId: "worse", enteredStageAt: daysBefore(now, 30), slaDays: 14 },
        { applicationId: "no-sla", enteredStageAt: daysBefore(now, 400), slaDays: null },
      ],
      now
    );
    expect(breaches.map((b) => [b.applicationId, b.daysOver])).toEqual([
      ["worse", 16],
      ["over", 2],
    ]);
  });

  it("keys a breach to the stage entry, so a move re-arms the nudge", () => {
    const entered = daysBefore(now, 10);
    const [first] = findSlaBreaches([{ applicationId: "x", enteredStageAt: entered, slaDays: 7 }], now);
    const [again] = findSlaBreaches([{ applicationId: "x", enteredStageAt: entered, slaDays: 7 }], hoursFrom(now, 24));
    const [moved] = findSlaBreaches([{ applicationId: "x", enteredStageAt: daysBefore(now, 8), slaDays: 7 }], now);
    expect(again.key).toBe(first.key);
    expect(moved.key).not.toBe(first.key);
  });
});

describe("checkinDue", () => {
  const now = at("2026-11-11T12:00:00Z");

  it("counts from the last outcome update when there is one", () => {
    expect(checkinDue({ lastOutcomeAt: daysBefore(now, 30), issuedAt: daysBefore(now, 300) }, now).due).toBe(false);
    expect(checkinDue({ lastOutcomeAt: daysBefore(now, 91), issuedAt: daysBefore(now, 300) }, now).due).toBe(true);
  });

  it("falls back to the grant issue date, and needs one of the two", () => {
    expect(checkinDue({ lastOutcomeAt: null, issuedAt: daysBefore(now, 120) }, now)).toEqual({ due: true, daysSince: 120 });
    expect(checkinDue({ lastOutcomeAt: null, issuedAt: daysBefore(now, 90) }, now).due).toBe(false);
    expect(checkinDue({ lastOutcomeAt: null, issuedAt: null }, now).due).toBe(false);
  });
});

describe("routeToOwnerOrAdmins", () => {
  it("sends owned items to the owner and everything else to every admin", () => {
    const routed = routeToOwnerOrAdmins(
      [
        { id: 1, ownerMemberId: "ana" },
        { id: 2, ownerMemberId: null },
        { id: 3, ownerMemberId: "graduated" },
        { id: 4, ownerMemberId: "admin1" },
      ],
      new Set(["ana", "admin1", "admin2"]),
      ["admin1", "admin2"]
    );
    expect(routed.get("ana")?.map((i) => i.id)).toEqual([1]);
    expect(routed.get("admin1")?.map((i) => i.id)).toEqual([2, 3, 4]);
    expect(routed.get("admin2")?.map((i) => i.id)).toEqual([2, 3]);
    expect(routed.has("graduated")).toBe(false);
  });
});

describe("weekly digest", () => {
  const now = at("2026-11-09T13:00:00Z");
  const empty: DigestInput = {
    firstName: "Priya",
    applications: [],
    votes: [],
    actionItems: [],
    nextMeeting: null,
    club: { newApplications: 0, budgetRemaining: "$6,200" },
  };
  const url = (path: string) => `https://club.example${path}`;

  it("is skipped when nothing needs the member and the club was quiet", () => {
    expect(digestHasContent(empty)).toBe(false);
    expect(digestHasContent({ ...empty, club: { ...empty.club, newApplications: 2 } })).toBe(true);
    expect(digestHasContent({ ...empty, votes: [{ title: "IC vote: Acme", memoId: "m1", closesAt: null }] })).toBe(true);
  });

  it("never claims to know whether the member has voted", () => {
    const { bodyHtml, subject } = renderDigest(
      { ...empty, votes: [{ title: "IC vote: Acme", memoId: "m1", closesAt: hoursFrom(now, 40) }] },
      { now, timeZone: "America/New_York", url }
    );
    expect(subject).toBe("This week: 1 open vote");
    expect(bodyHtml).toContain("If you haven&#39;t voted yet");
    expect(bodyHtml).toContain("https://club.example/memos/m1/vote");
  });

  it("flags overdue applications and escapes what founders typed", () => {
    const { bodyHtml } = renderDigest(
      {
        ...empty,
        applications: [
          {
            id: "a1",
            ref: 141,
            companyName: "<script>Loop</script>",
            stageName: "Screening",
            enteredStageAt: daysBefore(now, 10),
            slaDays: 7,
            nextStep: "Book the coffee chat",
            nextStepDue: daysBefore(now, 1),
          },
        ],
      },
      { now, timeZone: "UTC", url }
    );
    expect(bodyHtml).toContain("APP-141 &lt;script&gt;Loop&lt;/script&gt;");
    expect(bodyHtml).not.toContain("<script>");
    expect(bodyHtml).toContain("3 days over");
    expect(bodyHtml).toContain("Book the coffee chat (overdue)");
  });
});
