"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2Icon, CopyIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import type { AvailabilityKind } from "@/db/schema";
import { confirmMySchedule, saveMySchedule, type MyScheduleData } from "@/lib/actions/availability";
import {
  BLOCK_KINDS,
  KIND_LABEL,
  MAX_BLOCKS_PER_TERM,
  normalizeBlocks,
  weeklyBusyMinutes,
  type ScheduleBlock,
} from "@/lib/scheduling/blocks";
import type { Term } from "@/lib/scheduling/terms";
import { formatDayShort } from "@/lib/scheduling/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AddClassesDialog } from "./add-classes-dialog";
import { BlockDialog } from "./block-dialog";
import { Segmented } from "./segmented";
import { KIND_STYLE, WeekGrid, type EditorBlock } from "./week-grid";

type SaveState = "idle" | "saving" | "saved" | "error";

// Ids for blocks loaded with the page come from their position, so the server
// and the browser agree; blocks made afterwards count up from a browser-only counter.
let nextId = 0;
const withIds = (blocks: readonly ScheduleBlock[]): EditorBlock[] =>
  normalizeBlocks(blocks).map((b, i) => ({ ...b, id: `s${i}` }));

const SHORT_KIND: Record<AvailabilityKind, string> = { ...KIND_LABEL, busy: "Busy" };

function hoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/**
 * A member's week for one term: paint it, add classes by form, paste or
 * calendar file, then confirm. Changes save as they are made; "confirm" is
 * the member saying the week is complete, which is what tells the scheduler
 * to trust it (an empty week included).
 */
