"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockIcon, MinusIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { toast } from "sonner";
import { submitVote } from "@/lib/actions/votes";
import type { VoteDecision } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CONVICTION_ANCHORS: Record<number, string> = {
  1: "Barely — could be talked out of it",
  2: "Leaning, not sure",
  3: "Fairly confident",
  4: "Confident",
  5: "Certain — I'd argue for this",
};

const DECISIONS: {
  value: VoteDecision;
  label: string;
  icon: typeof ThumbsUpIcon;
  on: string;
}[] = [
  { value: "fund", label: "Fund", icon: ThumbsUpIcon, on: "border-success-border bg-success-bg text-success" },
  { value: "decline", label: "Decline", icon: ThumbsDownIcon, on: "border-danger-border bg-danger-bg text-danger" },
  { value: "abstain", label: "Abstain", icon: MinusIcon, on: "border-border-strong bg-bg-subtle text-fg" },
];

type Existing = {
  decision: VoteDecision | null;
  conviction: number | null;
  rationale: string | null;
  suggestedAmount: string | null;
};

/**
 * The ballot. Built for a thumb: three large decision buttons, conviction as
 * five large segments, one text box, one button. A sealed ballot collapses to
 * a receipt the voter can reopen while voting is still open.
 */
export function VoteForm({
  roundId,
  scaleMin,
  scaleMax,
  existing,
  amountPresets,
  allowAmount,
}: {
  roundId: string;
  scaleMin: number;
  scaleMax: number;
  existing: Existing | null;
  /** One-tap amounts, e.g. the memo's proposal and the founder's ask. */
  amountPresets: { label: string; amount: string }[];
  allowAmount: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!existing);
  const [decision, setDecision] = React.useState<VoteDecision | null>(existing?.decision ?? null);
  const [conviction, setConviction] = React.useState<number | null>(existing?.conviction ?? null);
  const [rationale, setRationale] = React.useState(existing?.rationale ?? "");
  const [amount, setAmount] = React.useState(
    existing?.suggestedAmount ? String(Number(existing.suggestedAmount)) : ""
  );
  const [busy, setBusy] = React.useState(false);

  const scale = Array.from({ length: scaleMax - scaleMin + 1 }, (_, i) => scaleMin + i);
  const ready = decision != null && conviction != null && rationale.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision || conviction == null) return;
    setBusy(true);
    const res = await submitVote({
      roundId,
      decision,
      conviction,
      rationale: rationale.trim(),
      suggestedAmount: decision === "fund" && amount !== "" ? Number(amount) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(existing ? "Ballot updated and re-sealed" : "Ballot sealed");
    setEditing(false);
    router.refresh();
  }

  if (existing && !editing) {
    const d = DECISIONS.find((x) => x.value === existing.decision);
    return (
      <section className="rounded-xl border border-border bg-panel p-4 shadow-xs" aria-label="Your ballot">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LockIcon className="size-4 text-fg-subtle" />
          Your ballot is sealed
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Only you can see this. It stays that way until a partner reveals every ballot at once.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-bg-subtle p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-fg-subtle">Decision</dt>
            <dd className="font-medium">{d?.label ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">Conviction</dt>
            <dd className="tnum font-medium">
              {existing.conviction ?? "—"} / {scaleMax}
            </dd>
          </div>
          {existing.suggestedAmount && (
            <div>
              <dt className="text-xs text-fg-subtle">Suggested check</dt>
              <dd className="tnum font-medium">{formatMoney(existing.suggestedAmount)}</dd>
            </div>
          )}
          {existing.rationale && (
            <div className="col-span-full">
              <dt className="text-xs text-fg-subtle">Why</dt>
              <dd className="whitespace-pre-wrap">{existing.rationale}</dd>
            </div>
          )}
        </dl>
        <Button variant="secondary" className="mt-3 max-md:h-11 max-md:w-full" onClick={() => setEditing(true)}>
          Change my ballot
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-panel shadow-xs" aria-label="Cast your ballot">
      <div className="px-4 pt-4">
        <h2 className="text-base font-semibold">{existing ? "Change your ballot" : "Cast your ballot"}</h2>
        <p className="mt-0.5 text-sm text-fg-muted">
          Vote your own read. Your reasoning is shown with your name at reveal — that is how the
          club learns what it believed.
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-5 p-4">
        <div className="flex flex-col gap-2">
          <Label>Should we fund it?</Label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Decision">
            {DECISIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                role="radio"
                aria-checked={decision === d.value}
                onClick={() => setDecision(d.value)}
                className={cn(
                  "flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-12 sm:flex-row sm:gap-1.5",
                  decision === d.value
                    ? d.on
                    : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg"
                )}
              >
                <d.icon className="size-4" />
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>How sure are you?</Label>
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${scale.length}, minmax(0, 1fr))` }}
            role="radiogroup"
            aria-label="Conviction"
          >
            {scale.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={conviction === n}
                aria-label={`${n}${CONVICTION_ANCHORS[n] ? ` — ${CONVICTION_ANCHORS[n]}` : ""}`}
                onClick={() => setConviction(n)}
                className={cn(
                  "tnum h-14 cursor-pointer rounded-lg border text-lg font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-11 sm:text-base",
                  conviction === n
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg"
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between text-xs text-fg-subtle" aria-hidden>
            <span>{conviction != null ? (CONVICTION_ANCHORS[conviction] ?? "") : "Barely"}</span>
            {conviction == null && <span>Certain</span>}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="rationale">Why?</Label>
          <Textarea
            id="rationale"
            rows={4}
            required
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Two sentences is plenty. What convinced you — and what would change your mind?"
            maxLength={5000}
            className="leading-relaxed max-md:text-base"
          />
        </div>

        {allowAmount && decision === "fund" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="suggested">
              How much? <span className="font-normal text-fg-subtle">— optional</span>
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-36">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-fg-subtle">
                  $
                </span>
                <Input
                  id="suggested"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="tnum h-11 pl-6 text-base sm:h-9 sm:text-sm"
                />
              </div>
              {amountPresets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(String(Number(p.amount)))}
                  className="tnum h-11 cursor-pointer rounded-lg border border-border px-3 text-sm text-fg-muted transition-colors outline-none hover:border-border-strong hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-9"
                >
                  {formatMoney(p.amount)} <span className="text-fg-subtle">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:items-center sm:justify-start">
          <Button type="submit" size="lg" disabled={busy || !ready} className="max-md:h-13 max-md:w-full">
            <LockIcon />
            {busy ? "Sealing…" : existing ? "Re-seal ballot" : "Seal ballot"}
          </Button>
          {existing && (
            <Button type="button" variant="ghost" size="lg" onClick={() => setEditing(false)} className="max-md:h-11">
              Keep my current ballot
            </Button>
          )}
          {!ready && (
            <span className="text-xs text-fg-subtle sm:mr-auto">
              {decision == null
                ? "Pick fund, decline or abstain."
                : conviction == null
                  ? "Pick how sure you are."
                  : "Add a sentence on why."}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
