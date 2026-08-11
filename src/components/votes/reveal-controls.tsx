"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";
import { revealVoteRound } from "@/lib/actions/votes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function RevealControls({
  roundId,
  submittedCount,
  eligibleCount,
}: {
  roundId: string;
  submittedCount: number;
  eligibleCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function reveal() {
    if (
      submittedCount < eligibleCount &&
      !confirm(
        `${eligibleCount - submittedCount} eligible member(s) haven't voted. Reveal anyway?`
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await revealVoteRound({ roundId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Ballots revealed");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-fg-muted">
          Revealing shows every ballot and rationale to the whole club, permanently.
        </p>
        <Button size="sm" onClick={reveal} disabled={busy}>
          <EyeIcon />
          {busy ? "Revealing…" : "Reveal ballots"}
        </Button>
      </CardContent>
    </Card>
  );
}
