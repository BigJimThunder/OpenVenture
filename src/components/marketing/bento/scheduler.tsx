"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Chip } from "../kit";

/**
 * "When is the committee free?" as the scheduler answers it: one cell per
 * hour of the week, darker where more members have no class. Fictional club,
 * fixed data. Two of the fifteen have no schedule on file, and as in the app
 * they are counted as unknown, never as free.
 */

const MEMBERS = 15;
const UNKNOWN = 2;

const DAYS = [
  { short: "Mon", long: "Monday" },
  { short: "Tue", long: "Tuesday" },
  { short: "Wed", long: "Wednesday" },
  { short: "Thu", long: "Thursday" },
  { short: "Fri", long: "Friday" },
];
/** Start of each hour-long slot, 24-hour clock. */
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17];

/** Members free in each slot: FREE[hour][day]. Classes fill the mornings. */
const FREE = [
  [3, 2, 4, 2, 5],
  [2, 3, 3, 3, 4],
  [4, 2, 5, 4, 6],
  [7, 6, 8, 6, 8],
  [5, 4, 6, 5, 9],
  [6, 5, 7, 4, 10],
  [8, 7, 9, 8, 12],
  [9, 8, 13, 9, 10],
  [11, 9, 10, 10, 9],
];

type Slot = { h: number; d: number };

/** The three slots with the most members free, best first. */
const BEST: Slot[] = FREE.flatMap((row, h) => row.map((free, d) => ({ h, d, free })))
  .sort((a, b) => b.free - a.free)
  .slice(0, 3);
const RANK_LABEL = ["Best time", "2nd best", "3rd best"];
const rankOf = (s: Slot) => BEST.findIndex((b) => b.h === s.h && b.d === s.d);

/** Five steps of the accent, fewer free to more free. */
const STEPS = [7, 24, 44, 68, 94];
const level = (free: number) => (free <= 3 ? 0 : free <= 6 ? 1 : free <= 9 ? 2 : free <= 11 ? 3 : 4);
const fill = (step: number) => `color-mix(in oklch, var(--accent) ${STEPS[step]}%, transparent)`;

const h12 = (hour: number) => (hour > 12 ? hour - 12 : hour);
const meridiem = (hour: number) => (hour < 12 ? "am" : "pm");
const hourLabel = (hour: number) => `${h12(hour)} ${meridiem(hour)}`;
/** "4–5 pm", "11 am–12 pm". */
function rangeLabel(hour: number) {
  const end = hour + 1;
  return meridiem(hour) === meridiem(end)
    ? `${h12(hour)}–${h12(end)} ${meridiem(end)}`
    : `${hourLabel(hour)}–${hourLabel(end)}`;
}

