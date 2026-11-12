"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { formatDistanceStrict } from "date-fns";
import { toast } from "sonner";
import { reorderApplication } from "@/lib/actions/applications";
import type { PipelineApp, PipelineData } from "@/lib/queries/applications";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { cn, formatMoney } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph } from "@/components/patterns/priority-glyph";
import { OwnerAvatar } from "./owner-picker";
import { usePipeline } from "./pipeline-view";

/**
 * Staleness is judged against the stage's own SLA, not a flat threshold — an
 * application in Applied is not "late" the way one sitting in Screening past
 * its 7-day SLA is. Stages without an SLA never warn, which keeps the warning
 * color meaning something on a board where most cards are months old.
 */
export function staleness(
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

/** The desktop kanban: drag between columns to move, within one to reorder. */
export function Board() {
  const router = useRouter();
  const { stages, apps, setApps, byStage, requestMove, canEdit } = usePipeline();
  const [activeApp, setActiveApp] = React.useState<PipelineApp | null>(null);

  // Pointer only: Space and Enter on a focused card mean peek and open here,
  // and keyboard moves go through ⌘K → "Move to …".
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

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
    [apps, router, setApps]
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
    if (!stages.some((s) => s.id === targetStageId)) return;

    const columnWithoutApp = (byStage.get(targetStageId) ?? []).filter((a) => a.id !== app.id);

    if (targetStageId === app.stageId) {
      // Same column: card-over-card is a reorder, not a stage move.
      if (!overApp || overApp.id === app.id) return;
      const fullColumn = byStage.get(targetStageId) ?? [];
      const fromIdx = fullColumn.findIndex((a) => a.id === app.id);
      const overIdx = fullColumn.findIndex((a) => a.id === overId);
      if (fromIdx < 0 || overIdx < 0 || fromIdx === overIdx) return;
      // In filtered-column indices, arrayMove semantics land the dragged card
      // at overIdx whether it traveled up or down.
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

  return (
    // A fixed `id` keeps dnd-kit's aria-describedby identical on the server and
    // the client; its default is a module-level counter, which mismatches.
    <DndContext
      id="pipeline-board"
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex h-full gap-2.5 overflow-x-auto px-4 pt-3 pb-4">
        {stages.map((stage) => (
          <Column key={stage.id} stage={stage} apps={byStage.get(stage.id) ?? []} />
        ))}
      </div>
      <DragOverlay>{activeApp ? <AppCard app={activeApp} dragging /> : null}</DragOverlay>
      {!canEdit && <span className="sr-only">Read-only: cards can be opened but not moved.</span>}
    </DndContext>
  );
}

function Column({ stage, apps }: { stage: PipelineData["stages"][number]; apps: PipelineApp[] }) {
  const { canEdit } = usePipeline();
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !canEdit });
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
            <DraggableCard key={app.id} app={app} slaDays={stage.slaDays} />
          ))}
        </SortableContext>
        {apps.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6 text-2xs text-fg-subtle">
            {canEdit ? "Drop here" : "Nothing here"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ app, slaDays }: { app: PipelineApp; slaDays: number | null }) {
  const { selectedId, peekId, select, openPeek, canEdit } = usePipeline();
  const { attributes, listeners, setNodeRef, isDragging, transform, transition } = useSortable({
    id: app.id,
    disabled: !canEdit,
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-app-id={app.id}
      aria-roledescription={canEdit ? "draggable application" : "application"}
      aria-label={`${formatRef("application", app.ref)} ${app.companyName}`}
      style={{
        transform: transform
          ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
          : undefined,
        transition,
      }}
      className={cn("rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/50", isDragging && "opacity-40")}
      onFocus={() => select(app.id)}
      onClick={() => openPeek(app.id)}
    >
      <AppCard
        app={app}
        slaDays={slaDays}
        selected={selectedId === app.id || peekId === app.id}
      />
    </div>
  );
}

export function AppCard({
  app,
  slaDays = null,
  dragging,
  selected,
  className,
}: {
  app: PipelineApp;
  slaDays?: number | null;
  dragging?: boolean;
  selected?: boolean;
  className?: string;
}) {
  const { now } = usePipeline();
  const stale = staleness(app.enteredStageAt, slaDays, now);

  return (
    <div
      className={cn(
        "cursor-pointer rounded-md border border-border bg-panel p-2.5 transition-colors hover:border-border-strong",
        app.status === "declined" && "opacity-60",
        app.status === "funded" && "opacity-75",
        selected && "border-accent shadow-[0_0_0_1px_var(--accent)]",
        dragging && "rotate-1 shadow-lg",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10.5px] text-fg-subtle">
          {formatRef("application", app.ref)}
        </span>
        {app.priority !== "none" && <PriorityGlyph priority={app.priority} />}
        <OwnerAvatar name={app.ownerName} className="ml-auto" />
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
          <span className="text-danger">{DECLINE_REASON_LABELS[app.declineReason].toLowerCase()}</span>
        ) : app.status === "funded" ? (
          <span className="text-success">funded</span>
        ) : (
          <span
            className={cn(
              "tnum",
              stale === "late" && "text-warning",
              stale === "very-late" && "text-danger"
            )}
            title={slaDays && stale !== "ok" ? `Past this stage's ${slaDays}-day SLA` : undefined}
          >
            {formatDistanceStrict(new Date(app.enteredStageAt), now)}
          </span>
        )}
      </div>
    </div>
  );
}