export function ScheduleEditor({
  data,
  switchTerms = false,
  onConfirmed,
  compact = false,
}: {
  data: MyScheduleData & { term: Term };
  /** Link to the club's other terms on /schedule. Off inside other flows. */
  switchTerms?: boolean;
  onConfirmed?: () => void;
  /** Tighter chrome for use inside another flow. */
  compact?: boolean;
}) {
  const { term } = data;
  const [blocks, setBlocks] = React.useState<EditorBlock[]>(() => withIds(data.blocks));
  const [confirmedAt, setConfirmedAt] = React.useState(data.confirmedAt);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [paintKind, setPaintKind] = React.useState<AvailabilityKind>("class");
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  // Saves are serialised: one request in flight, the latest week queued behind it.
  const latest = React.useRef<EditorBlock[]>(blocks);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef<Promise<boolean> | null>(null);
  const dirty = React.useRef(false);

  const flush = React.useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) await inFlight.current;
    if (!dirty.current) return true;
    dirty.current = false;
    setSaveState("saving");
    const run = saveMySchedule({
      termKey: term.key,
      blocks: latest.current.map(({ dayOfWeek, startMinute, endMinute, kind, label }) => ({
        dayOfWeek,
        startMinute,
        endMinute,
        kind,
        label,
      })),
    }).then((res) => {
      if (!res.ok) {
        dirty.current = true;
        setSaveState("error");
        toast.error(`Your schedule didn't save. ${res.error}`);
        return false;
      }
      setSaveState(dirty.current ? "saving" : "saved");
      return true;
    });
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  }, [term.key]);

  // Leaving the page mid-debounce still saves.
  React.useEffect(() => () => void flush(), [flush]);

  function apply(next: readonly ScheduleBlock[]): boolean {
    const normalized = normalizeBlocks(next);
    if (normalized.length > MAX_BLOCKS_PER_TERM) {
      toast.error(`That would be more than ${MAX_BLOCKS_PER_TERM} blocks in a week. Remove a few first.`);
      return false;
    }
    // Keep ids stable for blocks that did not change, so the grid does not remount them mid-drag.
    const before = new Map(latest.current.map((b) => [keyOf(b), b.id]));
    const withStableIds = normalized.map((b) => ({ ...b, id: before.get(keyOf(b)) ?? `b${++nextId}` }));
    latest.current = withStableIds;
    dirty.current = true;
    setBlocks(withStableIds);
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
    return true;
  }

  function replaceAll(next: readonly ScheduleBlock[], message: string) {
    const previous = latest.current;
    if (!apply(next)) return;
    toast(message, { action: { label: "Undo", onClick: () => apply(previous) } });
  }

  async function confirm() {
    setConfirming(true);
    const saved = await flush();
    if (!saved) {
      setConfirming(false);
      return;
    }
    const res = await confirmMySchedule({ termKey: term.key });
    setConfirming(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setConfirmedAt(res.data.confirmedAt);
    toast.success(`${term.name} schedule confirmed`);
    onConfirmed?.();
  }

  const editingBlock = blocks.find((b) => b.id === editing);
  const busyMinutes = weeklyBusyMinutes(blocks);
  const otherTerms = data.terms.filter((t) => t.key !== term.key);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className={cn("font-semibold tracking-tight", compact ? "text-base" : "text-md")}>{term.name}</h2>
            {confirmedAt ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-bg px-2 py-0.5 text-2xs font-medium text-success">
                <CheckCircle2Icon className="size-3" />
                Confirmed
              </span>
            ) : (
              <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-2xs font-medium text-warning">
                Not confirmed yet
              </span>
            )}
          </div>
          <p className="tnum mt-0.5 text-xs text-fg-muted">
            {formatDayShort(term.start)} to {formatDayShort(term.end)}, {term.end.slice(0, 4)}
            {switchTerms && otherTerms.length > 0 && (
              <>
                {" · "}
                {otherTerms.map((t, i) => (
                  <React.Fragment key={t.key}>
                    {i > 0 && ", "}
                    <Link href={`/schedule?term=${encodeURIComponent(t.key)}`} className="text-accent underline-offset-2 hover:underline">
                      {t.name}
                    </Link>
                  </React.Fragment>
                ))}
              </>
            )}
          </p>
        </div>
        <span className="tnum text-xs text-fg-subtle" role="status" aria-live="polite">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : ""}
        </span>
      </div>

      {!confirmedAt && (
        <p className="rounded-lg border border-border bg-bg-subtle/60 px-3.5 py-2.5 text-sm text-fg-muted">
          <span className="font-medium text-fg">We need your {term.name} week.</span> Add your classes and anything else
          that repeats, then confirm at the bottom. It takes about two minutes, and after that nobody has to ask when you
          are free.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="max-md:h-10" onClick={() => setAdding(true)}>
          <PlusIcon />
          Add classes
        </Button>
        {data.previous && (
          <Button
            variant="secondary"
            className="max-md:h-10"
            onClick={() => replaceAll([...blocks, ...data.previous!.blocks], `Copied ${data.previous!.term.name}. Fix what changed.`)}
          >
            <CopyIcon />
            Copy from {data.previous.term.name}
          </Button>
        )}
        {blocks.length > 0 && (
          <Button variant="ghost" className="max-md:h-10" onClick={() => replaceAll([], "Schedule cleared")}>
            <Trash2Icon />
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
            <span className="shrink-0 text-xs text-fg-muted">New blocks are</span>
            <Segmented
              label="Kind for new blocks"
              className="sm:w-80"
              value={paintKind}
              onChange={setPaintKind}
              options={BLOCK_KINDS.map((k) => ({
                value: k,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-2.5 rounded-sm border", KIND_STYLE[k])} />
                    {SHORT_KIND[k]}
                  </span>
                ),
              }))}
            />
          </div>
        </div>
        <WeekGrid
          blocks={blocks}
          window={data.window}
          paintKind={paintKind}
          onCreate={(b) => apply([...blocks, b])}
          onChange={(id, patch) => apply(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)))}
          onSelect={setEditing}
        />
        <p className="tnum text-xs text-fg-muted">
          {blocks.length === 0
            ? "Nothing on your week yet."
            : `${hoursLabel(busyMinutes)} of fixed commitments a week. Classes get 10 minutes either side for the walk.`}
        </p>
      </div>

      <p className="flex items-start gap-2 text-xs text-fg-muted">
        <LockIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Only you and the club&apos;s admins can see what your blocks are called. Everyone else sees busy or free, nothing
          more. Times are in the club&apos;s timezone ({data.timeZone.replace(/_/g, " ")}).
        </span>
      </p>

      <div
        className={cn(
          "flex flex-col gap-3 rounded-lg border p-3.5 sm:flex-row sm:items-center sm:justify-between",
          confirmedAt ? "border-border bg-panel" : "border-accent/40 bg-accent-subtle/50"
        )}
      >
        {confirmedAt ? (
          <>
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">This is your {term.name} schedule.</span>{" "}
              <span className="tnum">
                Confirmed{" "}
                {new Date(confirmedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: data.timeZone })}.
              </span>{" "}
              If a class changes, edit it here; changes save on their own.
            </p>
            {onConfirmed && (
              <Button className="shrink-0 max-md:h-11" onClick={onConfirmed}>
                Continue
              </Button>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-fg-muted">
              {blocks.length === 0
                ? "No classes or fixed commitments this term? Confirm an empty week, so we know it is not just missing."
                : "Is that everything that repeats each week? Confirming tells the club it can schedule around this."}
            </p>
            <Button className="shrink-0 max-md:h-11" onClick={confirm} disabled={confirming}>
              {confirming
                ? "Confirming…"
                : blocks.length === 0
                  ? "My week is open"
                  : `This is my ${term.name} schedule`}
            </Button>
          </>
        )}
      </div>

      {adding && (
        <AddClassesDialog
          open
          onOpenChange={setAdding}
          term={term}
          timeZone={data.timeZone}
          weekends={data.window.weekends}
          onAdd={(added) => apply([...blocks, ...added])}
        />
      )}
      {editingBlock && (
        <BlockDialog
          key={editingBlock.id}
          block={editingBlock}
          onClose={() => setEditing(null)}
          onDelete={() => {
            apply(blocks.filter((b) => b.id !== editingBlock.id));
            setEditing(null);
          }}
          onSave={(next) => {
            apply(blocks.map((b) => (b.id === editingBlock.id ? { ...next, id: b.id } : b)));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function keyOf(b: ScheduleBlock): string {
  return `${b.dayOfWeek}|${b.startMinute}|${b.endMinute}|${b.kind}|${b.label ?? ""}`;
}
