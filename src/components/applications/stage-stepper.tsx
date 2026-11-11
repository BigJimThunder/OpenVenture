"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { StageDot } from "@/components/patterns/entity-ref";
import { DeclineDialog } from "./decline-dialog";

type Stage = {
  id: string;
  name: string;
  colorToken: string;
  kind: string;
  position: string;
};

/**
 * Where the application has been, where it is, what's next. For members who
 * can contribute each step is a button: click to move there (a declined stage
 * opens the decline dialog; a gate that isn't met explains itself in a toast).
 * Read-only members get the same picture with nothing to click.
 */
export function StageStepper({
  stages,
  currentStageId,
  applicationId,
  companyName,
  size = "default",
  className,
}: {
  stages: Stage[];
  currentStageId: string;
  applicationId: string;
  companyName: string;
  size?: "default" | "compact";
  className?: string;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");
  const [busy, setBusy] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);
  const lostStage = stages.find((s) => s.kind === "lost");
  // A declined or parked application didn't "complete" the stages before it.
  const currentKind = stages[currentIdx]?.kind;
  const showDone = currentKind === "active" || currentKind === "won";

  async function move(stage: Stage) {
    if (stage.id === currentStageId || busy) return;
    if (stage.kind === "lost") {
      setDeclining(true);
      return;
    }
    setBusy(true);
    const res = await moveApplicationStage({ applicationId, toStageId: stage.id });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.data.reopened) toast.success(`${companyName} reopened into ${stage.name}`);
    router.refresh();
  }

  const compact = size === "compact";
  return (
    <>
      <ol
        className={cn(
          "flex items-center gap-1 overflow-x-auto [scrollbar-width:none]",
          !compact && "rounded-lg border border-border bg-panel p-1 shadow-xs",
          className
        )}
        aria-label="Pipeline stage"
      >
        {stages.map((s, i) => {
          const done = showDone && i < currentIdx && s.kind === "active";
          const active = s.id === currentStageId;
          const body = (
            <>
              {done ? (
                <CheckIcon className={compact ? "size-2.5" : "size-3"} strokeWidth={3} />
              ) : (
                <StageDot colorToken={s.colorToken} className={compact ? "size-[5px]" : undefined} />
              )}
              {s.name}
            </>
          );
          const cls = cn(
            "flex shrink-0 items-center whitespace-nowrap transition-colors",
            compact
              ? "h-[22px] gap-1 rounded-[5px] px-[7px] text-[10.5px] max-md:h-9 max-md:px-3 max-md:text-sm"
              : "h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium max-md:h-10 max-md:px-3.5 max-md:text-sm",
            active
              ? "bg-accent-subtle font-semibold text-accent"
              : done
                ? "text-fg-muted"
                : "text-fg-subtle"
          );
          return (
            <li key={s.id} aria-current={active ? "step" : undefined} className="shrink-0">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => move(s)}
                  disabled={busy || active}
                  title={active ? undefined : `Move to ${s.name}`}
                  className={cn(
                    cls,
                    "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-default",
                    !active && "hover:bg-bg-subtle hover:text-fg",
                    busy && !active && "opacity-60"
                  )}
                >
                  {body}
                </button>
              ) : (
                <span className={cls}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <DeclineDialog
          target={declining ? { id: applicationId, companyName } : null}
          lostStageId={lostStage?.id ?? null}
          onClose={() => setDeclining(false)}
        />
      )}
    </>
  );
}
