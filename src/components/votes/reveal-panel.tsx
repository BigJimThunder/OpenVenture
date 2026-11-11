import { format } from "date-fns";
import type { VoteDecision } from "@/db/schema";
import { medianAmount } from "@/lib/votes/suggest";
import { cn, formatMoney, initials } from "@/lib/utils";

type Ballot = {
  memberName: string;
  decision: VoteDecision | null;
  conviction: number | null;
  rationale: string | null;
  suggestedAmount: string | null;
};

const TONE: Record<VoteDecision, { label: string; text: string; bar: string; chip: string }> = {
  fund: {
    label: "Fund",
    text: "text-success",
    bar: "bg-success",
    chip: "border-success-border bg-success-bg text-success",
  },
  decline: {
    label: "Decline",
    text: "text-danger",
    bar: "bg-danger",
    chip: "border-danger-border bg-danger-bg text-danger",
  },
  abstain: {
    label: "Abstain",
    text: "text-fg-muted",
    bar: "bg-border-strong",
    chip: "border-border bg-bg-subtle text-fg-muted",
  },
};
const ORDER: VoteDecision[] = ["fund", "decline", "abstain"];

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/**
 * The reveal. Everything that was sealed, shown at once: the split, how
 * strongly each side felt, and every ballot with its name and reasoning.
 * Only ever rendered with post-reveal data from getVoteRoundResults().
 */
export function RevealPanel({
  ballots,
  missing,
  scaleMax,
  revealedAt,
}: {
  ballots: Ballot[];
  missing: string[];
  scaleMax: number;
  revealedAt: Date | null;
}) {
  const by = (d: VoteDecision) => ballots.filter((b) => b.decision === d);
  const counts = { fund: by("fund").length, decline: by("decline").length, abstain: by("abstain").length };
  const total = ballots.length;
  const conviction = (d: VoteDecision) =>
    mean(by(d).flatMap((b) => (b.conviction != null ? [b.conviction] : [])));
  const median = medianAmount(by("fund").map((b) => b.suggestedAmount));

  const headline =
    total === 0
      ? "No ballots were cast"
      : counts.fund > counts.decline
        ? counts.decline === 0
          ? "A clear yes"
          : "More votes to fund"
        : counts.decline > counts.fund
          ? counts.fund === 0
            ? "A clear no"
            : "More votes to decline"
          : "An even split";

  const scale = Array.from({ length: scaleMax }, (_, i) => i + 1);
  // Lowest conviction first within each side: the doubts are the useful part.
  const sorted = ORDER.flatMap((d) =>
    [...by(d)].sort((a, b) => (a.conviction ?? 0) - (b.conviction ?? 0))
  );

  return (
    <div className="flex flex-col gap-4">
      <section
        className="animate-in rounded-xl border border-border bg-panel p-5 shadow-sm duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none"
        aria-label="Result"
      >
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase">
            Ballots revealed{revealedAt ? ` · ${format(revealedAt, "MMM d, p")}` : ""}
          </div>
          <div className="tnum text-xs text-fg-subtle">
            {total} {total === 1 ? "ballot" : "ballots"}
          </div>
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">{headline}</h2>

        {total > 0 && (
          <div className="mt-4 flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {ORDER.filter((d) => counts[d] > 0).map((d) => (
              <span key={d} className={cn("h-full", TONE[d].bar)} style={{ flexGrow: counts[d] }} />
            ))}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-3 gap-3">
          {ORDER.map((d) => {
            const c = conviction(d);
            return (
              <div key={d}>
                <dt className="text-xs text-fg-muted">{TONE[d].label}</dt>
                <dd className={cn("tnum text-xl leading-tight font-semibold", counts[d] > 0 ? TONE[d].text : "text-fg-subtle")}>
                  {counts[d]}
                </dd>
                <dd className="tnum text-2xs text-fg-subtle">
                  {c != null ? `conviction ${c.toFixed(1)}` : "—"}
                </dd>
              </div>
            );
          })}
        </dl>

        {(median || total > 0) && (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs text-fg-muted">Conviction, by ballot</div>
              <div className="mt-1.5 flex items-end gap-2" role="img" aria-label="Conviction distribution">
                {scale.map((n) => {
                  const here = sorted.filter((b) => b.conviction === n);
                  return (
                    <div key={n} className="flex w-7 flex-col items-center gap-1">
                      <div className="flex min-h-3 flex-col-reverse gap-0.5">
                        {here.map((b, i) => (
                          <span
                            key={i}
                            className={cn("h-2 w-7 rounded-[2px]", TONE[b.decision ?? "abstain"].bar)}
                          />
                        ))}
                      </div>
                      <span className="tnum text-2xs text-fg-subtle">{n}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {median && (
              <div className="sm:text-right">
                <div className="text-xs text-fg-muted">Median suggested check</div>
                <div className="tnum text-lg font-semibold">{formatMoney(median)}</div>
              </div>
            )}
          </div>
        )}
      </section>

      <section aria-label="Ballots">
        <h2 className="mb-2 px-1 text-sm font-semibold">Every ballot</h2>
        <ul className="flex flex-col gap-2">
          {sorted.map((b, i) => {
            const tone = TONE[b.decision ?? "abstain"];
            return (
              <li
                key={`${b.memberName}-${i}`}
                className="animate-in rounded-lg border border-border bg-panel p-3.5 shadow-xs duration-500 fill-mode-both fade-in slide-in-from-bottom-1 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 12) * 60 + 150}ms` }}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[10px] font-semibold text-accent">
                    {initials(b.memberName)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.memberName}</span>
                  {b.conviction != null && (
                    <span className="flex items-center gap-0.5" title={`Conviction ${b.conviction} of ${scaleMax}`}>
                      {scale.map((n) => (
                        <span
                          key={n}
                          className={cn(
                            "size-1.5 rounded-full",
                            n <= (b.conviction ?? 0) ? tone.bar : "bg-border"
                          )}
                        />
                      ))}
                      <span className="sr-only">
                        Conviction {b.conviction} of {scaleMax}
                      </span>
                    </span>
                  )}
                  <span className={cn("rounded-full border px-2 py-0.5 text-2xs font-medium", tone.chip)}>
                    {tone.label}
                  </span>
                </div>
                {b.rationale && (
                  <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">
                    {b.rationale}
                  </p>
                )}
                {b.decision === "fund" && b.suggestedAmount && (
                  <p className="tnum mt-1.5 text-xs text-fg-subtle">
                    Suggested {formatMoney(b.suggestedAmount)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        {missing.length > 0 && (
          <p className="mt-2.5 px-1 text-xs text-fg-subtle">Didn&apos;t vote: {missing.join(", ")}</p>
        )}
      </section>
    </div>
  );
}
