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
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import type { PipelineApp, PipelineData } from "@/lib/queries/applications";
import { DECLINE_REASONS, type DeclineReason } from "@/db/schema";
import { cn, formatMoney, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
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

type PendingMove = { app: PipelineApp; toStageId: string; stageName: string };

export function Board({ data }: { data: PipelineData }) {
  const router = useRouter();
  const [apps, setApps] = React.useState(data.apps);
  const [activeApp, setActiveApp] = React.useState<PipelineApp | null>(null);
  const [pendingDecline, setPendingDecline] = React.useState<PendingMove | null>(null);

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
      if (a.status !== "open" && !isTerminalVisible(a, data)) continue;
      map.get(a.stageId)?.push(a);
    }
    return map;
  }, [apps, data]);

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

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex h-full gap-3 overflow-x-auto px-6 pb-6">
          {data.stages.map((stage) => (
            <Column
              key={stage.id}
              stage={stage}
              apps={byStage.get(stage.id) ?? []}
            />
          ))}
        </div>
        <DragOverlay>
          {activeApp ? <AppCard app={activeApp} dragging /> : null}
        </DragOverlay>
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
}: {
  stage: PipelineData["stages"][number];
  apps: PipelineApp[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="size-2 rounded-full" style={{ background: `var(--${stage.colorToken})` }} />
        <span className="text-xs font-medium">{stage.name}</span>
        <span className="tnum text-2xs text-fg-subtle">{apps.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-lg border border-transparent bg-bg-subtle/60 p-2 transition-colors",
          isOver && "border-accent/40 bg-accent-subtle/40"
        )}
      >
        {apps.map((app) => (
          <DraggableCard key={app.id} app={app} />
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

function DraggableCard({ app }: { app: PipelineApp }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: app.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-40")}>
      <AppCard app={app} />
    </div>
  );
}

function AppCard({ app, dragging }: { app: PipelineApp; dragging?: boolean }) {
  // Captured once per mount — staleness doesn't need to tick live.
  const [now] = React.useState(() => Date.now());
  const stale = now - new Date(app.enteredStageAt).getTime() > 1000 * 60 * 60 * 24 * 14;
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
      <div className="mt-1.5 flex items-center justify-between text-2xs text-fg-subtle">
        <span className="tnum">
          {app.amountRequested ? formatMoney(app.amountRequested) : ""}
        </span>
        <span className={cn(stale && "text-warning")}>
          {formatDistanceToNow(app.enteredStageAt)}
        </span>
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
