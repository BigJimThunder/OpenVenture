"use client";

import * as React from "react";
import Link from "next/link";
import { CheckIcon, CircleHelpIcon } from "lucide-react";
import type { ActionResult } from "@/lib/actions/safe-action";
import type { SlotOption } from "@/lib/scheduling/engine";
import { attendanceLabel, conflictPhrase, firstName, nameList, slotWindow } from "@/lib/scheduling/format";
import { formatDay, formatMinute, type IsoDay } from "@/lib/scheduling/time";
import type { FinderMember, PersonView } from "@/lib/scheduling/views";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { ToggleChip } from "./segmented";

/**
 * Run a server read whenever `key` changes, a beat after the last change,
 * and ignore answers that arrive for a question no longer being asked.
 * Pass null to ask nothing.
 */
export function useFinderQuery<T>(
  key: string | null,
  run: () => Promise<ActionResult<T>>
): { data: T | null; error: string | null; loading: boolean } {
  const [answer, setAnswer] = React.useState<{ key: string; result: ActionResult<T> } | null>(null);
  const runRef = React.useRef(run);
  React.useEffect(() => {
    runRef.current = run;
  });
  React.useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      runRef.current().then(
        (result) => !cancelled && setAnswer({ key, result }),
        () => !cancelled && setAnswer({ key, result: { ok: false, code: "error", error: "Couldn't reach the server." } })
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key]);

  const current = key !== null && answer?.key === key ? answer.result : null;
  return {
    // Keep showing the last good answer while the next one loads, so the list does not flash empty.
    data: current?.ok ? current.data : key !== null && answer?.result.ok ? answer.result.data : null,
    error: current && !current.ok ? current.error : null,
    loading: key !== null && !current,
  };
}

export function useNameOf(members: readonly FinderMember[]): (id: string) => string {
  return React.useMemo(() => {
    const names = new Map(members.map((m) => [m.id, m.name]));
    return (id: string) => names.get(id) ?? "Someone";
  }, [members]);
}