const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export function SchedulerVisual() {
  const [sel, setSel] = React.useState<Slot>({ h: BEST[0].h, d: BEST[0].d });
  const cells = React.useRef<(HTMLButtonElement | null)[]>([]);

  const free = FREE[sel.h][sel.d];
  const busy = MEMBERS - UNKNOWN - free;
  const rank = rankOf(sel);

  function onKeyDown(e: React.KeyboardEvent, s: Slot) {
    const move = KEYS[e.key];
    if (!move) return;
    e.preventDefault();
    const next = {
      d: Math.min(DAYS.length - 1, Math.max(0, s.d + move[0])),
      h: Math.min(HOURS.length - 1, Math.max(0, s.h + move[1])),
    };
    setSel(next);
    cells.current[next.h * DAYS.length + next.d]?.focus();
  }

  return (
    <div className="flex h-full flex-col">
      <div
        role="group"
        aria-label="Committee availability by hour, Monday to Friday. Arrow keys move between hours."
        className="grid flex-1 gap-[3px]"
        style={{
          gridTemplateColumns: "2rem repeat(5, minmax(0, 1fr))",
          gridTemplateRows: "auto repeat(9, minmax(0, 1fr))",
        }}
      >
        <span aria-hidden />
        {DAYS.map((day, d) => (
          <span
            key={day.short}
            aria-hidden
            className={cn("text-center text-2xs leading-4", d === sel.d ? "font-medium text-fg" : "text-fg-subtle")}
          >
            {day.short}
          </span>
        ))}

        {HOURS.map((hour, h) => (
          <React.Fragment key={hour}>
            <span
              aria-hidden
              className={cn(
                "tnum self-center whitespace-nowrap pr-1 text-right text-2xs leading-none",
                h === sel.h ? "font-medium text-fg" : "text-fg-subtle"
              )}
            >
              {hourLabel(hour)}
            </span>
            {DAYS.map((day, d) => {
              const n = FREE[h][d];
              const selected = sel.h === h && sel.d === d;
              const r = rankOf({ h, d });
              return (
                <button
                  key={day.short}
                  ref={(el) => {
                    cells.current[h * DAYS.length + d] = el;
                  }}
                  type="button"
                  tabIndex={selected ? 0 : -1}
                  aria-pressed={selected}
                  aria-label={`${day.long} ${hourLabel(hour)}: ${n} of ${MEMBERS} free, ${UNKNOWN} unknown${
                    r >= 0 ? `, ${RANK_LABEL[r].toLowerCase()}` : ""
                  }`}
                  onClick={() => setSel({ h, d })}
                  onFocus={() => setSel({ h, d })}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setSel({ h, d })}
                  onKeyDown={(e) => onKeyDown(e, { h, d })}
                  className={cn(
                    "relative flex min-h-[1.125rem] cursor-pointer items-center justify-center rounded-[0.3125rem] bg-bg-subtle outline-offset-[1.5px] transition-shadow focus-visible:shadow-[0_0_0_5px_color-mix(in_oklch,var(--accent)_55%,transparent)] max-md:min-h-7",
                    selected
                      ? "z-10 outline-2 outline-fg"
                      : r >= 0
                        ? "outline-[1.5px] outline-accent"
                        : "outline-none"
                  )}
                  style={{ backgroundImage: `linear-gradient(${fill(level(n))}, ${fill(level(n))})` }}
                >
                  {r >= 0 && <span aria-hidden className="size-1.5 rounded-full bg-accent-fg" />}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* The selected hour */}
      <div className="mt-3">
        <p className="tnum text-sm leading-5">
          <span className="font-semibold text-fg">
            {DAYS[sel.d].short} {rangeLabel(HOURS[sel.h])}
          </span>
          <span className="text-fg-muted">
            {" "}
            · {free} of {MEMBERS} free · {UNKNOWN} unknown
          </span>
        </p>
        <div className="mt-1.5 flex h-5 items-center justify-between gap-3">
          <span aria-hidden className="flex gap-[3px]">
            {Array.from({ length: MEMBERS }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-1.5 rounded-full",
                  i < free
                    ? "bg-accent"
                    : i < free + busy
                      ? "bg-border-strong"
                      : "border border-fg-subtle"
                )}
              />
            ))}
          </span>
          {rank >= 0 && <Chip tone="accent">{RANK_LABEL[rank]}</Chip>}
        </div>
      </div>

      <div aria-hidden className="mt-2.5 flex items-center gap-1.5 text-2xs text-fg-subtle">
        <span>Fewer free</span>
        <span className="flex gap-0.5">
          {STEPS.map((_, i) => (
            <span key={i} className="h-2.5 w-3.5 rounded-[3px] bg-bg-subtle" style={{ backgroundImage: `linear-gradient(${fill(i)}, ${fill(i)})` }} />
          ))}
        </span>
        <span>More</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="inline-flex h-2.5 w-3.5 items-center justify-center rounded-[3px] outline-[1.5px] outline-offset-1 outline-accent" style={{ background: fill(4) }}>
            <span className="size-1 rounded-full bg-accent-fg" />
          </span>
          Top three
        </span>
      </div>
    </div>
  );
}
