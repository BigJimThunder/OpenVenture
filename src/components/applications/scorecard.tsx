"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { upsertScreeningScores } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CriterionRow = {
  id: string;
  label: string;
  description: string | null;
  /** Club-wide mean and reviewer count — a 4.3 from three people ≠ from one. */
  mean: number | null;
  count: number;
  myScore: number | null;
};

export function Scorecard({
  applicationId,
  criteria,
}: {
  applicationId: string;
  criteria: CriterionRow[];
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(
      criteria.filter((c) => c.myScore != null).map((c) => [c.id, c.myScore as number])
    )
  );
  const [busy, setBusy] = React.useState(false);

  const dirty = criteria.some((c) => (draft[c.id] ?? null) !== c.myScore);

  async function save() {
    const scores = criteria
      .filter((c) => draft[c.id] != null)
      .map((c) => ({ criterionId: c.id, score: draft[c.id] }));
    if (scores.length === 0) return;
    setBusy(true);
    const res = await upsertScreeningScores({ applicationId, scores });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Scores saved");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {criteria.map((c) => (
        <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
          <span className="min-w-0 truncate" title={c.description ?? undefined}>
            {c.label}
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <span className="tnum text-xs text-fg-muted">
              {c.mean != null ? `${c.mean.toFixed(1)} / 5 · ${c.count}` : "—"}
            </span>
            <span
              className="flex items-center gap-0.5"
              role="radiogroup"
              aria-label={`My score for ${c.label}`}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={draft[c.id] === n}
                  onClick={() =>
                    setDraft((d) => {
                      const next = { ...d };
                      if (next[c.id] === n) delete next[c.id];
                      else next[c.id] = n;
                      return next;
                    })
                  }
                  className={cn(
                    "tnum size-6 rounded-md border text-xs transition-colors",
                    draft[c.id] === n
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-border text-fg-muted hover:bg-bg-subtle"
                  )}
                >
                  {n}
                </button>
              ))}
            </span>
          </span>
        </div>
      ))}
      {dirty && (
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save my scores"}
          </Button>
        </div>
      )}
    </div>
  );
}
