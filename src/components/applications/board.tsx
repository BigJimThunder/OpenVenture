"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { KanbanIcon, VoteIcon, FileTextIcon, SignalHighIcon } from "lucide-react";
import { moveApplicationStage, reorderApplication } from "@/lib/actions/applications";
import type { PipelineApp, PipelineData } from "@/lib/queries/applications";
import { DECLINE_REASONS, type DeclineReason } from "@/db/schema";
import { cn, formatMoney, initials } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { usePaletteContext } from "@/components/shell/command-palette";
import { isTypingTarget } from "@/components/shell/app-shell";
import { StageDot } from "@/components/patterns/entity-ref";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const REASON_LABELS: Record<DeclineReason, string> = {
  too_early: "Too early",
  not_a_fit: "Not a fit",
  budget_exhausted: "Budget exhausted",
  team: "Team concerns",
  unresponsive: "Unresponsive",
  duplicate: "Duplicate",
  outside_criteria: "Outside criteria",
  other: "Other",
};

type PendingMove = { app: PipelineApp; toStageId: string; stageName: string };

/**
 * Staleness is judged against the stage's own SLA, not a flat threshold — an
 * application in Applied is not "late" the way one sitting in Screening past
 * its 7-day SLA is. Stages without an SLA never warn, which keeps the warning
 * colour meaning something on a board where most cards are months old.
 */
function staleness(
  enteredStageAt: Date | string,
  slaDays: number | null,
  now: number
): "ok" | "late" | "very-late" {
  if (!slaDays) return "ok";
  const days = (now - new Date(enteredStageAt).getTime()) / 86_400_000;
  if (days > slaDays * 2) return "very-late";
  if (days > slaDays) return "late";
  return "ok";
}

