import { MAX_LABEL_LENGTH, type ParsedClass } from "./blocks";
import type { Term } from "./terms";
import { addDays, daysBetween, isoDay, isValidIsoDay, weekdayOf, zonedParts, zonedToUtc, type IsoDay } from "./time";

/**
 * A deliberately small iCalendar reader: just enough to turn a registrar or
 * Google Calendar export into weekly busy blocks. It understands VEVENT,
 * DTSTART/DTEND (UTC, TZID, or floating), DURATION, and RRULE with
 * FREQ=WEEKLY, BYDAY, UNTIL and COUNT. One-off events, all-day events and
 * other recurrence rules are counted and skipped; EXDATE is ignored (a
 * cancelled lecture does not free the slot every week).
 *
 * Text in, data out — it never fetches anything. Pure.
 */

export const MAX_ICS_BYTES = 1_000_000;
const MAX_EVENTS = 3000;

const BYDAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

type Property = { name: string; params: Record<string, string>; value: string };

/** RFC 5545 §3.1: a line starting with a space or tab continues the previous one. */
export function unfoldIcs(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r\n|\n|\r/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += raw.slice(1);
    } else {
      lines.push(raw);
    }
  }
  return lines;
}

function parseProperty(line: string): Property | null {
  // The value starts at the first colon outside a quoted parameter.
  let quoted = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    else if (line[i] === ":" && !quoted) {
      colon = i;
      break;
    }
  }
  if (colon < 1) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, " ")
    .replace(/\\([,;\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

type LocalStamp = { day: IsoDay; minute: number; utc: boolean };

/** "20260901T103000", "20260901T103000Z". Date-only values return null. */
function parseStamp(value: string): LocalStamp | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const day = isoDay(Number(m[1]), Number(m[2]), Number(m[3]));
  const minute = Number(m[4]) * 60 + Number(m[5]);
  if (!isValidIsoDay(day) || minute >= 1440) return null;
  return { day, minute, utc: Boolean(m[7]) };
}

function parseDateOnly(value: string): IsoDay | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!m) return null;
  const day = isoDay(Number(m[1]), Number(m[2]), Number(m[3]));
  return isValidIsoDay(day) ? day : null;
}

/** "PT1H20M", "PT50M", "P1D" → minutes. */
function parseDuration(value: string): number | null {
  const m = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m) return null;
  const minutes =
    Number(m[1] ?? 0) * 7 * 1440 + Number(m[2] ?? 0) * 1440 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
  return minutes > 0 ? minutes : null;
}

function isKnownZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

type RawEvent = {
  summary: string | null;
  start: Property | null;
  end: Property | null;
  duration: string | null;
  rrule: string | null;
};

function readEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let nested = 0;
  for (const line of unfoldIcs(text)) {
    const upper = line.trim().toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = { summary: null, start: null, end: null, duration: null, rrule: null };
      nested = 0;
      continue;
    }
    if (!current) continue;
    if (upper === "END:VEVENT") {
      events.push(current);
      current = null;
      if (events.length >= MAX_EVENTS) break;
      continue;
    }
    // VALARM and friends carry their own DURATION / SUMMARY — not the event's.
    if (upper.startsWith("BEGIN:")) nested++;
    else if (upper.startsWith("END:")) nested = Math.max(0, nested - 1);
    if (nested > 0 || upper.startsWith("END:")) continue;

    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === "SUMMARY") current.summary = unescapeText(prop.value);
    else if (prop.name === "DTSTART") current.start = prop;
    else if (prop.name === "DTEND") current.end = prop;
    else if (prop.name === "DURATION") current.duration = prop.value;
    else if (prop.name === "RRULE") current.rrule = prop.value;
  }
  return events;
}

export type IcsImport = {
  classes: ParsedClass[];
  /** VEVENTs seen. */
  total: number;
  /** Events that were not weekly-recurring timed events in this term. */
  skipped: number;
};

/**
 * Weekly-recurring events that are in session during `term`, as blocks in
 * the club's timezone.
 */
export function parseIcs(text: string, term: Pick<Term, "start" | "end">, timeZone: string): IcsImport {
  const events = readEvents(text);
  const classes: ParsedClass[] = [];
  const seen = new Set<string>();

  for (const ev of events) {
    if (!ev.start || !ev.rrule || ev.start.params.VALUE === "DATE") continue;
    const start = parseStamp(ev.start.value);
    if (!start) continue;

    const rule = Object.fromEntries(
      ev.rrule.split(";").map((part) => {
        const eq = part.indexOf("=");
        return [part.slice(0, eq).toUpperCase(), part.slice(eq + 1)];
      })
    ) as Record<string, string | undefined>;
    if (rule.FREQ?.toUpperCase() !== "WEEKLY") continue;

    let duration: number | null = null;
    const end = ev.end ? parseStamp(ev.end.value) : null;
    if (end) duration = daysBetween(start.day, end.day) * 1440 + (end.minute - start.minute);
    else if (ev.duration) duration = parseDuration(ev.duration);
    if (!duration || duration <= 0 || duration >= 1440) continue;

    // The source's own weekdays; an event with no BYDAY repeats on its start day.
    const sourceDays = rule.BYDAY
      ? rule.BYDAY.split(",")
          .map((d) => BYDAY[d.trim().toUpperCase().replace(/^[+-]?\d+/, "")])
          .filter((d): d is number => d !== undefined)
      : [weekdayOf(start.day)];
    if (sourceDays.length === 0) continue;

    // Does the series overlap the term?
    const interval = Math.max(1, Number(rule.INTERVAL ?? 1) || 1);
    let lastDay: IsoDay | null = null;
    if (rule.UNTIL) lastDay = parseDateOnly(rule.UNTIL);
    else if (rule.COUNT) {
      const count = Number(rule.COUNT);
      if (Number.isFinite(count) && count > 0) {
        lastDay = addDays(start.day, Math.ceil(count / sourceDays.length) * 7 * interval);
      }
    }
    if (start.day > term.end || (lastDay && lastDay < term.start)) continue;

    // Translate one occurrence inside the term into club time, so the offset
    // between the two zones is the one that applies during the term.
    const zone = ev.start.params.TZID;
    const reference = start.day >= term.start ? start.day : term.start;
    let local = { day: reference, minute: start.minute };
    if (start.utc) {
      local = zonedParts(zonedToUtc(reference, start.minute, "UTC"), timeZone);
    } else if (zone && zone !== timeZone && isKnownZone(zone)) {
      local = zonedParts(zonedToUtc(reference, start.minute, zone), timeZone);
    }
    const shift = daysBetween(reference, local.day);
    const startMinute = local.minute;
    // A class that runs past midnight is cut at midnight; nobody schedules then.
    const endMinute = Math.min(1440, startMinute + duration);
    if (endMinute <= startMinute) continue;

    const days = [...new Set(sourceDays.map((d) => (((d + shift) % 7) + 7) % 7))].sort((a, b) => a - b);
    const label = ev.summary ? ev.summary.slice(0, MAX_LABEL_LENGTH) : null;
    const key = `${label}|${days.join("")}|${startMinute}|${endMinute}`;
    if (seen.has(key)) continue;
    seen.add(key);
    classes.push({ label, days, startMinute, endMinute });
  }

  classes.sort((a, b) => a.days[0] - b.days[0] || a.startMinute - b.startMinute);
  return { classes, total: events.length, skipped: events.length - classes.length };
}
