"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeIcon } from "lucide-react";
import { toast } from "sonner";
import { revealVoteRound } from "@/lib/actions/votes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * The reveal: a partner-only, irreversible act, so it gets a real confirm.
 * It shows counts only — the chair knows how many ballots are in, never whose.
 */
export function RevealControls({
  roundId,
  submittedCount,
  eligibleCount,
  quorum,
  votingOpen,
}: {
  roundId: string;
  submittedCount: number;
  eligibleCount: number;
  quorum: number | null;
  /** Voting hasn't hit its deadline yet — revealing now ends it early. */
  votingOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const outstanding = Math.max(0, eligibleCount - submittedCount);
  const belowQuorum = quorum != null && submittedCount < quorum;

  async function reveal() {
    setBusy(true);
    const res = await revealVoteRound({ roundId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold">Reveal the ballots</div>
        <p className="mt-0.5 text-sm text-fg-muted">
          {belowQuorum
            ? `Quorum is ${quorum}. ${submittedCount} ${submittedCount === 1 ? "ballot is" : "ballots are"} in so far.`
            : "Shows every ballot, name and rationale to the whole club at once. It can't be undone."}
        </p>
      </div>
      <Button onClick={() => setOpen(true)} disabled={belowQuorum} className="shrink-0 max-md:h-11">
        <EyeIcon />
        Reveal ballots
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reveal {submittedCount} {submittedCount === 1 ? "ballot" : "ballots"}?</DialogTitle>
            <DialogDescription>
              Every ballot becomes visible to the whole club, with names and reasoning. Voting ends
              and nothing can be changed afterwards.
            </DialogDescription>
          </DialogHeader>
          {(outstanding > 0 || votingOpen) && (
            <ul className="flex flex-col gap-1.5 rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-sm">
              {outstanding > 0 && (
                <li>
                  <span className="tnum font-medium">{outstanding}</span> eligible{" "}
                  {outstanding === 1 ? "member hasn't" : "members haven't"} voted and won&apos;t be able to.
                </li>
              )}
              {votingOpen && <li>Voting is still open — this closes it early.</li>}
            </ul>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} className="max-md:h-11">
              Not yet
            </Button>
            <Button onClick={reveal} disabled={busy} className="max-md:h-11">
              <EyeIcon />
              {busy ? "Revealing…" : "Reveal to the club"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