export function Board({ data }: { data: PipelineData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekId = searchParams.get("peek");

  const [apps, setApps] = React.useState(data.apps);
  const [activeApp, setActiveApp] = React.useState<PipelineApp | null>(null);
  const [pendingDecline, setPendingDecline] = React.useState<PendingMove | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(peekId);

  // Sync optimistic state when fresh server data arrives (adjust-during-render pattern).
  const [prevServerApps, setPrevServerApps] = React.useState(data.apps);
  if (prevServerApps !== data.apps) {
    setPrevServerApps(data.apps);
    setApps(data.apps);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor)
  );

  const byStage = React.useMemo(() => {
    const map = new Map<string, PipelineApp[]>();
    for (const s of data.stages) map.set(s.id, []);
    for (const a of apps) {
      const stage = data.stages.find((s) => s.id === a.stageId);
      // Funded/declined applications still show in their terminal columns.
      if (a.status !== "open" && stage?.kind !== "won" && stage?.kind !== "lost") continue;
      map.get(a.stageId)?.push(a);
    }
    return map;
  }, [apps, data]);

  /** Board order, column by column — what the arrow keys walk. */
  const flatOrder = React.useMemo(
    () => data.stages.flatMap((s) => byStage.get(s.id) ?? []),
    [data.stages, byStage]
  );

  const setPeek = React.useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("peek", id);
      else next.delete("peek");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const openFull = React.useCallback((id: string) => router.push(`/pipeline/${id}`), [router]);

  const commitMove = React.useCallback(
    async function commitMove(
      app: PipelineApp,
      toStageId: string,
      declineReason?: DeclineReason,
      position?: number
    ) {
      const prev = apps;
      setApps((cur) =>
        cur.map((a) =>
          a.id === app.id
            ? { ...a, stageId: toStageId, ...(position != null ? { position: String(position) } : {}) }
            : a
        )
      );
      const res = await moveApplicationStage({
        applicationId: app.id,
        toStageId,
        declineReason,
        position,
      });
      if (!res.ok) {
        setApps(prev);
        toast.error(res.error, {
          action: {
            label: "Retry",
            onClick: () => commitMove(app, toStageId, declineReason, position),
          },
        });
      } else {
        router.refresh();
      }
    },
    [apps, router]
  );

  const requestMove = React.useCallback(
    (app: PipelineApp, toStageId: string, position?: number) => {
      if (app.stageId === toStageId) return;
      const stage = data.stages.find((s) => s.id === toStageId);
      if (!stage) return;
      if (stage.kind === "lost") {
        // Decline requires a recorded reason — prompt before committing.
        setPendingDecline({ app, toStageId, stageName: stage.name });
        return;
      }
      void commitMove(app, toStageId, undefined, position);
    },
    [data.stages, commitMove]
  );

  /**
   * Persist a same-column reorder. Fractional midpoints keep it to one write;
   * when neighbours tie (fresh boards default every position to "0") the whole
   * column is renumbered once so future drags have room.
   */
  const commitReorder = React.useCallback(
    async (app: PipelineApp, column: PipelineApp[], insertIdx: number) => {
      const before = column[insertIdx - 1];
      const after = column[insertIdx];
      const beforePos = before ? Number(before.position) : null;
      const afterPos = after ? Number(after.position) : null;

      const needsRenumber =
        (beforePos != null && afterPos != null && beforePos >= afterPos) ||
        (beforePos == null && afterPos != null && afterPos <= 0 && column.length > 0);

      const newOrder = [...column.slice(0, insertIdx), app, ...column.slice(insertIdx)];

      let updates: { id: string; position: number }[];
      if (needsRenumber) {
        updates = newOrder.map((a, i) => ({ id: a.id, position: i + 1 }));
      } else {
        const pos =
          beforePos == null && afterPos == null
            ? 1
            : beforePos == null
              ? (afterPos as number) - 1
              : afterPos == null
                ? beforePos + 1
                : (beforePos + afterPos) / 2;
        updates = [{ id: app.id, position: pos }];
      }

      const prev = apps;
      const posById = new Map(updates.map((u) => [u.id, String(u.position)]));
      const orderIdx = new Map(newOrder.map((a, i) => [a.id, i]));
      setApps((cur) => {
        const next = cur.map((a) =>
          posById.has(a.id) ? { ...a, position: posById.get(a.id) as string } : a
        );
        // Keep this column's cards in their new visual order within the array.
        return next
          .map((a, i) => ({ a, key: orderIdx.has(a.id) ? orderIdx.get(a.id)! : null, i }))
          .sort((x, y) => {
            if (x.key == null || y.key == null) return x.i - y.i;
            return x.key - y.key;
          })
          .map((x) => x.a);
      });

      const results = await Promise.all(
        updates.map((u) => reorderApplication({ applicationId: u.id, position: u.position }))
      );
      const failed = results.find((r) => !r.ok);
      if (failed && !failed.ok) {
        setApps(prev);
        toast.error(failed.error);
      } else {
        router.refresh();
      }
    },
    [apps, router]
  );

  function onDragStart(e: DragStartEvent) {
    setActiveApp(apps.find((a) => a.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveApp(null);
    const { active, over } = e;
    if (!over) return;
    const app = apps.find((a) => a.id === active.id);
    if (!app) return;

    const overId = String(over.id);
    const overApp = apps.find((a) => a.id === overId);
    const targetStageId = overApp ? overApp.stageId : overId;
    if (!data.stages.some((s) => s.id === targetStageId)) return;

    const columnWithoutApp = (byStage.get(targetStageId) ?? []).filter((a) => a.id !== app.id);

    if (targetStageId === app.stageId) {
      // Same column: card-over-card is a reorder, not a stage move.
      if (!overApp || overApp.id === app.id) return;
      const fullColumn = byStage.get(targetStageId) ?? [];
      const fromIdx = fullColumn.findIndex((a) => a.id === app.id);
      const overIdx = fullColumn.findIndex((a) => a.id === overId);
      if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) return;
      // In filtered-column indices, arrayMove semantics land the dragged card
      // at overIdx whether it travelled up or down.
      void commitReorder(app, columnWithoutApp, overIdx);
      return;
    }

    // Cross-column: drop position slots the card where it landed.
    const insertIdx = overApp
      ? columnWithoutApp.findIndex((a) => a.id === overId)
      : columnWithoutApp.length;
    const before = columnWithoutApp[insertIdx - 1];
    const after = columnWithoutApp[insertIdx >= 0 ? insertIdx : columnWithoutApp.length];
    const beforePos = before ? Number(before.position) : null;
    const afterPos = after ? Number(after.position) : null;
    const position =
      beforePos != null && afterPos != null && beforePos < afterPos
        ? (beforePos + afterPos) / 2
        : beforePos != null && afterPos == null
          ? beforePos + 1
          : afterPos != null
            ? afterPos - 1
            : undefined;
    requestMove(app, targetStageId, position);
  }

  const selected = React.useMemo(
    () => flatOrder.find((a) => a.id === selectedId) ?? null,
    [flatOrder, selectedId]
  );

  // Single-key shortcuts over the focused card. Mirrors the peek panel's
  // buttons and the palette's actions — one vocabulary, three surfaces.
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (pendingDecline) return;

      if (e.key === "Escape" && peekId) {
        e.preventDefault();
        setPeek(null);
        return;
      }
      if (!flatOrder.length) return;

      const idx = selectedId ? flatOrder.findIndex((a) => a.id === selectedId) : -1;
      const step = (delta: number) => {
        e.preventDefault();
        const nextIdx = idx < 0 ? 0 : Math.min(Math.max(idx + delta, 0), flatOrder.length - 1);
        const next = flatOrder[nextIdx];
        if (!next) return;
        setSelectedId(next.id);
        if (peekId) setPeek(next.id);
      };

      if (e.key === "ArrowDown" || e.key === "j") return step(1);
      if (e.key === "ArrowUp" || e.key === "k") return step(-1);

      if (!selected) return;
      if (e.key === " ") {
        e.preventDefault();
        setPeek(peekId === selected.id ? null : selected.id);
      } else if (e.key === "Enter") {
        e.preventDefault();
        openFull(selected.id);
      } else if (e.key === "d" || e.key === "D") {
        const lost = data.stages.find((s) => s.kind === "lost");
        if (!lost || selected.stageId === lost.id) return;
        e.preventDefault();
        setPendingDecline({ app: selected, toStageId: lost.id, stageName: lost.name });
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [flatOrder, selectedId, selected, peekId, setPeek, openFull, pendingDecline, data.stages]);

  // Publish the selection so ⌘K acts on it rather than only navigating.
  usePaletteContext(
    selected
      ? {
          label: `${selected.companyName} · ${formatRef("application", selected.ref)}`,
          actions: [
            {
              id: "peek",
              label: peekId === selected.id ? "Close peek" : "Peek",
              shortcut: "Space",
              icon: KanbanIcon,
              run: () => setPeek(peekId === selected.id ? null : selected.id),
            },
            {
              id: "open",
              label: "Open application",
              shortcut: "↵",
              icon: FileTextIcon,
              run: () => openFull(selected.id),
            },
            ...data.stages
              .filter((s) => s.id !== selected.stageId)
              .map((s) => ({
                id: `stage-${s.id}`,
                label: `Move to ${s.name}`,
                icon: SignalHighIcon,
                run: () => requestMove(selected, s.id),
              })),
            {
              id: "vote",
              label: "Start blind vote",
              shortcut: "V",
              icon: VoteIcon,
              run: () => openFull(selected.id),
            },
          ],
        }
      : null
  );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex h-full gap-2.5 overflow-x-auto px-4 pt-3 pb-4">
          {data.stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              apps={byStage.get(stage.id) ?? []}
              selectedId={selectedId}
              peekId={peekId}
              onSelect={(id) => {
                setSelectedId(id);
                setPeek(id);
              }}
            />
          ))}
        </div>
        <DragOverlay>{activeApp ? <AppCard app={activeApp} dragging /> : null}</DragOverlay>
      </DndContext>

      <DeclineDialog
        key={pendingDecline?.app.id ?? "none"}
        pending={pendingDecline}
        onCancel={() => setPendingDecline(null)}
        onConfirm={(reason) => {
          if (pendingDecline) {
            void commitMove(pendingDecline.app, pendingDecline.toStageId, reason);
            setPendingDecline(null);
          }
        }}
      />
    </>
  );
}

