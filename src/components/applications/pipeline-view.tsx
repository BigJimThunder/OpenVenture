"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  CheckIcon,
  FileTextIcon,
  KanbanIcon,
  SignalHighIcon,
  UserPlusIcon,
  XCircleIcon,
} from "lucide-react";
import { moveApplicationStage } from "@/lib/actions/applications";
import type { PipelineApp, PipelineData } from "@/lib/queries/applications";
import { statusPatchForMove } from "@/lib/pipeline/status";
import { formatRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { usePaletteContext } from "@/components/shell/command-palette";
import { isTypingTarget, overlayOpen } from "@/components/shell/app-shell";
import { useCan, useViewer } from "@/components/shell/viewer";
import { StageDot } from "@/components/patterns/entity-ref";
import { PRIORITY_LABELS } from "@/components/patterns/priority-glyph";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeclineDialog } from "./decline-dialog";
import { PRIORITY_KEYS, savePriority } from "./priority-picker";
import { saveOwner } from "./owner-picker";
import { Board } from "./board";
import { PhonePipeline } from "./phone-pipeline";
import { AppList, sortForList } from "./app-list";

type Stage = PipelineData["stages"][number];

export type PipelineContextValue = {
  stages: Stage[];
  apps: PipelineApp[];
  setApps: React.Dispatch<React.SetStateAction<PipelineApp[]>>;
  byStage: Map<string, PipelineApp[]>;
  selectedId: string | null;
  peekId: string | null;
  canEdit: boolean;
  /** Server render time, so SSR and hydration agree on "3 months". */
  now: number;
  select: (id: string) => void;
  openPeek: (id: string) => void;
  requestMove: (app: PipelineApp, toStageId: string, position?: number) => void;
  openMoveSheet: (app: PipelineApp) => void;
};

const PipelineContext = React.createContext<PipelineContextValue | null>(null);

export function usePipeline(): PipelineContextValue {
  const ctx = React.useContext(PipelineContext);
  if (!ctx) throw new Error("usePipeline must be used inside PipelineView");
  return ctx;
}

/**
 * Owns everything the three pipeline surfaces share — optimistic state,
 * selection, the keyboard, stage moves and the decline dialog — so the desktop
 * board, the list and the phone view are the same pipeline, not three.
 */
