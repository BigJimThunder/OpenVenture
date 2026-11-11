"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { upsertScreeningScores } from "@/lib/actions/applications";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";

type CriterionRow = {
  id: string;
  label: string;
  description: string | null;
  /** Club-wide mean and reviewer count — a 4.3 from three people ≠ from one. */
  mean: number | null;
  count: number;
  myScore: number | null;
};

const ANCHORS = ["Weak", "", "Okay", "", "Strong"];

/**
 * The screening scorecard. It leads with the viewer's own unscored criteria —
 * five big taps and one save — and shows the club's running average beside
 * each. Read-only members see the averages only.
 */
export function Scorecard({
  applicationId,
  criteria,
  scorerCount,
  locked = false,
}: {
  applicationId: string;
  criteria: CriterionRow[];
  /** Distinct members who have scored anything. */
  scorerCount: number;
  /** The application is closed — show the averages, take no new scores. */
  locked?: boolean;
}) {
  const router = useRouter();
  const canContribute = useCan("contribute");
  const canScore = canContribute && !locked;
  const [draft, setDraft] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(
      criteria.filter((c) => c.myScore != null).map((c) => [c.id, c.myScore as number])
    )
  );
  const [busy, setBusy] = React.useState(false);

  const changed = criteria.filter((c) => draft[c.id] != null && draft[c.id] !== c.myScore);
  const myCount = criteria.filter((c) => c.myScore != null).length;
  const draftCount = criteria.filter((c) => draft[c.id] != null).length;
  const scored = criteria.filter((c) => c.mean != null);
  const overall = scored.length ? scored.reduce((n, c) => n + (c.mean as number), 0) / scored.length : null;

  async function save() {
    if (changed.length === 0) return;
    setBusy(true);
    const res = await upsertScreeningScores({
      applicationId,
      scores: changed.map((c) => ({ criterionId: c.id, score: draft[c.id] })),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(draftCount === criteria.length ? "Scores saved — all criteria covered" : "Scores saved");
    router.refresh();
  }

  return (
    <section id="screening" className="scroll-mt-4 rounded-lg border border-border bg-panel shadow-xs">
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <div>
          <h2 className="text-sm font-semibold">Screening</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            {locked
              ? "How the club scored it before the decision."
              : !canScore
                ? "The club's average on each criterion."
              : myCount === 0
                ? "You haven't scored this yet. Tap a number on each line."
                : myCount < criteria.length
                  ? `You've scored ${myCount} of ${criteria.length}.`
                  : "Your scores are in. Tap to change one."}
          </p>
        </div>
        <div className="text-right">
          <div className="tnum text-xl leading-none font-semibold">
            {overall != null ? overall.toFixed(1) : "—"}
            <span className="text-xs font-normal text-fg-subtle"> / 5</span>
          </div>
          <div className="tnum mt-1 text-2xs text-fg-subtle">
            {scorerCount === 0 ? "no scores yet" : `${scorerCount} ${scorerCount === 1 ? "scorer" : "scorers"}`}
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        {criteria.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="tnum text-xs text-fg-subtle">
                  {c.mean != null ? `avg ${c.mean.toFixed(1)} · ${c.count}` : "no scores"}
                </span>
              </div>
              {c.description && <p className="mt-0.5 text-xs text-fg-muted">{c.description}</p>}
            </div>
            {canScore && (
              <div
                className="grid shrink-0 grid-cols-5 gap-1.5 sm:flex"
                role="radiogroup"
                aria-label={`My score for ${c.label}`}
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = draft[c.id] === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-label={`${n}${ANCHORS[n - 1] ? ` — ${ANCHORS[n - 1]}` : ""}`}
                      title={ANCHORS[n - 1] || undefined}
                      onClick={() => setDraft((d) => ({ ...d, [c.id]: n }))}
                      className={cn(
                        "tnum h-11 cursor-pointer rounded-md border text-base font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:size-8 sm:text-sm",
                        on
                          ? "border-accent bg-accent text-accent-fg"
                          : "border-border bg-panel text-fg-muted hover:border-border-strong hover:bg-bg-subtle hover:text-fg"
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {canScore && changed.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-bg-subtle/60 px-4 py-2.5">
          <span className="text-xs text-fg-muted">
            {draftCount < criteria.length
              ? `${criteria.length - draftCount} still blank — you can save now and finish later.`
              : "All criteria scored."}
          </span>
          <Button size="sm" onClick={save} disabled={busy} className="max-md:h-10">
            <CheckIcon />
            {busy ? "Saving…" : `Save ${changed.length === 1 ? "score" : `${changed.length} scores`}`}
          </Button>
        </div>
      )}
    </section>
  );
}
