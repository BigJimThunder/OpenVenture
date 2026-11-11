"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon } from "lucide-react";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";

/** One-click advance to the next stage; a stage gate explains itself in the toast. */
export function AdvanceButton({
  applicationId,
  toStageId,
  toStageName,
}: {
  applicationId: string;
  toStageId: string;
  toStageName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function advance() {
    setBusy(true);
    const res = await moveApplicationStage({ applicationId, toStageId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Moved to ${toStageName}`);
    router.refresh();
  }

  return (
    <Button size="sm" onClick={advance} disabled={busy} className="max-md:h-10">
      {busy ? "Moving…" : `Move to ${toStageName}`}
      <ArrowRightIcon />
    </Button>
  );
}
