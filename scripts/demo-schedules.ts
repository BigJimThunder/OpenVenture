/**
 * Fictional class schedules for the demo club, so the scheduler has something
 * to work with: fifteen plausible student weeks, deterministic, with a couple
 * of gaps on purpose (one member who never entered anything, one who entered
 * classes but did not confirm).
 */
import type { AvailabilityKind } from "../src/db/schema";

export type DemoBlock = {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  kind: AvailabilityKind;
  label: string | null;
};

export type DemoWeek = { blocks: DemoBlock[]; confirmed: boolean };

const at = (h: number, m = 0) => h * 60 + m;
const MWF = [1, 3, 5];
const MW = [1, 3];
const TTH = [2, 4];

type Line = [label: string | null, days: number[], start: number, end: number, kind?: AvailabilityKind];

const WEEKS: { confirmed: boolean; lines: Line[] }[] = [
  // 0 — the admin: a light senior-year load.
  { confirmed: true, lines: [["FIN 410 Venture Capital", TTH, at(9, 30), at(10, 45)], ["ECON 380", MW, at(11), at(12, 15)], ["Thesis seminar", [3], at(15), at(17)]] },
  { confirmed: true, lines: [["CS 229", TTH, at(11), at(12, 15)], ["STAT 210", MWF, at(10), at(10, 50)], ["MGMT 301", MW, at(14), at(15, 15)], ["Rowing", [1, 2, 3, 4, 5], at(6), at(7, 30), "busy"]] },
  { confirmed: true, lines: [["ACCT 201", MWF, at(9), at(9, 50)], ["FIN 310", TTH, at(12, 30), at(13, 45)], ["PHIL 120", TTH, at(14), at(15, 15)], [null, [5], at(16), at(22), "prefer_not"]] },
  { confirmed: true, lines: [["ECON 201", MWF, at(10, 30), at(11, 20)], ["CS 161", TTH, at(14), at(15, 20)], ["CS 161 lab", [3], at(13), at(14, 50)], ["HIST 150", TTH, at(9, 30), at(10, 45)]] },
  { confirmed: true, lines: [["MATH 221", MWF, at(11), at(11, 50)], ["PHYS 150", TTH, at(9, 30), at(10, 45)], ["PHYS 150 lab", [2], at(13), at(15, 50)], ["Library desk", [1, 3], at(15), at(18), "busy"]] },
  { confirmed: true, lines: [["MKTG 301", MW, at(12, 30), at(13, 45)], ["STAT 110", TTH, at(11), at(12, 15)], ["ENGL 205", MWF, at(9), at(9, 50)]] },
  { confirmed: true, lines: [["BIO 240", MWF, at(13), at(13, 50)], ["CHEM 210", TTH, at(8), at(9, 15)], ["CHEM 210 lab", [4], at(13), at(16, 50)], [null, [1, 2, 3, 4, 5], at(8), at(9, 30), "prefer_not"]] },
  { confirmed: true, lines: [["LAW 310", TTH, at(15, 30), at(16, 45)], ["FIN 350", MW, at(9, 30), at(10, 45)], ["ECON 420", MW, at(13), at(14, 15)]] },
  { confirmed: true, lines: [["CS 245", MWF, at(14), at(14, 50)], ["DSGN 110", TTH, at(12, 30), at(14, 20)], ["ECON 201", MWF, at(10, 30), at(11, 20)], ["Tutoring", [2, 4], at(17), at(19), "busy"]] },
  // 9 — entered classes, never pressed confirm.
  { confirmed: false, lines: [["POLI 230", TTH, at(11), at(12, 15)], ["STAT 210", MWF, at(10), at(10, 50)]] },
  { confirmed: true, lines: [["OPIM 220", MW, at(14), at(15, 15)], ["FIN 310", TTH, at(12, 30), at(13, 45)], ["SPAN 201", [1, 2, 3, 4], at(9), at(9, 50)]] },
  { confirmed: true, lines: [["ARTH 101", TTH, at(14), at(15, 15)], ["ECON 101", MWF, at(11), at(11, 50)]] },
  // 12 — nothing on file: the finder reports them as unknown.
  { confirmed: false, lines: [] },
  { confirmed: true, lines: [["MGMT 410", TTH, at(9, 30), at(10, 45)], ["FIN 420", MW, at(15, 30), at(16, 45)], ["Club soccer", [2, 4], at(18), at(19, 30), "busy"]] },
  { confirmed: true, lines: [["CS 330", MWF, at(13), at(13, 50)], ["MATH 310", TTH, at(11), at(12, 15)], ["RA duty", [0], at(18), at(22), "busy"]] },
];

/** One week per member, in the order members are seeded. Extra members get no schedule. */
export function demoWeek(memberIndex: number): DemoWeek {
  const week = WEEKS[memberIndex];
  if (!week) return { blocks: [], confirmed: false };
  return {
    confirmed: week.confirmed,
    blocks: week.lines.flatMap(([label, days, startMinute, endMinute, kind = "class"]) =>
      days.map((dayOfWeek) => ({ dayOfWeek, startMinute, endMinute, kind, label }))
    ),
  };
}
