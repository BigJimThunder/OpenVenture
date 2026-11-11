import type { AvailabilityKind } from "@/db/schema";
import { DAY_MINUTES } from "./time";

/**
 * A member's weekly schedule as plain data: what the editor holds, what the
 * parsers produce, and what gets saved. Pure.
 */

export const BLOCK_KINDS = ["class", "busy", "prefer_not"] as const satisfies readonly AvailabilityKind[];

export const KIND_LABEL: Record<AvailabilityKind, string> = {
  class: "Class",
  busy: "Other busy",
  prefer_not: "Prefer not",
};

/** One member, one term. Generous: five classes with labs and a job is ~30. */
export const MAX_BLOCKS_PER_TERM = 80;
export const MIN_BLOCK_MINUTES = 15;
export const SNAP_MINUTES = 15;
export const MAX_LABEL_LENGTH = 60;

export type ScheduleBlock = {
  /** 0 = Sunday … 6 = Saturday. */
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
  kind: AvailabilityKind;
  label: string | null;
};

/** A class as people say it: a name, some days, one time. */
export type ParsedClass = {
  label: string | null;
  days: number[];
  startMinute: number;
  endMinute: number;
};

export function isValidBlock(b: ScheduleBlock): boolean {
  return (
    Number.isInteger(b.dayOfWeek) &&
    b.dayOfWeek >= 0 &&
    b.dayOfWeek <= 6 &&
    Number.isInteger(b.startMinute) &&
    Number.isInteger(b.endMinute) &&
    b.startMinute >= 0 &&
    b.endMinute <= DAY_MINUTES &&
    b.startMinute < b.endMinute
  );
}

export function snap(minute: number, step = SNAP_MINUTES): number {
  return Math.max(0, Math.min(DAY_MINUTES, Math.round(minute / step) * step));
}

export function classesToBlocks(classes: readonly ParsedClass[], kind: AvailabilityKind = "class"): ScheduleBlock[] {
  return classes.flatMap((c) =>
    c.days.map((dayOfWeek) => ({
      dayOfWeek,
      startMinute: c.startMinute,
      endMinute: c.endMinute,
      kind,
      label: c.label,
    }))
  );
}

function cleanLabel(label: string | null): string | null {
  const text = label?.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL_LENGTH);
  return text ? text : null;
}

/**
 * Sort, drop anything invalid, and fuse blocks that say the same thing twice:
 * same day, kind and label, touching or overlapping. Adding "ECON 201 MWF"
 * a second time therefore changes nothing.
 */
export function normalizeBlocks(blocks: readonly ScheduleBlock[]): ScheduleBlock[] {
  const sorted = blocks
    .filter(isValidBlock)
    .map((b) => ({ ...b, label: cleanLabel(b.label) }))
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.kind.localeCompare(b.kind) ||
        (a.label ?? "").localeCompare(b.label ?? "") ||
        a.startMinute - b.startMinute
    );
  const out: ScheduleBlock[] = [];
  for (const b of sorted) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.dayOfWeek === b.dayOfWeek &&
      prev.kind === b.kind &&
      prev.label === b.label &&
      b.startMinute <= prev.endMinute
    ) {
      prev.endMinute = Math.max(prev.endMinute, b.endMinute);
    } else {
      out.push({ ...b });
    }
  }
  return out.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinute - b.startMinute);
}

/** Blocks grouped back into "ECON 201 · Mon Wed Fri · 10:30–11:20" rows for lists. */
export function groupBlocks(blocks: readonly ScheduleBlock[]): (ParsedClass & { kind: AvailabilityKind })[] {
  const groups = new Map<string, ParsedClass & { kind: AvailabilityKind }>();
  for (const b of normalizeBlocks(blocks)) {
    const key = `${b.kind}|${b.label ?? ""}|${b.startMinute}|${b.endMinute}`;
    const g = groups.get(key);
    if (g) g.days.push(b.dayOfWeek);
    else
      groups.set(key, {
        kind: b.kind,
        label: b.label,
        days: [b.dayOfWeek],
        startMinute: b.startMinute,
        endMinute: b.endMinute,
      });
  }
  return [...groups.values()].sort((a, b) => a.days[0] - b.days[0] || a.startMinute - b.startMinute);
}

/** Weekly hours of hard commitments — a sanity number shown back to the member. */
export function weeklyBusyMinutes(blocks: readonly ScheduleBlock[]): number {
  return blocks.filter((b) => b.kind !== "prefer_not").reduce((sum, b) => sum + (b.endMinute - b.startMinute), 0);
}
