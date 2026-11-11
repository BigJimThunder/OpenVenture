import { MAX_LABEL_LENGTH, type ParsedClass } from "./blocks";

/**
 * Reads class schedules the way students paste them:
 *
 *   ECON 201 MWF 10:30-11:20am
 *   TuTh 2–3:20 PM
 *   CS 101 - Mon/Wed 9:00 AM - 10:15 AM
 *   Stats lab  Friday 13:00-14:50
 *
 * One class per line: a time range, the days next to it, and whatever is left
 * is the name. Lines it cannot read are returned untouched so the page can
 * say which ones were skipped. Pure.
 */

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, sundays: 0,
  mon: 1, monday: 1, mondays: 1,
  tue: 2, tues: 2, tuesday: 2, tuesdays: 2,
  wed: 3, weds: 3, wednesday: 3, wednesdays: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, thursdays: 4,
  fri: 5, friday: 5, fridays: 5,
  sat: 6, saturday: 6, saturdays: 6,
};

/** Registrar shorthand, longest first: "TuTh", "MWF", "TR" (R = Thursday), "MTWThF". */
const DAY_CODES: [string, number][] = [
  ["th", 4], ["tu", 2], ["sa", 6], ["su", 0],
  ["m", 1], ["t", 2], ["w", 3], ["r", 4], ["f", 5], ["s", 6], ["u", 0],
];

function readCompact(token: string): number[] | null {
  const lower = token.toLowerCase();
  const days: number[] = [];
  for (let i = 0; i < lower.length; ) {
    const code = DAY_CODES.find(([c]) => lower.startsWith(c, i));
    if (!code) return null;
    days.push(code[1]);
    i += code[0].length;
  }
  // "TT" or "MM" is a course code, not a schedule.
  return days.length > 0 && new Set(days).size === days.length ? days : null;
}

function readDayToken(token: string): number[] | null {
  const word = token.toLowerCase().replace(/\.$/, "");
  if (word in DAY_WORDS) return [DAY_WORDS[word]];
  // "Mon-Fri", "M-F"
  const range = /^([a-z]+)[-–—]([a-z]+)$/.exec(word);
  if (range) {
    const from = readDayToken(range[1]);
    const to = readDayToken(range[2]);
    if (from?.length === 1 && to?.length === 1 && from[0] < to[0]) {
      return Array.from({ length: to[0] - from[0] + 1 }, (_, i) => from[0] + i);
    }
    return null;
  }
  // "Mon/Wed", "Tu,Th"
  if (/[/,&+]/.test(word)) {
    const parts = word.split(/[/,&+]/).filter(Boolean).map(readDayToken);
    return parts.length > 0 && parts.every((p) => p) ? parts.flatMap((p) => p!) : null;
  }
  return /^[a-z]+$/.test(word) ? readCompact(word) : null;
}

