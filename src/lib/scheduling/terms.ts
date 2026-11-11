import type { OrgSettings } from "@/lib/org-settings";
import { addDays, isValidIsoDay, zonedParts, type IsoDay } from "./time";

/**
 * Academic terms: which one is "now", what the next one probably is, and
 * whether a list of them makes sense. Pure — callers pass the clock.
 */

export type Term = OrgSettings["scheduling"]["terms"][number];
export type TermSystem = OrgSettings["scheduling"]["system"];

export function sortTerms(terms: readonly Term[]): Term[] {
  return [...terms].sort((a, b) => a.start.localeCompare(b.start));
}

/** The term a civil day falls in, if any. */
export function termForDate(terms: readonly Term[], day: IsoDay): Term | null {
  return terms.find((t) => t.start <= day && day <= t.end) ?? null;
}

/**
 * The term to ask members about: the one containing today, else the next to
 * start, else the most recent. Null only when the club has no terms.
 */
export function currentTerm(
  scheduling: Pick<OrgSettings["scheduling"], "terms">,
  now: Date,
  timeZone: string
): Term | null {
  const terms = sortTerms(scheduling.terms);
  if (terms.length === 0) return null;
  const today = zonedParts(now, timeZone).day;
  return (
    termForDate(terms, today) ??
    terms.find((t) => t.start > today) ??
    terms[terms.length - 1]
  );
}

/** The term before `term` in the calendar, for "copy from last term". */
export function previousTerm(terms: readonly Term[], term: Term): Term | null {
  const sorted = sortTerms(terms);
  const index = sorted.findIndex((t) => t.key === term.key);
  return index > 0 ? sorted[index - 1] : null;
}

// ——— Defaults ———

type Season = { slug: string; name: string; start: [month: number, day: number]; end: [month: number, day: number] };

/**
 * Typical US dates. They are a starting point the admin adjusts, so they err
 * towards the common case: semesters late August to mid-December and
 * mid-January to early May; quarters late September, early January, late March.
 */
const SEASONS: Record<TermSystem, Season[]> = {
  semester: [
    { slug: "spring", name: "Spring", start: [1, 13], end: [5, 8] },
    { slug: "fall", name: "Fall", start: [8, 25], end: [12, 12] },
  ],
  quarter: [
    { slug: "winter", name: "Winter", start: [1, 5], end: [3, 20] },
    { slug: "spring", name: "Spring", start: [3, 30], end: [6, 12] },
    { slug: "summer", name: "Summer", start: [6, 22], end: [8, 28] },
    { slug: "fall", name: "Fall", start: [9, 28], end: [12, 11] },
  ],
};

function seasonTerm(season: Season, year: number): Term {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    key: `${year}-${season.slug}`,
    name: `${season.name} ${year}`,
    start: `${year}-${pad(season.start[0])}-${pad(season.start[1])}`,
    end: `${year}-${pad(season.end[0])}-${pad(season.end[1])}`,
  };
}

/** Default terms in calendar order, from `fromYear` for a few years. */
function defaultSequence(system: TermSystem, fromYear: number, years = 4): Term[] {
  const out: Term[] = [];
  for (let y = fromYear; y < fromYear + years; y++) {
    for (const season of SEASONS[system]) out.push(seasonTerm(season, y));
  }
  return out;
}

/**
 * The default term for a club being set up today: the one in session, or if
 * it is a break, the next to start.
 */
export function defaultTermFor(system: TermSystem, today: IsoDay): Term {
  const year = Number(today.slice(0, 4));
  const sequence = defaultSequence(system, year, 2);
  return termForDate(sequence, today) ?? sequence.find((t) => t.start > today) ?? sequence[0];
}

/**
 * What "Add next term" pre-fills: the first default term that starts after
 * the last one on file (or the term for today when there are none). Summer is
 * offered like any other quarter; the admin deletes it if the club doesn't run.
 */
export function suggestNextTerm(system: TermSystem, terms: readonly Term[], today: IsoDay): Term {
  const sorted = sortTerms(terms);
  const last = sorted[sorted.length - 1];
  if (!last) return defaultTermFor(system, today);
  const keys = new Set(sorted.map((t) => t.key));
  const next = defaultSequence(system, Number(last.end.slice(0, 4))).find(
    (t) => t.start > last.end && !keys.has(t.key)
  );
  if (next) return next;
  // Unreachable for sane dates; fall back to "starts the day after, 15 weeks".
  const start = addDays(last.end, 1);
  return { key: `term-${start}`, name: "Next term", start, end: addDays(start, 15 * 7) };
}

/** A stable key for a term the admin typed in by hand: "Fall 2026" → "fall-2026". */
export function termKeyFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "term";
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}-${i}`;
  return key;
}

// ——— Validation ———

export type TermIssue = { key: string; field: "name" | "start" | "end"; message: string };

/** Empty when the list is fine. One issue per problem, tied to a term and field. */
export function validateTerms(terms: readonly Term[]): TermIssue[] {
  const issues: TermIssue[] = [];
  const seen = new Set<string>();
  for (const t of terms) {
    if (seen.has(t.key)) issues.push({ key: t.key, field: "name", message: "Two terms share the same key." });
    seen.add(t.key);
    if (!t.name.trim()) issues.push({ key: t.key, field: "name", message: "Give the term a name." });
    const startOk = isValidIsoDay(t.start);
    const endOk = isValidIsoDay(t.end);
    if (!startOk) issues.push({ key: t.key, field: "start", message: "Pick a start date." });
    if (!endOk) issues.push({ key: t.key, field: "end", message: "Pick an end date." });
    if (startOk && endOk && t.start >= t.end) {
      issues.push({ key: t.key, field: "end", message: "The term has to end after it starts." });
    }
  }
  const sorted = sortTerms(terms.filter((t) => isValidIsoDay(t.start) && isValidIsoDay(t.end)));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start <= sorted[i - 1].end) {
      issues.push({
        key: sorted[i].key,
        field: "start",
        message: `Overlaps ${sorted[i - 1].name}, which runs to ${sorted[i - 1].end}.`,
      });
    }
  }
  return issues;
}