function Column({
  stage,
  apps,
  selectedId,
  peekId,
  onSelect,
}: {
  stage: PipelineData["stages"][number];
  apps: PipelineApp[];
  selectedId: string | null;
  peekId: string | null;
  onSelect: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = apps.reduce((n, a) => n + Number(a.amountRequested ?? 0), 0);

  return (
    <div className="flex w-62 shrink-0 flex-col">
      <div className="flex items-center gap-[7px] px-1 pb-2">
        <StageDot colorToken={stage.colorToken} className="size-2" />
        <span className="text-xs font-medium">{stage.name}</span>
        <span className="tnum text-2xs text-fg-subtle">{apps.length}</span>
        {total > 0 && (
          <span className="tnum ml-auto text-2xs text-fg-subtle">{formatMoney(total)}</span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-transparent bg-bg-subtle p-2 transition-colors",
          isOver && "border-accent/40 bg-accent-subtle/40"
        )}
      >
        <SortableContext items={apps.map((a) => a.id)} strategy={verticalListSortingStrategy}>
          {apps.map((app) => (
            <DraggableCard
              key={app.id}
              app={app}
              slaDays={stage.slaDays}
              selected={selectedId === app.id}
              peeked={peekId === app.id}
              onSelect={onSelect}
            />
          ))}
        </SortableContext>
        {apps.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6 text-2xs text-fg-subtle">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  app,
  slaDays,
  selected,
  peeked,
  onSelect,
}: {
  app: PipelineApp;
  slaDays: number | null;
  selected: boolean;
  peeked: boolean;
  onSelect: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: app.id,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        transition,
      }}
      className={cn("outline-none", isDragging && "opacity-40")}
      onClick={() => onSelect(app.id)}
    >
      <AppCard app={app} slaDays={slaDays} selected={selected} peeked={peeked} />
    </div>
  );
}