const MERIDIEM = String.raw`(a\.?m?\.?|p\.?m?\.?)`;
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*${MERIDIEM}?`;
const TIME_RANGE = new RegExp(String.raw`(?<![\d:])${TIME}\s*(?:-|–|—|to|until)\s*${TIME}(?![\d:])`, "i");

type Clock = { hour: number; minute: number; meridiem: "am" | "pm" | null };

function clock(hour: string, minute: string | undefined, meridiem: string | undefined): Clock | null {
  const h = Number(hour);
  const m = minute ? Number(minute) : 0;
  if (h > 24 || m > 59) return null;
  const half = meridiem ? (meridiem.toLowerCase().startsWith("a") ? "am" : "pm") : null;
  if (half && (h < 1 || h > 12)) return null;
  return { hour: h, minute: m, meridiem: half };
}

function to24(c: Clock, meridiem: "am" | "pm"): number {
  return ((c.hour % 12) + (meridiem === "pm" ? 12 : 0)) * 60 + c.minute;
}

/**
 * Resolve a start and end that may be missing AM/PM. A single marker applies
 * to both unless that would end before it starts ("11-1pm" is 11 AM to 1 PM).
 * With no marker, hours past 12 are 24-hour time; otherwise classes are
 * assumed to sit between 8 AM and 8 PM, so "2-3:20" is the afternoon.
 */
function resolve(start: Clock, end: Clock): [number, number] | null {
  let s: number;
  let e: number;
  if (start.meridiem && end.meridiem) {
    s = to24(start, start.meridiem);
    e = to24(end, end.meridiem);
  } else if (end.meridiem) {
    e = to24(end, end.meridiem);
    s = to24(start, end.meridiem);
    if (s >= e) s = to24(start, end.meridiem === "pm" ? "am" : "pm");
  } else if (start.meridiem) {
    s = to24(start, start.meridiem);
    e = to24(end, start.meridiem);
    if (e <= s) e = to24(end, start.meridiem === "am" ? "pm" : "am");
  } else if (start.hour > 12 || end.hour > 12 || start.hour === 0) {
    s = start.hour * 60 + start.minute;
    e = end.hour * 60 + end.minute;
  } else {
    s = to24(start, start.hour >= 8 && start.hour < 12 ? "am" : "pm");
    e = to24(end, "am");
    if (e <= s) e = to24(end, "pm");
  }
  return s < e && e <= 1440 ? [s, e] : null;
}

const SEPARATOR = /^[-–—|:;,@·•]+$/;

function tokens(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** Day tokens touching the time range, on the given side of it. */
function daysBeside(words: string[], from: "end" | "start"): { days: number[]; rest: string[] } {
  const list = from === "end" ? [...words].reverse() : [...words];
  const days: number[] = [];
  let used = 0;
  for (const raw of list) {
    const word = raw.replace(/^[(\[]|[)\],;:]$/g, "");
    if (SEPARATOR.test(raw) || /^(and|&|on|at|from)$/i.test(word)) {
      used++;
      continue;
    }
    const found = word ? readDayToken(word) : null;
    if (!found) break;
    days.push(...found);
    used++;
  }
  if (days.length === 0) return { days: [], rest: words };
  const rest = from === "end" ? words.slice(0, words.length - used) : words.slice(used);
  return { days, rest };
}

function tidyLabel(words: string[]): string | null {
  const text = words
    .join(" ")
    .replace(/^[\s\-–—|:;,@·•]+|[\s\-–—|:;,@·•]+$/g, "")
    .slice(0, MAX_LABEL_LENGTH)
    .trim();
  return text || null;
}

export function parseClassLine(line: string): ParsedClass | null {
  const match = TIME_RANGE.exec(line);
  if (!match) return null;
  const start = clock(match[1], match[2], match[3]);
  const end = clock(match[4], match[5], match[6]);
  if (!start || !end) return null;
  const range = resolve(start, end);
  if (!range) return null;

  const before = tokens(line.slice(0, match.index));
  const after = tokens(line.slice(match.index + match[0].length));
  let found = daysBeside(before, "end");
  let labelWords = [...found.rest, ...after];
  if (found.days.length === 0) {
    found = daysBeside(after, "start");
    labelWords = [...before, ...found.rest];
  }
  if (found.days.length === 0) return null;

  return {
    label: tidyLabel(labelWords),
    days: [...new Set(found.days)].sort((a, b) => a - b),
    startMinute: range[0],
    endMinute: range[1],
  };
}

export type ParsedPaste = {
  classes: ParsedClass[];
  /** Non-blank lines that were not understood, as typed. */
  unparsed: string[];
};

export function parseClassText(text: string): ParsedPaste {
  const classes: ParsedClass[] = [];
  const unparsed: string[] = [];
  for (const raw of text.split(/\r?\n/).slice(0, 200)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseClassLine(line);
    if (parsed) classes.push(parsed);
    else unparsed.push(line.slice(0, 120));
  }
  return { classes, unparsed };
}
