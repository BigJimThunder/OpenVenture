"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import { useCan } from "@/components/shell/viewer";
import { StageDot } from "@/components/patterns/entity-ref";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Put a closed application back in play. Moving it to an active stage resets
 * its status to open and clears the decline reason — the stage move does the
 * work; this is just the obvious door to it.
 */
export function ReopenButton({
  applicationId,
  companyName,
  stages,
  size = "sm",
}: {
  applicationId: string;
  companyName: string;
  /** Active stages, in pipeline order. */
  stages: { id: string; name: string; colorToken: string }[];
  size?: "sm" | "default";
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");
  const [busy, setBusy] = React.useState(false);
  if (!canEdit || stages.length === 0) return null;

  async function reopen(stage: { id: string; name: string }) {
    setBusy(true);
    const res = await moveApplicationStage({ applicationId, toStageId: stage.id, note: "Reopened" });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${companyName} reopened into ${stage.name}`);
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size={size} disabled={busy} className="max-md:h-10">
          <RotateCcwIcon />
          {busy ? "Reopening…" : "Reopen"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>Reopen into</DropdownMenuLabel>
        {stages.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => reopen(s)} className="gap-2 max-md:h-11">
            <StageDot colorToken={s.colorToken} />
            {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
