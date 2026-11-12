"use client";

import * as React from "react";
import type { AvailabilityKind } from "@/db/schema";
import { MIN_BLOCK_MINUTES, snap, type ScheduleBlock } from "@/lib/scheduling/blocks";
import { formatMinute, formatMinuteRange, WEEKDAY_LONG, WEEKDAY_SHORT } from "@/lib/scheduling/time";
import { cn } from "@/lib/utils";

export type EditorBlock = ScheduleBlock & { id: string };

/** Pixels per hour. 15 minutes is a comfortable 12px drag step with a mouse. */
const HOUR_PX = 48;
const PX_PER_MIN = HOUR_PX / 60;
/** Fingers get half-hour rows; exact minutes are set in the block's sheet. */
const TOUCH_SNAP = 30;
const DEFAULT_CLICK_MINUTES = 60;

export const KIND_STYLE: Record<AvailabilityKind, string> = {
  class: "border-accent/45 bg-accent-subtle text-accent",
  busy: "border-border-strong bg-bg-subtle text-fg",
  prefer_not: "border-dashed border-warning-border bg-warning-bg/60 text-warning",
};

type Draft =
  | { type: "paint"; day: number; anchor: number; start: number; end: number }
  | { type: "move"; id: string; day: number; start: number; end: number; grab: number; moved: boolean }
  | { type: "resize"; id: string; edge: "start" | "end"; day: number; start: number; end: number };

/**
 * Blocks that overlap in a day share its width, side by side, so none hides
 * another. Returns each block's column and how many columns its cluster has.
 */
export function layoutDay<T extends { startMinute: number; endMinute: number }>(
  blocks: readonly T[]
): Map<T, { column: number; columns: number }> {
  const out = new Map<T, { column: number; columns: number }>();
  const sorted = [...blocks].sort((a, b) => a.startMinute - b.startMinute || b.endMinute - a.endMinute);
  let cluster: T[] = [];
  let clusterEnd = -1;
  let columnEnds: number[] = [];
  const close = () => {
    for (const b of cluster) out.get(b)!.columns = columnEnds.length;
    cluster = [];
    columnEnds = [];
  };
  for (const b of sorted) {
    if (cluster.length > 0 && b.startMinute >= clusterEnd) close();
    let column = columnEnds.findIndex((end) => end <= b.startMinute);
    if (column < 0) column = columnEnds.length;
    columnEnds[column] = b.endMinute;
    out.set(b, { column, columns: 1 });
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.endMinute);
  }
  close();
  return out;
}

/** Monday first; weekends only when the club schedules on them or a block already sits there. */
export function visibleDays(weekends: boolean, blocks: readonly ScheduleBlock[]): number[] {
  const days = [1, 2, 3, 4, 5];
  if (weekends || blocks.some((b) => b.dayOfWeek === 6)) days.push(6);
  if (weekends || blocks.some((b) => b.dayOfWeek === 0)) days.push(0);
  return days;
}

/**
 * The week, as a grid you paint on. With a mouse: drag on empty space to add
 * a block, drag a block to move it (across days too), drag its top or bottom
 * edge to resize, click it to edit. With a finger: tap a start, tap an end;
 * tap a block to edit it — dragging is left to scrolling.
 */