function AppCard({
  app,
  slaDays = null,
  dragging,
  selected,
  peeked,
}: {
  app: PipelineApp;
  slaDays?: number | null;
  dragging?: boolean;
  selected?: boolean;
  peeked?: boolean;
}) {
  // Captured once per mount — staleness doesn't need to tick live.
  const [now] = React.useState(() => Date.now());
  const stale = staleness(app.enteredStageAt, slaDays, now);

  return (
    <div
      className={cn(
        "cursor-pointer rounded-md border border-border bg-panel p-2.5 transition-colors hover:border-border-strong",
        app.status === "declined" && "opacity-60",
        app.status === "funded" && "opacity-75",
        (selected || peeked) && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        dragging && "rotate-1 shadow-lg"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10.5px] text-fg-subtle">
          {formatRef("application", app.ref)}
        </span>
        {app.ownerName ? (
          <span className="flex size-[18px] items-center justify-center rounded-full bg-accent-subtle text-[8px] font-semibold text-accent">
            {initials(app.ownerName)}
          </span>
        ) : (
          <span className="size-[18px] rounded-full border border-dashed border-border-strong" />
        )}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{app.companyName}</div>
      {app.companyOneLiner && (
        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.4] text-fg-muted">
          {app.companyOneLiner}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-fg-subtle">
        <span className="tnum">{app.amountRequested ? formatMoney(app.amountRequested) : ""}</span>
        {app.status === "declined" && app.declineReason ? (
          <span className="text-danger">{REASON_LABELS[app.declineReason].toLowerCase()}</span>
        ) : app.status === "funded" ? (
          <span className="text-success">funded</span>
        ) : (
          <span
            className={cn(
              stale === "late" && "text-warning",
              stale === "very-late" && "text-danger"
            )}
            title={
              slaDays && stale !== "ok" ? `Past this stage's ${slaDays}-day SLA` : undefined
            }
          >
            {formatDistanceToNowStrict(app.enteredStageAt)}
          </span>
        )}
      </div>
    </div>
  );
}

function DeclineDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingMove | null;
  onCancel: () => void;
  onConfirm: (reason: DeclineReason) => void;
}) {
  // Keyed by application id from the parent, so state resets per prompt.
  const [reason, setReason] = React.useState<DeclineReason | "">("");

  return (
    <Dialog open={!!pending} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Decline {pending?.app.companyName}</DialogTitle>
          <DialogDescription>
            A reason is required — it powers the pass-reason analytics and next year&apos;s retro.
          </DialogDescription>
        </DialogHeader>
        <Select value={reason} onValueChange={(v) => setReason(v as DeclineReason)}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a reason…" />
          </SelectTrigger>
          <SelectContent>
            {DECLINE_REASONS.map((r) => (
              <SelectItem key={r} value={r}>
                {REASON_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!reason} onClick={() => reason && onConfirm(reason)}>
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
