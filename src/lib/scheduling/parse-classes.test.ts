import { describe, expect, it } from "vitest";
import { parseClassLine, parseClassText } from "./parse-classes";

const at = (h: number, m = 0) => h * 60 + m;

describe("parseClassLine", () => {
  it.each([
    ["ECON 201 MWF 10:30-11:20am", "ECON 201", [1, 3, 5], at(10, 30), at(11, 20)],
    ["TuTh 2–3:20 PM", null, [2, 4], at(14), at(15, 20)],
    ["CS 101 - Mon/Wed 9:00 AM - 10:15 AM", "CS 101", [1, 3], at(9), at(10, 15)],
    ["Stats lab  Friday 13:00-14:50", "Stats lab", [5], at(13), at(14, 50)],
    ["MATH 20 Tue, Thu 14:00 to 15:15", "MATH 20", [2, 4], at(14), at(15, 15)],
    ["Organic Chem TR 11-12:15", "Organic Chem", [2, 4], at(11), at(12, 15)],
    ["PHIL 110 MTWThF 8am-8:50am", "PHIL 110", [1, 2, 3, 4, 5], at(8), at(8, 50)],
    ["Work shift Sa 9am-1pm", "Work shift", [6], at(9), at(13)],
    ["Seminar W 6:30pm–9pm", "Seminar", [3], at(18, 30), at(21)],
    ["Lab F 1-3pm", "Lab", [5], at(13), at(15)],
    ["Rowing Mon-Fri 6:00am-7:30am", "Rowing", [1, 2, 3, 4, 5], at(6), at(7, 30)],
    ["HIST 150 (TTh) 3:30 - 4:45", "HIST 150", [2, 4], at(15, 30), at(16, 45)],
    ["Tuesdays and Thursdays 10-11:15 Linear Algebra", "Linear Algebra", [2, 4], at(10), at(11, 15)],
    ["9:30-10:45 MW Accounting", "Accounting", [1, 3], at(9, 30), at(10, 45)],
    ["mwf 12-12:50", null, [1, 3, 5], at(12), at(12, 50)],
    ["Econometrics | M W | 4:10 p.m. - 5:25 p.m.", "Econometrics", [1, 3], at(16, 10), at(17, 25)],
  ])("%s", (line, label, days, startMinute, endMinute) => {
    expect(parseClassLine(line)).toEqual({ label, days, startMinute, endMinute });
  });

  it("reads a lone AM/PM marker across noon", () => {
    expect(parseClassLine("Lunch shift M 11-1pm")).toMatchObject({ startMinute: at(11), endMinute: at(13) });
    expect(parseClassLine("Studio F 10am-1")).toMatchObject({ startMinute: at(10), endMinute: at(13) });
  });

  it("takes the days beside the time, not a course code that looks like days", () => {
    expect(parseClassLine("MTH 201 MWF 10-10:50")).toEqual({
      label: "MTH 201",
      days: [1, 3, 5],
      startMinute: at(10),
      endMinute: at(10, 50),
    });
    expect(parseClassLine("STS 12 TuTh 1:30-2:45")).toMatchObject({ label: "STS 12", days: [2, 4] });
  });

  it("refuses lines with no days, no time, or a time that makes no sense", () => {
    expect(parseClassLine("ECON 201 10:30-11:20am")).toBeNull();
    expect(parseClassLine("ECON 201 MWF")).toBeNull();
    expect(parseClassLine("Office hours by appointment")).toBeNull();
    expect(parseClassLine("ECON 201 MWF 25:00-26:00")).toBeNull();
    expect(parseClassLine("ECON 201 MWF 3pm-2pm")).toBeNull();
    expect(parseClassLine("")).toBeNull();
  });

  it("does not mistake a room number or a date for a time", () => {
    expect(parseClassLine("ECON 201 Room 10-12")).toBeNull();
    expect(parseClassLine("BIO 101 MWF 9-9:50 Room 204")).toMatchObject({ label: "BIO 101 Room 204", days: [1, 3, 5] });
  });
});

describe("parseClassText", () => {
  it("parses what it can and names what it cannot", () => {
    const { classes, unparsed } = parseClassText(
      ["ECON 201 MWF 10:30-11:20am", "", "  TuTh 2–3:20 PM  ", "Fall 2026 schedule", "PE (online, async)"].join("\n")
    );
    expect(classes).toHaveLength(2);
    expect(unparsed).toEqual(["Fall 2026 schedule", "PE (online, async)"]);
  });

  it("handles Windows line endings and an empty paste", () => {
    expect(parseClassText("A MWF 9-10\r\nB TR 1-2\r\n").classes).toHaveLength(2);
    expect(parseClassText("   \n\n")).toEqual({ classes: [], unparsed: [] });
  });
});
