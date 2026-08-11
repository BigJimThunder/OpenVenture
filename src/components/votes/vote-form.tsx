"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { submitVote } from "@/lib/actions/votes";
import type { VoteDecision } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const CONVICTION_ANCHORS: Record<number, string> = {
  1: "Hard pass",
  2: "Lean no",
  3: "Could go either way",
  4: "Lean yes",
  5: "Pound the table",
};

export function VoteForm({
  roundId,
  scaleMin,
  scaleMax,
  existing,
}: {
  roundId: string;
  scaleMin: number;
  scaleMax: number;
  existing: {
    decision: VoteDecision | null;
    conviction: number | null;
    rationale: string | null;
    suggestedAmount: string | null;
  } | null;
}) {
  const router = useRouter();
  const [decision, setDecision] = React.useState<VoteDecision | null>(existing?.decision ?? null);
  const [conviction, setConviction] = React.useState<number | null>(existing?.conviction ?? null);
  const [rationale, setRationale] = React.useState(existing?.rationale ?? "");
  const [amount, setAmount] = React.useState(
    existing?.suggestedAmount ? String(Number(existing.suggestedAmount)) : ""
  );
  const [busy, setBusy] = React.useState(false);

  const scale = Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision || conviction == null) {
      toast.error("Pick a decision and a conviction score");
      return;
    }
    setBusy(true);
    const res = await submitVote({
      roundId,
      decision,
      conviction,
      rationale: rationale.trim(),
      suggestedAmount: amount === "" ? undefined : Number(amount),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(existing ? "Ballot updated" : "Ballot sealed — nobody can see it until reveal");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{existing ? "Your ballot (editable until close)" : "Cast your ballot"}</CardTitle>
        <CardDescription>
          Vote your own view — that&apos;s the point of blind voting. Your rationale is required
          and becomes part of the record on reveal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Decision</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["fund", "decline", "abstain"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDecision(d)}
                  className={cn(
                    "h-9 cursor-pointer rounded-md border text-sm font-medium capitalize transition-colors",
                    decision === d
                      ? d === "fund"
                        ? "border-success-border bg-success-bg text-success"
                        : d === "decline"
                          ? "border-danger-border bg-danger-bg text-danger"
                          : "border-border-strong bg-bg-subtle text-fg"
                      : "border-border bg-panel text-fg-muted hover:bg-bg-subtle"
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              Conviction{" "}
              <span className="normal-case text-fg-subtle">
                {conviction != null ? `— ${CONVICTION_ANCHORS[conviction] ?? conviction}` : ""}
              </span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {scale.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setConviction(n)}
                  className={cn(
                    "tnum h-9 cursor-pointer rounded-md border text-sm font-semibold transition-colors",
                    conviction === n
                      ? "border-accent bg-accent-subtle text-accent"
                      : "border-border bg-panel text-fg-muted hover:bg-bg-subtle"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rationale">Why? (required)</Label>
            <Textarea
              id="rationale"
              rows={3}
              required
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What would make you change your mind?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suggested">Suggested check ($, optional)</Label>
            <Input
              id="suggested"
              type="number"
              min={0}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tnum w-32"
            />
          </div>

          <Button type="submit" disabled={busy || !decision || conviction == null || !rationale.trim()}>
            {busy ? "Sealing…" : existing ? "Update ballot" : "Seal ballot"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