export function PipelineView({
  data,
  view,
  now,
}: {
  data: PipelineData;
  view: "board" | "list";
  now: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekId = searchParams.get("peek");
  const viewer = useViewer();
  const canEdit = useCan("contribute");

  const [apps, setApps] = React.useState(data.apps);
  const [selectedId, setSelectedId] = React.useState<string | null>(peekId);
  const [declineFor, setDeclineFor] = React.useState<PipelineApp | null>(null);
  const [moveFor, setMoveFor] = React.useState<PipelineApp | null>(null);

  // Sync optimistic state when fresh server data arrives (adjust-during-render).
  const [prevServerApps, setPrevServerApps] = React.useState(data.apps);
  if (prevServerApps !== data.apps) {
    setPrevServerApps(data.apps);
    setApps(data.apps);
  }
  // The peek follows the URL (back button, a link); selection follows the peek.
  const [prevPeekId, setPrevPeekId] = React.useState(peekId);
  if (prevPeekId !== peekId) {
    setPrevPeekId(peekId);
    if (peekId) setSelectedId(peekId);
  }

  const lostStage = React.useMemo(() => data.stages.find((s) => s.kind === "lost") ?? null, [data.stages]);

  const byStage = React.useMemo(() => {
    const kindById = new Map(data.stages.map((s) => [s.id, s.kind]));
    const map = new Map<string, PipelineApp[]>(data.stages.map((s) => [s.id, []]));
    for (const a of apps) {
      const kind = kindById.get(a.stageId);
      // A column only shows applications whose status matches what the stage
      // means; anything else is a data error better surfaced in the list view.
      if (kind === "active" && a.status !== "open") continue;
      map.get(a.stageId)?.push(a);
    }
    return map;
  }, [apps, data.stages]);

  /** What the arrow keys walk: column by column on the board, row by row in the list. */
  const order = React.useMemo(
    () =>
      view === "list"
        ? sortForList(apps, data.stages)
        : data.stages.flatMap((s) => byStage.get(s.id) ?? []),
    [view, apps, data.stages, byStage]
  );
  const selected = React.useMemo(
    () => order.find((a) => a.id === selectedId) ?? null,
    [order, selectedId]
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
    async function commitMove(app: PipelineApp, toStage: Stage, position?: number) {
      const prev = apps;
      const patch = statusPatchForMove(app.status, toStage.kind);
      setApps((cur) =>
        cur.map((a) =>
          a.id === app.id
            ? {
                ...a,
                stageId: toStage.id,
                status: patch.status,
                ...(patch.clearDecline ? { declineReason: null } : {}),
                ...(position != null ? { position: String(position) } : {}),
              }
            : a
        )
      );
      const res = await moveApplicationStage({ applicationId: app.id, toStageId: toStage.id, position });
      if (!res.ok) {
        setApps(prev);
        toast.error(res.error, {
          action: { label: "Retry", onClick: () => commitMove(app, toStage, position) },
        });
        return;
      }
      if (res.data.reopened) toast.success(`${app.companyName} reopened into ${toStage.name}`);
      router.refresh();
    },
    [apps, router]
  );

  const requestMove = React.useCallback(
    (app: PipelineApp, toStageId: string, position?: number) => {
      if (!canEdit || app.stageId === toStageId) return;
      const stage = data.stages.find((s) => s.id === toStageId);
      if (!stage) return;
      if (stage.kind === "lost") {
        // Declines carry a reason, a note and the founder email — one dialog.
        setDeclineFor(app);
        return;
      }
      void commitMove(app, stage, position);
    },
    [canEdit, data.stages, commitMove]
  );

  const setPriority = React.useCallback(
    async (app: PipelineApp, priority: PipelineApp["priority"]) => {
      if (app.priority === priority) return;
      setApps((cur) => cur.map((a) => (a.id === app.id ? { ...a, priority } : a)));
      const ok = await savePriority(app.id, priority);
      if (ok) {
        toast.success(`${app.companyName}: ${PRIORITY_LABELS[priority].toLowerCase()}`);
        router.refresh();
      } else {
        setApps((cur) => cur.map((a) => (a.id === app.id ? { ...a, priority: app.priority } : a)));
      }
    },
    [router]
  );

  const assignToMe = React.useCallback(
    async (app: PipelineApp) => {
      if (app.ownerId === viewer.memberId) {
        toast.info(`You already own ${app.companyName}`);
        return;
      }
      if (await saveOwner(app.id, viewer.memberId)) {
        toast.success(`${app.companyName} is yours`);
        router.refresh();
      }
    },
    [router, viewer.memberId]
  );

  // Single-key shortcuts over the selected application. Every hint in the
  // footer and the peek panel is handled here (V / O live in PeekActions).
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || overlayOpen()) return;

      if (e.key === "Escape" && peekId) {
        e.preventDefault();
        setPeek(null);
        return;
      }
      if (order.length === 0) return;

      const idx = selectedId ? order.findIndex((a) => a.id === selectedId) : -1;
      const step = (delta: number) => {
        e.preventDefault();
        const next = order[idx < 0 ? 0 : Math.min(Math.max(idx + delta, 0), order.length - 1)];
        if (!next) return;
        setSelectedId(next.id);
        if (peekId) setPeek(next.id);
        document.querySelector(`[data-app-id="${next.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      if (e.key === "ArrowDown" || e.key === "j") return step(1);
      if (e.key === "ArrowUp" || e.key === "k") return step(-1);

      if (!selected) return;
      // Space / Enter on a real control (a filter chip, a link) belong to it.
      const onControl =
        e.target instanceof HTMLElement &&
        e.target.closest("button, a, [role='menuitem'], [role='combobox']") &&
        !e.target.closest("[data-app-id]");
      if (e.key === " " && !onControl) {
        e.preventDefault();
        setPeek(peekId === selected.id ? null : selected.id);
      } else if (e.key === "Enter" && !onControl) {
        e.preventDefault();
        openFull(selected.id);
      } else if (!canEdit) {
        return;
      } else if (e.key === "d" || e.key === "D") {
        if (!lostStage || selected.stageId === lostStage.id) return;
        e.preventDefault();
        setDeclineFor(selected);
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        void assignToMe(selected);
      } else if (e.key in PRIORITY_KEYS) {
        e.preventDefault();
        void setPriority(selected, PRIORITY_KEYS[e.key]);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [order, selectedId, selected, peekId, setPeek, openFull, canEdit, lostStage, assignToMe, setPriority]);

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
            ...(canEdit
              ? [
                  {
                    id: "assign-me",
                    label: "Assign to me",
                    shortcut: "A",
                    icon: UserPlusIcon,
                    run: () => void assignToMe(selected),
                  },
                  ...data.stages
                    .filter((s) => s.id !== selected.stageId && s.kind !== "lost")
                    .map((s) => ({
                      id: `stage-${s.id}`,
                      label: `Move to ${s.name}`,
                      icon: SignalHighIcon,
                      run: () => requestMove(selected, s.id),
                    })),
                  ...(lostStage && selected.stageId !== lostStage.id
                    ? [
                        {
                          id: "decline",
                          label: "Decline…",
                          shortcut: "D",
                          icon: XCircleIcon,
                          run: () => setDeclineFor(selected),
                        },
                      ]
                    : []),
                ]
              : []),
          ],
        }
      : null
  );

  const value: PipelineContextValue = {
    stages: data.stages,
    apps,
    setApps,
    byStage,
    selectedId,
    peekId,
    canEdit,
    now,
    select: setSelectedId,
    openPeek: (id) => {
      setSelectedId(id);
      setPeek(id);
    },
    requestMove,
    openMoveSheet: setMoveFor,
  };

  return (
    <PipelineContext.Provider value={value}>
      {/* Phones get a stage switcher over one column; drag needs a pointer and width. */}
      <div className="h-full md:hidden">
        <PhonePipeline />
      </div>
      <div className="hidden h-full md:block">{view === "board" ? <Board /> : <AppList />}</div>

      <DeclineDialog
        target={declineFor ? { id: declineFor.id, companyName: declineFor.companyName } : null}
        lostStageId={lostStage?.id ?? null}
        onClose={() => setDeclineFor(null)}
      />

      <Dialog open={!!moveFor} onOpenChange={(o) => !o && setMoveFor(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move {moveFor?.companyName}</DialogTitle>
            <DialogDescription>
              Pick the stage it belongs in. Declining asks for a reason first.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {data.stages.map((s) => {
              const current = s.id === moveFor?.stageId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={current}
                  onClick={() => {
                    const app = moveFor;
                    setMoveFor(null);
                    if (app) requestMove(app, s.id);
                  }}
                  className={cn(
                    "flex h-12 cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-3 text-left text-base transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-10 sm:text-sm",
                    current ? "cursor-default bg-accent-subtle font-medium text-accent" : "hover:bg-bg-subtle active:bg-bg-subtle",
                    s.kind === "lost" && !current && "text-danger"
                  )}
                >
                  <StageDot colorToken={s.colorToken} className="size-2" />
                  <span className="flex-1">{s.name}</span>
                  <span className="tnum text-xs text-fg-subtle">{byStage.get(s.id)?.length ?? 0}</span>
                  {current && <CheckIcon className="size-4" />}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </PipelineContext.Provider>
  );
}
