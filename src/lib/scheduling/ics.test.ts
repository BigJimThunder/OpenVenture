import { describe, expect, it } from "vitest";
import { parseIcs, unfoldIcs } from "./ics";

const term = { start: "2026-08-25", end: "2026-12-12" };
const NY = "America/New_York";

function calendar(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events, "END:VCALENDAR"].join("\r\n");
}

function event(lines: string[]): string {
  return ["BEGIN:VEVENT", "UID:x@example", ...lines, "END:VEVENT"].join("\r\n");
}

describe("unfoldIcs", () => {
  it("joins continuation lines", () => {
    expect(unfoldIcs("SUMMARY:Intro to\r\n  Micro\r\n\teconomics\r\nEND:VEVENT")).toEqual([
      "SUMMARY:Intro to Microeconomics",
      "END:VEVENT",
    ]);
  });
});

describe("parseIcs", () => {
  it("turns a weekly class with a TZID into blocks", () => {
    const ics = calendar(
      event([
        "SUMMARY:ECON 201\\, Intermediate Micro",
        "DTSTART;TZID=America/New_York:20260826T103000",
        "DTEND;TZID=America/New_York:20260826T112000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261211T235959Z",
      ])
    );
    expect(parseIcs(ics, term, NY)).toEqual({
      classes: [{ label: "ECON 201, Intermediate Micro", days: [1, 3, 5], startMinute: 630, endMinute: 680 }],
      total: 1,
      skipped: 0,
    });
  });

  it("treats floating times as club time and falls back to the start weekday without BYDAY", () => {
    const ics = calendar(
      event(["SUMMARY:Lab", "DTSTART:20260903T140000", "DURATION:PT1H50M", "RRULE:FREQ=WEEKLY;COUNT=14"])
    );
    // 2026-09-03 is a Thursday.
    expect(parseIcs(ics, term, NY).classes).toEqual([{ label: "Lab", days: [4], startMinute: 840, endMinute: 950 }]);
  });

  it("converts UTC times using the offset in force during the term", () => {
    // 19:00Z on a November Tuesday is 2 PM EST.
    const ics = calendar(
      event(["SUMMARY:Seminar", "DTSTART:20261103T190000Z", "DTEND:20261103T201500Z", "RRULE:FREQ=WEEKLY;BYDAY=TU"])
    );
    expect(parseIcs(ics, term, NY).classes).toEqual([{ label: "Seminar", days: [2], startMinute: 840, endMinute: 915 }]);
  });

  it("converts from another zone, shifting the weekday when the date changes", () => {
    // Tuesday 08:00 in Tokyo is Monday evening in New York (19:00 EDT in September).
    const ics = calendar(
      event([
        "SUMMARY:Remote section",
        "DTSTART;TZID=Asia/Tokyo:20260901T080000",
        "DTEND;TZID=Asia/Tokyo:20260901T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=TU",
      ])
    );
    expect(parseIcs(ics, term, NY).classes).toEqual([
      { label: "Remote section", days: [1], startMinute: 19 * 60, endMinute: 20 * 60 },
    ]);
  });

  it("uses the term's offset for a series that started under different clocks", () => {
    // A series from last March (EDT) written in UTC; during the fall term's start it is still EDT.
    const ics = calendar(
      event(["SUMMARY:Standing", "DTSTART:20260310T140000Z", "DTEND:20260310T150000Z", "RRULE:FREQ=WEEKLY;BYDAY=TU"])
    );
    expect(parseIcs(ics, term, NY).classes[0]).toMatchObject({ startMinute: 600, endMinute: 660 });
  });

  it("treats an unknown TZID as club time", () => {
    const ics = calendar(
      event([
        "SUMMARY:Stats",
        'DTSTART;TZID="Eastern Standard Time":20260901T090000',
        'DTEND;TZID="Eastern Standard Time":20260901T101500',
        "RRULE:FREQ=WEEKLY;BYDAY=TU,TH",
      ])
    );
    expect(parseIcs(ics, term, NY).classes).toEqual([{ label: "Stats", days: [2, 4], startMinute: 540, endMinute: 615 }]);
  });

  it("skips one-off, all-day, non-weekly and out-of-term events", () => {
    const ics = calendar(
      event(["SUMMARY:Midterm", "DTSTART:20261015T090000", "DTEND:20261015T110000"]),
      event(["SUMMARY:Holiday", "DTSTART;VALUE=DATE:20261126", "RRULE:FREQ=WEEKLY"]),
      event(["SUMMARY:Rent", "DTSTART:20260901T090000", "DTEND:20260901T093000", "RRULE:FREQ=MONTHLY"]),
      event([
        "SUMMARY:Last spring",
        "DTSTART:20260115T090000",
        "DTEND:20260115T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20260508",
      ]),
      event([
        "SUMMARY:Next spring",
        "DTSTART:20270114T090000",
        "DTEND:20270114T100000",
        "RRULE:FREQ=WEEKLY;BYDAY=TH",
      ]),
      event(["SUMMARY:Kept", "DTSTART:20260901T090000", "DTEND:20260901T100000", "RRULE:FREQ=WEEKLY;BYDAY=TU"])
    );
    const result = parseIcs(ics, term, NY);
    expect(result.classes.map((c) => c.label)).toEqual(["Kept"]);
    expect(result).toMatchObject({ total: 6, skipped: 5 });
  });

  it("ignores alarms nested in an event and EXDATE lines", () => {
    const ics = calendar(
      event([
        "SUMMARY:ECON 201",
        "DTSTART:20260826T103000",
        "DTEND:20260826T112000",
        "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
        "EXDATE:20260907T103000",
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        "SUMMARY:Reminder",
        "DURATION:PT5M",
        "TRIGGER:-PT10M",
        "END:VALARM",
      ])
    );
    expect(parseIcs(ics, term, NY).classes).toEqual([
      { label: "ECON 201", days: [1, 3], startMinute: 630, endMinute: 680 },
    ]);
  });

  it("merges exact duplicates, cuts a class at midnight, and survives junk", () => {
    const one = event(["SUMMARY:A", "DTSTART:20260901T230000", "DTEND:20260902T003000", "RRULE:FREQ=WEEKLY;BYDAY=TU"]);
    expect(parseIcs(calendar(one, one), term, NY).classes).toEqual([
      { label: "A", days: [2], startMinute: 1380, endMinute: 1440 },
    ]);
    expect(parseIcs("not a calendar\n\n:::\nBEGIN:VEVENT\nRRULE\nEND:VEVENT", term, NY)).toEqual({
      classes: [],
      total: 1,
      skipped: 1,
    });
    expect(parseIcs("", term, NY).classes).toEqual([]);
  });

  it("reads bare LF files with folded lines and lowercase parameters", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "SUMMARY:Very long course",
      "  title",
      "DTSTART;tzid=America/New_York:20260901T130000",
      "DTEND;tzid=America/New_York:20260901T141500",
      "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,",
      " TH",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcs(ics, term, NY).classes).toEqual([
      { label: "Very long course title", days: [2, 4], startMinute: 780, endMinute: 855 },
    ]);
  });
});