/** People as toggle pills. `locked` ones are shown on and cannot be removed. */
export function MemberChips({
  members,
  selected,
  onToggle,
  locked,
  viewerId,
  unknown,
}: {
  members: readonly { id: string; name: string }[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  locked?: ReadonlySet<string>;
  viewerId?: string;
  /** Members with no schedule on file: marked, so the gap is visible before anyone searches. */
  unknown?: ReadonlySet<string>;
}) {
  // Phones show first names when that is enough to tell people apart.
  const firsts = members.map((m) => firstName(m.name));
  const shortOf = (m: { name: string }, i: number) =>
    firsts.indexOf(firsts[i]) === firsts.lastIndexOf(firsts[i]) ? firsts[i] : m.name;
  return (
    <div className="flex flex-wrap gap-1.5">
      {members.map((m, i) => {
        const on = selected.has(m.id);
        const noSchedule = unknown?.has(m.id);
        return (
          <ToggleChip
            key={m.id}
            pressed={on}
            disabled={locked?.has(m.id)}
            onPressedChange={() => onToggle(m.id)}
            className="disabled:opacity-100"
            title={noSchedule ? `${m.name} hasn't entered a schedule` : undefined}
          >
            {on && <CheckIcon className="size-3.5" />}
            {m.id === viewerId ? (
              "You"
            ) : (
              <>
                <span className="sm:hidden">{shortOf(m, i)}</span>
                <span className="max-sm:hidden">{m.name}</span>
              </>
            )}
            {noSchedule && (
              <>
                <CircleHelpIcon aria-hidden className="size-3.5 opacity-70" />
                <span className="sr-only">(no schedule on file)</span>
              </>
            )}
          </ToggleChip>
        );
      })}
    </div>
  );
}

/**
 * The honest part: who the suggestions do not account for, and the switch to
 * count them as possibly free.
 */
export function UnknownNotice({
  unknown,
  nameOf,
  includeUnknown,
  onIncludeChange,
  hasTerms,
  canManageClub,
}: {
  unknown: readonly string[];
  nameOf: (id: string) => string;
  includeUnknown: boolean;
  onIncludeChange: (next: boolean) => void;
  hasTerms: boolean;
  canManageClub?: boolean;
}) {
  const id = React.useId();
  if (!hasTerms) {
    return (
      <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
        The club has no academic term set up, so nobody&apos;s class schedule is on file and these times only avoid club
        meetings and coffee chats.{" "}
        {canManageClub ? (
          <Link href="/settings#calendar" className="font-medium underline underline-offset-2">
            Set up terms
          </Link>
        ) : (
          "An admin sets terms in Settings."
        )}
      </p>
    );
  }
  if (unknown.length === 0) return null;
  const names = nameList(unknown.map((u) => firstName(nameOf(u))), 4);
  return (
    <div className="flex items-start gap-3 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="font-medium">
          {unknown.length === 1
            ? `${names} hasn't entered a schedule.`
            : `${unknown.length} haven't entered a schedule: ${names}.`}
        </span>{" "}
        {includeUnknown
          ? "Counted as possibly free. Ask before you rely on it."
          : "Left out of these times. Ask them, or count them as possibly free."}
      </label>
      <span className="-m-2 flex shrink-0 p-2">
        <Switch id={id} checked={includeUnknown} onCheckedChange={onIncludeChange} aria-label="Include members without a schedule as possibly free" />
      </span>
    </div>
  );
}

export type SlotItem = {
  key: string;
  day: IsoDay;
  /** Epoch ms of the suggested start. */
  start: number;
  time: string;
  /** Second line: who, or how many. */
  detail?: string;
  tone?: "full" | "partial";
};

/** Suggested times as tappable chips, one row of them per day. */
export function SlotsByDay({
  items,
  selected,
  onPick,
  bestKey,
  initialDays,
}: {
  items: readonly SlotItem[];
  selected: number | null;
  onPick: (item: SlotItem) => void;
  /** Marked "Best". */
  bestKey?: string;
  /** Show this many days at first, with the rest behind "Show more days". */
  initialDays?: number;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const days = new Map<IsoDay, SlotItem[]>();
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    days.set(item.day, [...(days.get(item.day) ?? []), item]);
  }
  const groups = [...days.entries()];
  // Never hide the day that holds the best or the chosen slot.
  const mustShow = groups.findLastIndex(([, list]) => list.some((i) => i.key === bestKey || i.start === selected)) + 1;
  const limit = showAll || !initialDays ? groups.length : Math.max(initialDays, mustShow);
  return (
    <div className="flex flex-col gap-2.5">
      {groups.slice(0, limit).map(([day, list]) => (
        <div key={day} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <div className="tnum shrink-0 pt-px text-xs font-medium text-fg-muted sm:w-20 sm:pt-2">{formatDay(day)}</div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {list.map((item) => {
              const on = selected === item.start;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(item)}
                  className={cn(
                    "tnum flex min-h-10 cursor-pointer flex-col items-start justify-center rounded-md border px-2.5 py-1 text-left text-sm leading-tight transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:min-h-8",
                    on
                      ? "border-accent bg-accent text-accent-fg"
                      : item.tone === "partial"
                        ? "border-dashed border-border-strong bg-panel text-fg hover:border-fg-subtle"
                        : "border-border-strong bg-panel text-fg hover:border-accent/60 hover:bg-accent-subtle"
                  )}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.time}
                    {item.key === bestKey && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 text-2xs font-medium",
                          on ? "bg-accent-fg/20" : "bg-accent-subtle text-accent"
                        )}
                      >
                        Best
                      </span>
                    )}
                  </span>
                  {item.detail && <span className={cn("text-2xs", on ? "opacity-90" : "text-fg-muted")}>{item.detail}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {limit < groups.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="min-h-8 cursor-pointer self-start text-xs font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:min-h-10"
        >
          Show {groups.length - limit} more {groups.length - limit === 1 ? "day" : "days"}
        </button>
      )}
    </div>
  );
}

/** Group suggestions (mode A) as chip items. */
export function groupSlotItems(
  byDay: readonly { day: IsoDay; options: readonly SlotOption[] }[],
  nameOf: (id: string) => string
): SlotItem[] {
  return byDay.flatMap((d) =>
    d.options.map((o) => ({
      key: `${o.day}|${o.startMinute}`,
      day: o.day,
      start: o.start,
      time: formatMinute(o.startMinute),
      detail:
        o.missing.length > 0
          ? attendanceLabel(o, nameOf)
          : o.windowEnd - o.windowStart > o.durationMinutes
            ? `free ${slotWindow({ ...o, durationMinutes: o.windowEnd - o.windowStart })}`
            : undefined,
      tone: o.missing.length > 0 ? ("partial" as const) : ("full" as const),
    }))
  );
}

/** One line per person at a specific time: free, possibly free, or what is in the way. */
export function PeopleAtTime({
  people,
  nameOf,
  viewerId,
  only = "all",
}: {
  people: readonly PersonView[];
  nameOf: (id: string) => string;
  viewerId?: string;
  /** "problems" hides the people who are simply free. */
  only?: "all" | "problems";
}) {
  const label = (id: string) => (id === viewerId ? "You" : firstName(nameOf(id)));
  const rows = people.filter((p) => only === "all" || p.state !== "free" || p.soft);
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {rows.map((p) => {
        const name = label(p.memberId);
        const you = p.memberId === viewerId;
        const text =
          p.state === "busy" && p.conflict
            ? conflictPhrase(name, p.conflict).replace(/^You has /, "You have ").replace(/^You is /, "You are ")
            : p.state === "unknown" || p.state === "maybe"
              ? `${name} ${you ? "haven't" : "hasn't"} entered a schedule`
              : p.soft
                ? `${name} ${you ? "are" : "is"} free but would rather not`
                : `${name} ${you ? "are" : "is"} free`;
        const tone =
          p.state === "busy" ? "bg-danger" : p.state === "free" && !p.soft ? "bg-success" : "bg-warning";
        return (
          <li key={p.memberId} className="flex items-start gap-2">
            <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone)} />
            <span className={cn("tnum min-w-0", p.state === "free" && !p.soft && "text-fg-muted")}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
