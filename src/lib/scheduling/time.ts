/**
 * Calendar arithmetic in a named timezone, with nothing but Intl.
 *
 * The scheduler stores a weekly schedule as "minutes from midnight on a
 * weekday, club time" and has to land it on real dates. Two representations
 * are used throughout: an ISO day string ("2026-11-03", a civil date in the
 * club's zone) and an instant (epoch milliseconds). Everything here is pure.
 */

export const MINUTE = 60_000;
export const DAY_MINUTES = 1440;

/** "2026-11-03" — a civil date with no zone attached. */
export type IsoDay = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      // A bad timezone string in org settings must not take the scheduler down.
      f = formatter("UTC");
    }
    formatters.set(timeZone, f);
  }
  return f;
}

export type ZonedParts = {
  day: IsoDay;
  /** Minutes from local midnight. */
  minute: number;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDay(year: number, month: number, day: number): IsoDay {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function civilMs(day: IsoDay): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(day: IsoDay): number {
  return new Date(civilMs(day)).getUTCDay();
}

export function addDays(day: IsoDay, n: number): IsoDay {
  const d = new Date(civilMs(day) + n * 86_400_000);
  return isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: IsoDay, b: IsoDay): number {
  return Math.round((civilMs(b) - civilMs(a)) / 86_400_000);
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: IsoDay, to: IsoDay): IsoDay[] {
  const days: IsoDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return days;
}

export function isValidIsoDay(day: string): day is IsoDay {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** The wall-clock reading of an instant in a timezone. */
export function zonedParts(instant: Date | number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(typeof instant === "number" ? new Date(instant) : instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const day = isoDay(get("year"), get("month"), get("day"));
  return { day, minute: get("hour") * 60 + get("minute"), weekday: weekdayOf(day) };
}

/** How far the zone's wall clock is ahead of UTC at this instant, in ms. */
function offsetMs(instant: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a wall-clock time happens in a timezone. On the night clocks go
 * forward, a time that does not exist (2:30 AM) resolves to the instant an
 * hour later; on the night they go back, an ambiguous time resolves to its
 * first occurrence. Neither matters for a class schedule, but both are defined.
 */
export function zonedToUtc(day: IsoDay, minute: number, timeZone: string): number {
  const wall = civilMs(day) + minute * MINUTE;
  const first = wall - offsetMs(wall, timeZone);
  const second = wall - offsetMs(first, timeZone);
  if (second === first) return first;
  // The two guesses straddle a transition: prefer the one that round-trips.
  const roundTrips = (guess: number) => guess + offsetMs(guess, timeZone) === wall;
  if (roundTrips(second)) return roundTrips(first) ? Math.min(first, second) : second;
  return roundTrips(first) ? first : Math.max(first, second);
}

/**
 * Minute-of-day → instant for one civil day. Days without a clock change
 * (all but two a year) are a single offset lookup.
 */
export function dayMapper(day: IsoDay, timeZone: string): (minute: number) => number {
  const start = zonedToUtc(day, 0, timeZone);
  const end = zonedToUtc(addDays(day, 1), 0, timeZone);
  if (end - start === DAY_MINUTES * MINUTE) return (minute) => start + minute * MINUTE;
  return (minute) => zonedToUtc(day, minute, timeZone);
}

// ——— Display ———

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** 870 → "2:30 PM"; `meridiem: false` gives "2:30". */
export function formatMinute(minute: number, opts: { meridiem?: boolean } = {}): string {
  const m = ((minute % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const h24 = Math.floor(m / 60);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = `${h12}:${pad(m % 60)}`;
  return opts.meridiem === false ? time : `${time} ${h24 < 12 ? "AM" : "PM"}`;
}

/** "2:00–3:20 PM", or "11:30 AM–1:00 PM" when the range crosses noon. */
export function formatMinuteRange(start: number, end: number): string {
  const sameHalf = start < 720 === end < 720;
  return `${formatMinute(start, { meridiem: !sameHalf })}–${formatMinute(end)}`;
}

/** "Tue, Nov 3" */
export function formatDay(day: IsoDay): string {
  const [, m, d] = day.split("-").map(Number);
  return `${WEEKDAY_SHORT[weekdayOf(day)]}, ${MONTH_SHORT[m - 1]} ${d}`;
}

/** "Nov 3" */
export function formatDayShort(day: IsoDay): string {
  const [, m, d] = day.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${d}`;
}

/** "EST", "PDT" — the zone's short name on a given instant. */
export function zoneAbbreviation(instant: Date | number, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(
      typeof instant === "number" ? new Date(instant) : instant
    );
    return parts.find((p) => p.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return "UTC";
  }
}

/** "09:05" ↔ 545, for `<input type="time">`. */
export function minuteToInput(minute: number): string {
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`;
}

export function inputToMinute(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return minute >= 0 && minute <= DAY_MINUTES ? minute : null;
}
