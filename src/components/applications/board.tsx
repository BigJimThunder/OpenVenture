"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SearchIcon, XIcon, ClockIcon } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import type { PipelineApp, PipelineData } from "@/lib/queries/applications";
import { DECLINE_REASONS, type DeclineReason } from "@/db/schema";
import { cn, formatCompact, formatMoney, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REASON_LABELS: Record<DeclineReason, string> = {
  too_early: "Too early",
  not_a_fit: "Not a fit",
  budget_exhausted: "Budget exhausted",
  team: "Team concerns",
  unresponsive: "Unresponsive",
  duplicate: "Duplicate",
  outside_criteria: "Outside criteria",
  other: "Other",
};

/** Stage SLA — a card older than this in an active stage is stalled. */
const STALE_DAYS = 14;

type PendingMove = { app: PipelineApp; toStageId: string; stageName: string };

function daysInStage(app: PipelineApp, now: number) {
  return Math.floor((now - new Date(app.enteredStageAt).getTime()) / 86_400_000);
}

export function Board({ data }: { data: PipelineData }) {
  const router = useRouter();
  const [apps, setApps] = React.useState(data.apps);
  const [activeApp, setActiveApp] = React.useState<PipelineApp | null>(null);
  const [pendingDecline, setPendingDecline] = React.useState<PendingMove | null>(null);

  // Board filters — held client-side; the board is already fully loaded.
  const [query, setQuery] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState<string>("all");
  const [staleOnly, setStaleOnly] = React.useState(false);

  // Captured once per mount — staleness doesn't need to tick live.
  const [now] = React.useState(() => Date.now());

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

  const stageById = React.useMemo(
    () => new Map(data.stages.map((s) => [s.id, s])),
    [data.stages]
  );

  const owners = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of apps) {
      if (a.ownerId && a.ownerName) seen.set(a.ownerId, a.ownerName);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apps]);

  const filtersActive = query.trim() !== "" || ownerFilter !== "all" || staleOnly;

  const visibleApps = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((a) => {
      if (a.status !== "open" && !isTerminalVisible(a, data)) return false;
      if (q) {
        const haystack = [a.companyName, a.companyOneLiner, a.ownerName, a.companyDomain]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (ownerFilter === "unassigned" && a.ownerId) return false;
      if (ownerFilter !== "all" && ownerFilter !== "unassigned" && a.ownerId !== ownerFilter)
        return false;
      if (staleOnly) {
        const stage = stageById.get(a.stageId);
        if (stage?.kind !== "active" || daysInStage(a, now) <= STALE_DAYS) return false;
      }
      return true;
    });
  }, [apps, data, query, ownerFilter, staleOnly, stageById, now]);

  const byStage = React.useMemo(() => {
    const map = new Map<string, PipelineApp[]>();
    for (const s of data.stages) map.set(s.id, []);
    for (const a of visibleApps) map.get(a.stageId)?.push(a);
    return map;
  }, [visibleApps, data.stages]);

  function isTerminalVisible(a: PipelineApp, d: PipelineData) {
    // Funded/declined apps still show in their terminal columns.
    const stage = d.stages.find((s) => s.id === a.stageId);
    return stage?.kind === "won" || stage?.kind === "lost";
  }

  async function commitMove(app: PipelineApp, toStageId: string, declineReason?: DeclineReason) {
    const prev = apps;
    setApps((cur) => cur.map((a) => (a.id === app.id ? { ...a, stageId: toStageId } : a)));
    const res = await moveApplicationStage({
      applicationId: app.id,
      toStageId,
      declineReason,
    });
    if (!res.ok) {
      setApps(prev);
      toast.error(res.error, {
        action: { label: "Retry", onClick: () => commitMove(app, toStageId, declineReason) },
      });
    } else {
      router.refresh();
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveApp(apps.find((a) => a.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveApp(null);
    const { active, over } = e;
    if (!over) return;
    const app = apps.find((a) => a.id === active.id);
    const toStageId = String(over.id);
    if (!app || app.stageId === toStageId) return;
    const stage = data.stages.find((s) => s.id === toStageId);
    if (!stage) return;
    if (stage.kind === "lost") {
      // Decline requires a recorded reason — prompt before committing.
      setPendingDecline({ app, toStageId, stageName: stage.name });
      return;
    }
    void commitMove(app, toStageId);
  }

  function clearFilters() {
    setQuery("");
    setOwnerFilter("all");
    setStaleOnly(false);
  }

  const noMatches = filtersActive && visibleApps.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 px-6 pb-3">
        <div className="relative w-full max-w-64 sm:w-auto">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by company, founder, owner…"
            className="h-7 pl-8 text-xs"
          />
        </div>
        <Select value={ownerFilter} onValueChange={setOwnerFilter}>
          <SelectTrigger className="h-7 w-40 text-xs">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any owner</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {owners.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setStaleOnly((v) => !v)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            staleOnly
              ? "border-warning-border bg-warning-bg text-warning"
              : "border-border bg-panel text-fg-muted hover:border-border-strong"
          )}
        >
          <ClockIcon className="size-3.5" />
          Stalled &gt;{STALE_DAYS}d
        </button>
        {filtersActive && (
          <button
            onClick={clearFilters}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-fg-subtle transition-colors hover:text-fg"
          >
            <XIcon className="size-3.5" />
            Clear
          </button>
        )}
        <span className="tnum ml-auto text-2xs text-fg-subtle">
          {visibleApps.length} application{visibleApps.length === 1 ? "" : "s"}
        </span>
      </div>

      {noMatches ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 pb-10 text-center">
          <p className="text-sm font-medium">No applications match</p>
          <p className="text-xs text-fg-muted">Try a different search or clear the filters.</p>
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop: drag-and-drop kanban */}
          <div className="hidden min-h-0 flex-1 md:block">
            <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
              <div className="flex h-full gap-3 overflow-x-auto px-6 pb-6">
                {data.stages.map((stage) => (
                  <Column
                    key={stage.id}
                    stage={stage}
                    apps={byStage.get(stage.id) ?? []}
                    now={now}
                  />
                ))}
              </div>
              <DragOverlay>
                {activeApp ? <AppCard app={activeApp} now={now} dragging /> : null}
              </DragOverlay>
            </DndContext>
          </div>

          {/* Phone: stage-grouped list — no dragging, tap through to move stages */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 md:hidden">
            {data.stages.map((stage) => {
              const stageApps = byStage.get(stage.id) ?? [];
              if (stageApps.length === 0 && filtersActive) return null;
              return (
                <section key={stage.id}>
                  <div className="flex items-center gap-2 px-1 pb-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ background: `var(--${stage.colorToken})` }}
                    />
                    <span className="text-xs font-medium">{stage.name}</span>
                    <span className="tnum text-2xs text-fg-subtle">{stageApps.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {stageApps.map((app) => (
                      <MobileRow key={app.id} app={app} now={now} />
                    ))}
                    {stageApps.length === 0 && (
                      <p className="px-1 py-1.5 text-2xs text-fg-subtle">Empty</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

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
    </div>
  );
}

function Column({
  stage,
  apps,
  now,
}: {
  stage: PipelineData["stages"][number];
  apps: PipelineApp[];
  now: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const totalAsk = apps.reduce((sum, a) => sum + (Number(a.amountRequested) || 0), 0);

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="flex items-baseline gap-2 px-1 pb-2">
        <span
          className="size-2 self-center rounded-full"
          style={{ background: `var(--${stage.colorToken})` }}
        />
        <span className="text-xs font-medium">{stage.name}</span>
        <span className="tnum text-2xs text-fg-subtle">{apps.length}</span>
        {totalAsk > 0 && (
          <span className="tnum ml-auto text-2xs text-fg-subtle">
            ${formatCompact(totalAsk)} asked
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto rounded-lg border border-transparent bg-bg-subtle/60 p-2 transition-colors",
          isOver && "border-accent/40 bg-accent-subtle/40"
        )}
      >
        {apps.map((app) => (
          <DraggableCard key={app.id} app={app} now={now} />
        ))}
        {apps.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-6 text-2xs text-fg-subtle">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ app, now }: { app: PipelineApp; now: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-40")}>
      <AppCard app={app} now={now} />
    </div>
  );
}

function DaysChip({ app, now }: { app: PipelineApp; now: number }) {
  const days = daysInStage(app, now);
  const stale = days > STALE_DAYS;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-1 rounded border px-1 py-px text-2xs",
        stale
          ? "border-warning-border bg-warning-bg text-warning"
          : "border-transparent text-fg-subtle"
      )}
      title={stale ? `In stage ${days} days — past the ${STALE_DAYS}-day SLA` : undefined}
    >
      {stale && <ClockIcon className="size-2.5" />}
      {days}d
    </span>
  );
}

function AppCard({ app, now, dragging }: { app: PipelineApp; now: number; dragging?: boolean }) {
  return (
    <Link
      href={`/applications/${app.id}`}
      className={cn(
        "block cursor-pointer rounded-md border border-border bg-panel p-2.5 shadow-sm transition-shadow hover:shadow",
        dragging && "rotate-1 shadow-lg"
      )}
      onClick={(e) => dragging && e.preventDefault()}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium">{app.companyName}</span>
        {app.ownerName && (
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">{initials(app.ownerName)}</AvatarFallback>
          </Avatar>
        )}
      </div>
      {app.companyOneLiner && (
        <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{app.companyOneLiner}</p>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="tnum text-2xs text-fg-subtle">
          {app.amountRequested ? formatMoney(app.amountRequested) : ""}
        </span>
        <DaysChip app={app} now={now} />
      </div>
    </Link>
  );
}

function MobileRow({ app, now }: { app: PipelineApp; now: number }) {
  return (
    <Link
      href={`/applications/${app.id}`}
      className="flex items-center gap-3 rounded-md border border-border bg-panel px-3 py-2 transition-colors active:bg-bg-subtle"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{app.companyName}</span>
        </div>
        {app.companyOneLiner && (
          <p className="truncate text-xs text-fg-muted">{app.companyOneLiner}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="tnum text-xs text-fg-muted">
          {app.amountRequested ? formatMoney(app.amountRequested) : "—"}
        </span>
        <DaysChip app={app} now={now} />
      </div>
    </Link>
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
            A reason is required — it powers the pass-reason analytics and next year&apos;s
            retro.
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
