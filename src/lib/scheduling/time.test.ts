import { describe, expect, it } from "vitest";
import {
  addDays,
  dayMapper,
  daysBetween,
  eachDay,
  formatMinute,
  formatMinuteRange,
  inputToMinute,
  isValidIsoDay,
  minuteToInput,
  weekdayOf,
  zonedParts,
  zonedToUtc,
} from "./time";

const NY = "America/New_York";

describe("civil days", () => {
  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-01", "2026-11-15")).toBe(14);
    expect(eachDay("2026-11-30", "2026-12-02")).toEqual(["2026-11-30", "2026-12-01", "2026-12-02"]);
  });

  it("knows weekdays and rejects impossible dates", () => {
    expect(weekdayOf("2026-11-11")).toBe(3);
    expect(isValidIsoDay("2026-02-30")).toBe(false);
    expect(isValidIsoDay("2026-2-3")).toBe(false);
    expect(isValidIsoDay("2026-02-28")).toBe(true);
  });
});

describe("zonedToUtc", () => {
  it("applies the offset in force on that date", () => {
    // EDT (UTC-4) in October, EST (UTC-5) in November.
    expect(new Date(zonedToUtc("2026-10-20", 14 * 60, NY)).toISOString()).toBe("2026-10-20T18:00:00.000Z");
    expect(new Date(zonedToUtc("2026-11-20", 14 * 60, NY)).toISOString()).toBe("2026-11-20T19:00:00.000Z");
  });

  it("round-trips through zonedParts", () => {
    for (const tz of [NY, "America/Los_Angeles", "Europe/London", "Asia/Kolkata", "Australia/Sydney", "UTC"]) {
      for (const day of ["2026-01-15", "2026-03-08", "2026-07-04", "2026-11-01", "2026-11-02"]) {
        for (const minute of [0, 9 * 60 + 30, 14 * 60 + 15, 23 * 60 + 45]) {
          const back = zonedParts(zonedToUtc(day, minute, tz), tz);
          // 2:xx AM does not exist on spring-forward day; every time used here does.
          expect(back).toMatchObject({ day, minute });
        }
      }
    }
  });

  it("keeps a 10:30 class at 10:30 on both sides of the fall clock change", () => {
    // US clocks go back on Sunday 2026-11-01.
    const friday = zonedToUtc("2026-10-30", 630, NY);
    const monday = zonedToUtc("2026-11-02", 630, NY);
    expect(new Date(friday).toISOString()).toBe("2026-10-30T14:30:00.000Z");
    expect(new Date(monday).toISOString()).toBe("2026-11-02T15:30:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // Spring forward: 2026-03-08 has 23 hours in New York.
    const spring = dayMapper("2026-03-08", NY);
    expect(new Date(spring(60)).toISOString()).toBe("2026-03-08T06:00:00.000Z");
    expect(new Date(spring(3 * 60)).toISOString()).toBe("2026-03-08T07:00:00.000Z");
    expect(new Date(spring(12 * 60)).toISOString()).toBe("2026-03-08T16:00:00.000Z");
    // 2:30 AM does not exist; it resolves an hour later rather than throwing.
    expect(new Date(spring(150)).toISOString()).toBe("2026-03-08T07:30:00.000Z");
    // Fall back: 1:30 AM happens twice; the first one wins.
    const fall = dayMapper("2026-11-01", NY);
    expect(new Date(fall(90)).toISOString()).toBe("2026-11-01T05:30:00.000Z");
    expect(new Date(fall(12 * 60)).toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("falls back to UTC for a timezone the runtime does not know", () => {
    expect(new Date(zonedToUtc("2026-11-20", 60, "Mars/Olympus")).toISOString()).toBe("2026-11-20T01:00:00.000Z");
  });
});

describe("formatting", () => {
  it("formats minutes and ranges the way people say them", () => {
    expect(formatMinute(0)).toBe("12:00 AM");
    expect(formatMinute(870)).toBe("2:30 PM");
    expect(formatMinuteRange(840, 870)).toBe("2:00–2:30 PM");
    expect(formatMinuteRange(690, 780)).toBe("11:30 AM–1:00 PM");
    expect(formatMinuteRange(660, 720)).toBe("11:00 AM–12:00 PM");
    expect(formatMinuteRange(540, 600)).toBe("9:00–10:00 AM");
  });

  it("converts to and from time inputs", () => {
    expect(minuteToInput(545)).toBe("09:05");
    expect(inputToMinute("09:05")).toBe(545);
    expect(inputToMinute("nope")).toBeNull();
  });
});