export function WeekGrid({
  blocks,
  window: hours,
  paintKind = "class",
  onCreate,
  onChange,
  onSelect,
  readOnly = false,
  className,
}: {
  blocks: readonly EditorBlock[];
  window: { dayStartMinute: number; dayEndMinute: number; weekends: boolean };
  paintKind?: AvailabilityKind;
  onCreate?: (block: ScheduleBlock) => void;
  onChange?: (id: string, patch: Pick<ScheduleBlock, "dayOfWeek" | "startMinute" | "endMinute">) => void;
  onSelect?: (id: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const days = visibleDays(hours.weekends, blocks);
  // Show whole hours, widened to fit anything outside the club's usual window.
  const first = Math.floor(Math.min(hours.dayStartMinute, ...blocks.map((b) => b.startMinute)) / 60) * 60;
  const last = Math.ceil(Math.max(hours.dayEndMinute, ...blocks.map((b) => b.endMinute)) / 60) * 60;
  const hourMarks: number[] = [];
  for (let m = first; m < last; m += 60) hourMarks.push(m);

  const columnsRef = React.useRef<HTMLDivElement>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  /** Touch: the first tap of a tap-start / tap-end pair. */
  const [anchor, setAnchor] = React.useState<{ day: number; minute: number } | null>(null);
  const pointerType = React.useRef<string>("mouse");

  function locate(
    e: { clientX: number; clientY: number },
    step: number,
    rounding: "round" | "floor" = "round"
  ): { day: number; minute: number } | null {
    const el = columnsRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const col = Math.min(days.length - 1, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * days.length)));
    const raw = first + (e.clientY - rect.top) / PX_PER_MIN;
    const minute = rounding === "floor" ? Math.floor(raw / step) * step : snap(raw, step);
    return { day: days[col], minute: Math.min(last, Math.max(first, minute)) };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    pointerType.current = e.pointerType;
    if (readOnly || e.pointerType === "touch" || e.button !== 0) return;
    const at = locate(e, 15);
    if (!at) return;
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
    e.currentTarget.setPointerCapture(e.pointerId);
    if (target) {
      const block = blocks.find((b) => b.id === target.dataset.block);
      if (!block) return;
      const edge = (e.target as HTMLElement).dataset.edge as "start" | "end" | undefined;
      setDraft(
        edge
          ? { type: "resize", id: block.id, edge, day: block.dayOfWeek, start: block.startMinute, end: block.endMinute }
          : {
              type: "move",
              id: block.id,
              day: block.dayOfWeek,
              start: block.startMinute,
              end: block.endMinute,
              grab: at.minute - block.startMinute,
              moved: false,
            }
      );
    } else {
      // Floor, so the block starts in the row under the pointer rather than the next one down.
      const cell = locate(e, 15, "floor") ?? at;
      const anchorMinute = Math.min(last - MIN_BLOCK_MINUTES, cell.minute);
      setDraft({ type: "paint", day: cell.day, anchor: anchorMinute, start: anchorMinute, end: anchorMinute });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draft) return;
    const at = locate(e, 15);
    if (!at) return;
    if (draft.type === "paint") {
      const start = Math.min(draft.anchor, at.minute);
      const end = Math.max(draft.anchor, at.minute);
      if (start !== draft.start || end !== draft.end) setDraft({ ...draft, start, end });
    } else if (draft.type === "move") {
      const length = draft.end - draft.start;
      const start = Math.min(last - length, Math.max(first, at.minute - draft.grab));
      if (start !== draft.start || at.day !== draft.day) {
        setDraft({ ...draft, day: at.day, start, end: start + length, moved: true });
      }
    } else {
      const start = draft.edge === "start" ? Math.min(at.minute, draft.end - MIN_BLOCK_MINUTES) : draft.start;
      const end = draft.edge === "end" ? Math.max(at.minute, draft.start + MIN_BLOCK_MINUTES) : draft.end;
      if (start !== draft.start || end !== draft.end) setDraft({ ...draft, start, end });
    }
  }

  function onPointerUp() {
    if (!draft) return;
    setDraft(null);
    if (draft.type === "paint") {
      // A click with no drag still makes a block: an hour, which the sheet can adjust.
      const dragged = draft.end - draft.start >= MIN_BLOCK_MINUTES;
      const end = dragged ? draft.end : Math.min(last, draft.start + DEFAULT_CLICK_MINUTES);
      if (end - draft.start >= MIN_BLOCK_MINUTES) {
        onCreate?.({ dayOfWeek: draft.day, startMinute: draft.start, endMinute: end, kind: paintKind, label: null });
      }
    } else if (draft.type === "move" && !draft.moved) {
      onSelect?.(draft.id);
    } else {
      onChange?.(draft.id, { dayOfWeek: draft.day, startMinute: draft.start, endMinute: draft.end });
    }
  }

  /** Taps and keyboard activation; mouse clicks are already handled by the pointer handlers above. */
  function onTap(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const blockEl = (e.target as HTMLElement).closest<HTMLElement>("[data-block]");
    // detail 0 is a click made by Enter or Space on a focused block.
    if (e.detail === 0) {
      if (blockEl?.dataset.block) onSelect?.(blockEl.dataset.block);
      return;
    }
    if (pointerType.current !== "touch") return;
    if (blockEl?.dataset.block) {
      setAnchor(null);
      onSelect?.(blockEl.dataset.block);
      return;
    }
    const cell = locate(e, TOUCH_SNAP, "floor");
    if (!cell) return;
    const minute = Math.min(last - TOUCH_SNAP, cell.minute);
    const day = cell.day;
    if (!anchor || anchor.day !== day) {
      setAnchor({ day, minute });
      return;
    }
    // The second tap names the last half hour of the block, so tapping the same row twice makes 30 minutes.
    const start = Math.min(anchor.minute, minute);
    const end = Math.max(anchor.minute, minute) + TOUCH_SNAP;
    setAnchor(null);
    onCreate?.({ dayOfWeek: day, startMinute: start, endMinute: end, kind: paintKind, label: null });
  }

  const height = (last - first) * PX_PER_MIN;
  const top = (minute: number) => (minute - first) * PX_PER_MIN;

  return (
    <div className={cn("select-none", className)}>
      {!readOnly && (
        // One fixed-height line that changes its words, so the grid never moves between two taps.
        <div role="status" className="mb-1 flex min-h-10 items-center justify-between gap-3 text-xs text-fg-muted">
          {anchor ? (
            <>
              <span className="font-medium text-accent">
                {WEEKDAY_LONG[anchor.day]} from {formatMinute(anchor.minute)}. Now tap where it ends.
              </span>
              <button
                type="button"
                className="min-h-10 shrink-0 cursor-pointer px-1 font-medium text-accent underline underline-offset-2"
                onClick={() => setAnchor(null)}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span className="pointer-fine:hidden">
                Tap a start time, then an end time. Tap a block to rename, retime or delete it.
              </span>
              <span className="pointer-coarse:hidden">
                Drag on the grid to block out time. Drag a block to move it, its edge to resize, or click it to edit.
              </span>
            </>
          )}
        </div>
      )}
      <div className="flex">
        <div className="w-10 shrink-0 sm:w-12" aria-hidden />
        <div className="grid flex-1" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <div key={d} className="pb-1.5 text-center text-xs font-medium text-fg-muted">
              {WEEKDAY_SHORT[d]}
            </div>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="relative w-10 shrink-0 sm:w-12" style={{ height }} aria-hidden>
          {hourMarks.map((m) => (
            <span
              key={m}
              className="tnum absolute right-1.5 -translate-y-1/2 text-2xs text-fg-subtle first:translate-y-0"
              style={{ top: top(m) }}
            >
              {formatMinute(m).replace(":00", "").replace(" ", "").toLowerCase()}
            </span>
          ))}
        </div>
        <div
          ref={columnsRef}
          role="group"
          aria-label="Weekly schedule"
          className={cn(
            "relative grid flex-1 overflow-hidden rounded-lg border border-border bg-panel",
            !readOnly && "cursor-crosshair touch-pan-y"
          )}
          style={{ height, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDraft(null)}
          onClick={onTap}
        >
          {/* Hour and half-hour rules, behind everything. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {hourMarks.map((m) => (
              <React.Fragment key={m}>
                {m > first && <div className="absolute inset-x-0 border-t border-border" style={{ top: top(m) }} />}
                <div className="absolute inset-x-0 border-t border-dashed border-border/60" style={{ top: top(m + 30) }} />
              </React.Fragment>
            ))}
            {/* Outside the hours the club schedules in. */}
            {first < hours.dayStartMinute && (
              <div className="absolute inset-x-0 top-0 bg-bg-subtle/70" style={{ height: top(hours.dayStartMinute) }} />
            )}
            {last > hours.dayEndMinute && (
              <div className="absolute inset-x-0 bottom-0 bg-bg-subtle/70" style={{ top: top(hours.dayEndMinute) }} />
            )}
          </div>

          {days.map((d, i) => {
            const dayBlocks = blocks.filter((b) => b.dayOfWeek === d && b.id !== (draft && draft.type !== "paint" ? draft.id : null));
            const live = draft && draft.day === d ? draft : null;
            const liveBlock = live && live.type !== "paint" ? blocks.find((b) => b.id === live.id) : null;
            const layout = layoutDay(dayBlocks);
            return (
              <div key={d} className={cn("relative", i > 0 && "border-l border-border")}>
                {dayBlocks.map((b) => (
                  <GridBlock key={b.id} block={b} top={top(b.startMinute)} readOnly={readOnly} slot={layout.get(b)} />
                ))}
                {live?.type === "paint" && (
                  <div
                    className={cn("pointer-events-none absolute inset-x-0.5 rounded-md border", KIND_STYLE[paintKind])}
                    style={{ top: top(live.start), height: Math.max(2, (live.end - live.start) * PX_PER_MIN) }}
                  >
                    <span className="tnum block truncate px-1.5 pt-0.5 text-2xs">
                      {formatMinuteRange(live.start, Math.max(live.end, live.start + MIN_BLOCK_MINUTES))}
                    </span>
                  </div>
                )}
                {live && liveBlock && (
                  <GridBlock
                    block={{ ...liveBlock, dayOfWeek: live.day, startMinute: live.start, endMinute: live.end }}
                    top={top(live.start)}
                    readOnly
                    lifted
                  />
                )}
                {anchor?.day === d && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 rounded-md border-2 border-accent bg-accent/15"
                    style={{ top: top(anchor.minute), height: TOUCH_SNAP * PX_PER_MIN }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GridBlock({
  block,
  top,
  readOnly,
  lifted,
  slot,
}: {
  block: EditorBlock;
  top: number;
  readOnly: boolean;
  lifted?: boolean;
  /** Where the block sits among others that overlap it. */
  slot?: { column: number; columns: number };
}) {
  const minutes = block.endMinute - block.startMinute;
  const time = formatMinuteRange(block.startMinute, block.endMinute);
  const name = block.label ?? (block.kind === "class" ? "Class" : block.kind === "busy" ? "Busy" : "Prefer not");
  const Tag = readOnly ? "div" : "button";
  return (
    <Tag
      {...(readOnly ? {} : { type: "button" as const })}
      data-block={block.id}
      aria-label={`${name}, ${WEEKDAY_LONG[block.dayOfWeek]} ${time}`}
      title={`${name} · ${time}`}
      className={cn(
        "absolute overflow-hidden rounded-md border text-left outline-none",
        KIND_STYLE[block.kind],
        !readOnly && "cursor-grab focus-visible:ring-2 focus-visible:ring-accent/50 active:cursor-grabbing",
        lifted && "z-10 opacity-90 shadow-md"
      )}
      style={{
        top,
        height: Math.max(10, minutes * PX_PER_MIN - 1),
        left: `calc(${((slot?.column ?? 0) / (slot?.columns ?? 1)) * 100}% + 2px)`,
        width: `calc(${100 / (slot?.columns ?? 1)}% - 4px)`,
      }}
    >
      {!readOnly && <span data-edge="start" className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize max-md:hidden" />}
      <span className="block px-1.5 pt-0.5 leading-tight">
        <span
          className={cn(
            "block text-2xs font-medium break-words sm:text-xs",
            minutes < 30 ? "truncate leading-none" : minutes < 75 ? "line-clamp-2 sm:truncate" : "line-clamp-3 sm:line-clamp-2"
          )}
        >
          {name}
        </span>
        {minutes >= 45 && <span className="tnum block truncate text-2xs max-sm:hidden">{time}</span>}
      </span>
      {!readOnly && <span data-edge="end" className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize max-md:hidden" />}
    </Tag>
  );
}
