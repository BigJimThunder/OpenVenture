"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

type Decision = "fund" | "decline" | "abstain";

/** The six ballots already in the box. Fictional members, fixed votes. */
const OTHERS: { initials: string; name: string; decision: Decision }[] = [
  { initials: "EK", name: "Elena K.", decision: "fund" },
  { initials: "SG", name: "Sam G.", decision: "fund" },
  { initials: "MK", name: "Maya K.", decision: "decline" },
  { initials: "JW", name: "Jamal W.", decision: "abstain" },
  { initials: "SA", name: "Sofia A.", decision: "fund" },
  { initials: "TR", name: "Tom R.", decision: "fund" },
];

const LABEL: Record<Decision, string> = { fund: "Fund", decline: "Decline", abstain: "Abstain" };
const TONE: Record<Decision, string> = {
  fund: "text-success",
  decline: "text-danger",
  abstain: "text-fg-muted",
};

/**
 * Exhibit A: a blind vote the visitor takes part in. They commit to a ballot
 * before they can see anyone else's, then press the button a partner presses.
 * It behaves the way the app does: nothing about the other ballots is on the
 * page until the reveal.
 */
export function SealedVote() {
  const [choice, setChoice] = React.useState<Decision | null>(null);
  const [sealed, setSealed] = React.useState(false);
  const [revealed, setRevealed] = React.useState(false);

  const ballots = [...OTHERS.map((o) => o.decision), ...(choice ? [choice] : [])];
  const count = (d: Decision) => ballots.filter((b) => b === d).length;
  const funded = count("fund") > count("decline");

  function reset() {
    setChoice(null);
    setSealed(false);
    setRevealed(false);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
      {/* The pitch, and your ballot */}
      <div className="flex flex-col">
        <p className={cn(styles.label, "text-fg-subtle")}>APP-21 · Pitched to the group</p>
        <h3 className="mt-2 font-display text-2xl font-medium tracking-tight">SplitStay</h3>
        <p className="mt-2 text-base leading-relaxed text-fg-muted">
          Roommates split rent, utilities and the deposit in one ledger. 140 students in two dorms
          used the pilot last term. They are asking for{" "}
          <span className="tnum font-medium text-fg">$2,200</span> to incorporate and pay a
          registered agent for a year.
        </p>

        <fieldset className="mt-6" disabled={sealed}>
          <legend className={cn(styles.label, "text-fg-subtle")}>Your ballot</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {(Object.keys(LABEL) as Decision[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={choice === d}
                onClick={() => setChoice(d)}
                className={cn(
                  "h-11 cursor-pointer rounded-md border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-default",
                  choice === d
                    ? "border-fg bg-fg text-bg"
                    : "border-border-strong bg-panel text-fg hover:border-fg disabled:text-fg-subtle disabled:hover:border-border-strong"
                )}
              >
                {LABEL[d]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2">
          {!sealed ? (
            <button
              type="button"
              disabled={!choice}
              onClick={() => setSealed(true)}
              className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-default disabled:bg-bg-subtle disabled:text-fg-subtle"
            >
              Seal my ballot
            </button>
          ) : !revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
            >
              Reveal the round
            </button>
          ) : (
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border-strong bg-panel px-5 text-sm font-medium outline-none transition-colors hover:border-fg focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              Vote again
            </button>
          )}
          <p className="text-sm text-fg-muted" role="status" aria-live="polite">
            {!choice && "Pick one. You can't see the others yet."}
            {choice && !sealed && "You can still change it. Once sealed, it's in the box."}
            {sealed && !revealed && "Sealed. In the app, only a partner has this next button."}
            {revealed &&
              `${count("fund")} to fund, ${count("decline")} to decline, ${count("abstain")} abstaining.`}
          </p>
        </div>
      </div>

      {/* The box */}
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn(styles.label, "text-fg-subtle")}>
            The round · {sealed ? 7 : 6} of 7 ballots in
          </p>
          {revealed && (
            <span className={cn(styles.stamp, styles.thunk, funded ? "text-success" : "text-danger")}>
              {funded ? "Funded · $2,200" : "Declined"}
            </span>
          )}
        </div>
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:gap-2.5">
          {[...OTHERS, { initials: "You", name: "You", decision: choice ?? "abstain" }].map((b, i) => {
            const yours = b.initials === "You";
            const inBox = yours ? sealed : true;
            return (
              <li
                key={b.initials}
                className={cn(
                  "flex aspect-[5/6] flex-col items-center justify-between rounded-md border px-1 py-2.5 text-center",
                  yours ? "border-fg" : "border-border-strong",
                  inBox ? "bg-panel" : "border-dashed bg-transparent"
                )}
              >
                <span className={cn(styles.label, yours ? "text-fg" : "text-fg-muted")}>{b.initials}</span>
                {revealed ? (
                  <span
                    className={cn(styles.pop, "font-display text-[0.9375rem] font-medium sm:text-lg", TONE[b.decision])}
                    style={{ "--d": `${i * 0.07}s` } as React.CSSProperties}
                  >
                    {LABEL[b.decision]}
                  </span>
                ) : inBox ? (
                  <span aria-hidden className="size-7 rounded-full border-[1.5px] border-fg-subtle/60 bg-bg-subtle" />
                ) : (
                  <span aria-hidden className="text-lg text-fg-subtle">·</span>
                )}
                <span className={cn(styles.label, "text-[0.5625rem] text-fg-subtle")}>
                  {revealed ? <span className="sr-only">{b.name}</span> : inBox ? "Sealed" : "Not yet"}
                </span>
              </li>
            );
          })}
          <li
            aria-hidden
            className="hidden aspect-[5/6] items-center justify-center rounded-md border border-dashed border-border text-center sm:flex"
          >
            <span className={cn(styles.label, "px-1 text-[0.5625rem] text-fg-subtle")}>Quorum 5</span>
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          Until the reveal nobody sees a ballot but their own, and nobody sees who is holding out.
          That goes for admins too: it is enforced on the server, where a setting can&apos;t undo it.
        </p>
      </div>
    </div>
  );
}
