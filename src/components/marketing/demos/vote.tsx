"use client";

import * as React from "react";
import { Lock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarTitle, Chip, Window, styles, ui } from "../kit";

type Decision = "fund" | "decline" | "abstain";

/** The six ballots already cast. Fictional members, fixed votes. */
const OTHERS: { initials: string; name: string; decision: Decision }[] = [
  { initials: "EK", name: "Elena K.", decision: "fund" },
  { initials: "SG", name: "Sam G.", decision: "fund" },
  { initials: "MK", name: "Maya K.", decision: "decline" },
  { initials: "JW", name: "Jamal W.", decision: "abstain" },
  { initials: "SA", name: "Sofia A.", decision: "fund" },
  { initials: "TR", name: "Tom R.", decision: "fund" },
];

const LABEL: Record<Decision, string> = { fund: "Fund", decline: "Decline", abstain: "Abstain" };
const TEXT: Record<Decision, string> = { fund: "text-success", decline: "text-danger", abstain: "text-fg-muted" };
const FILL: Record<Decision, string> = { fund: "bg-success", decline: "bg-danger", abstain: "bg-fg-subtle" };

/**
 * A blind vote the visitor takes part in: cast a ballot, seal it, then press
 * the button a partner presses. As in the app, nothing about the other six
 * ballots is on the page until the reveal.
 */
export function VoteDemo() {
  const [choice, setChoice] = React.useState<Decision | null>(null);
  const [sealed, setSealed] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);

  const ballots = [...OTHERS, { initials: "You", name: "You", decision: choice ?? "abstain" }];
  const cast = ballots.slice(0, sealed ? 7 : 6);
  const count = (d: Decision) => cast.filter((b) => b.decision === d).length;
  const funded = count("fund") > count("decline");

  function reset() {
    setChoice(null);
    setSealed(false);
    setRevealed(false);
  }

  return (
    <Window
      className="h-full"
      bar={
        <>
          <BarTitle meta="APP-21 · Round 1">SplitStay</BarTitle>
          <span className="ml-auto">
            {revealed ? (
              <Chip tone={funded ? "success" : "danger"} className={styles.pop}>
                {funded ? "Funded" : "Declined"} · {count("fund")}–{count("decline")}
              </Chip>
            ) : (
              <Chip tone="accent">
                <Lock className="size-3" aria-hidden />
                Blind · closes in 2 days
              </Chip>
            )}
          </span>
        </>
      }
    >
      <div className="grid gap-x-8 gap-y-7 p-5 sm:p-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* The pitch, and the visitor's ballot */}
        <div className="flex flex-col">
          <p className={styles.label}>Pitched to the group</p>
          <p className="mt-2 text-base leading-relaxed text-fg-muted">
            Roommates split rent, utilities and the deposit in one ledger. 140 students in two dorms used the
            pilot last term. Asking <span className="tnum font-medium text-fg">$2,200</span> to incorporate.
          </p>

          <fieldset className="mt-6" disabled={sealed}>
            <legend className={styles.label}>Your ballot</legend>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {(Object.keys(LABEL) as Decision[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={choice === d}
                  onClick={() => setChoice(d)}
                  className={cn(
                    ui.button,
                    "px-0",
                    choice === d ? "bg-fg text-bg" : ui.quiet
                  )}
                >
                  {LABEL[d]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-3">
            {!sealed ? (
              <button type="button" disabled={!choice} onClick={() => setSealed(true)} className={cn(ui.button, ui.primary, "w-full")}>
                <Lock className="size-3.5" aria-hidden />
                Seal my ballot
              </button>
            ) : !revealed ? (
              <button type="button" onClick={() => setRevealed(true)} className={cn(ui.button, ui.primary, "w-full")}>
                Reveal the round
              </button>
            ) : (
              <button type="button" onClick={reset} className={cn(ui.button, ui.quiet, "w-full")}>
                <RotateCcw className="size-3.5" aria-hidden />
                Vote again
              </button>
            )}
          </div>
          <p className="mt-3 min-h-10 text-sm leading-relaxed text-fg-muted" role="status" aria-live="polite">
            {!choice && "Six ballots are in. Cast the seventh."}
            {choice && !sealed && "You can still change it. Once sealed, it counts."}
            {sealed && !revealed && "Sealed. In the app, only a partner can reveal the round."}
            {revealed && `${count("fund")} to fund, ${count("decline")} to decline, ${count("abstain")} abstaining.`}
          </p>
        </div>

        {/* The round */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <p className={styles.label}>The round</p>
            <p className="tnum text-xs text-fg-muted">{sealed ? 7 : 6} of 7 ballots in · quorum 5</p>
          </div>

          <ul className="mt-2.5 grid grid-cols-4 gap-2">
            {ballots.map((b, i) => {
              const yours = b.initials === "You";
              const inBox = yours ? sealed : true;
              return (
                <li
                  key={b.initials}
                  className={cn(
                    "flex h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-lg border text-center [perspective:600px]",
                    yours ? "border-accent/60" : "border-border",
                    inBox ? "bg-panel shadow-xs" : "border-dashed bg-transparent"
                  )}
                >
                  <span className={cn("text-2xs font-semibold", yours ? "text-fg" : "text-fg-muted")}>{b.initials}</span>
                  {revealed ? (
                    <span
                      className={cn(styles.flip, "text-sm font-semibold", TEXT[b.decision])}
                      style={{ "--d": `${i * 0.08}s` } as React.CSSProperties}
                    >
                      {LABEL[b.decision]}
                      <span className="sr-only">, {b.name}</span>
                    </span>
                  ) : inBox ? (
                    <span className={cn("inline-flex items-center gap-1 text-xs text-fg-subtle", yours && styles.pop)}>
                      <Lock className="size-3" aria-hidden />
                      Sealed
                    </span>
                  ) : (
                    <span className="text-xs text-fg-subtle">Not yet</span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* The tally: empty until the reveal, then it fills. */}
          <div className="mt-4">
            <div
              className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-bg-subtle"
              role="img"
              aria-label={
                revealed
                  ? `${count("fund")} fund, ${count("decline")} decline, ${count("abstain")} abstain`
                  : "The tally is hidden until the reveal"
              }
            >
              {(["fund", "decline", "abstain"] as Decision[]).map((d) => (
                <span
                  key={d}
                  className={cn(styles.grow, "h-full rounded-full", FILL[d])}
                  style={{ width: revealed ? `${(count(d) / 7) * 100}%` : "0%" }}
                />
              ))}
            </div>
            <div className="mt-2 flex min-h-5 flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
              {revealed ? (
                (["fund", "decline", "abstain"] as Decision[]).map((d) => (
                  <span key={d} className="tnum inline-flex items-center gap-1.5">
                    <span aria-hidden className={cn("size-1.5 rounded-full", FILL[d])} />
                    {LABEL[d]} {count(d)}
                  </span>
                ))
              ) : (
                <span>No tally, no voter list and no holdouts until the reveal.</span>
              )}
            </div>
          </div>

          <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-fg-muted">
            Enforced on the server: before the reveal, nobody can read another member&apos;s ballot. That
            includes the chair and every admin.
          </p>
        </div>
      </div>
    </Window>
  );
}
