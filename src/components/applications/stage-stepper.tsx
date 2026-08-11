"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import { cn } from "@/lib/utils";

type Stage = {
  id: string;
  name: string;
  colorToken: string;
  kind: string;
  position: string;
};

/** Click a stage to move the application there (declines go through the board's reason dialog). */
export function StageStepper({
  stages,
  currentStageId,
  applicationId,
}: {
  stages: Stage[];
  currentStageId: string;
  applicationId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const currentIdx = stages.findIndex((s) => s.id === currentStageId);

  async function move(stage: Stage) {
    if (stage.id === currentStageId || busy) return;
    if (stage.kind === "lost") {
      toast.info("Use the board to decline — a reason is required.");
      return;
    }
    setBusy(true);
    const res = await moveApplicationStage({ applicationId, toStageId: stage.id });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-panel p-1">
      {stages.map((s, i) => {
        const done = i < currentIdx;
        const active = s.id === currentStageId;
        return (
          <button
            key={s.id}
            onClick={() => move(s)}
            disabled={busy}
            className={cn(
              "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
              active
                ? "bg-accent-subtle text-accent"
                : done
                  ? "text-fg-muted hover:bg-bg-subtle"
                  : "text-fg-subtle hover:bg-bg-subtle hover:text-fg-muted"
            )}
          >
            {done ? (
              <CheckIcon className="size-3" />
            ) : (
              <span
                className="size-1.5 rounded-full"
                style={{ background: `var(--${s.colorToken})` }}
              />
            )}
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
