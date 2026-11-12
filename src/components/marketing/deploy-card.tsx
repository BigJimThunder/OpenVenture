"use client";

import * as React from "react";
import { ArrowRight, ArrowUpRight, Check, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarTitle, Chip, Window, styles, ui, usd } from "./kit";

const DEPLOY_URL = "https://github.com/BigJimThunder/OpenVenture#deploy-your-own";
const STEP_MS = 600;

/** What the Deploy button sets off, in order. `detail` is the thing it makes. */
const STEPS = [
  { label: "Code copied to your GitHub account", detail: "openventure" },
  { label: "Free Postgres database created", detail: "Neon" },
  { label: "Tables created and migrations applied", detail: "9 migrations" },
  { label: "You sign in and become the first admin", detail: "magic link" },
];

const COSTS = [
  { name: "Vercel Hobby", role: "hosting", monthly: 0 },
  { name: "Neon free tier", role: "database", monthly: 0 },
  { name: "Resend free tier", role: "email", monthly: 0 },
];

/**
 * A preview of the one-click deploy: the four things it does, played back in
 * order, beside what the result costs to run. It is a simulation and says so
 * in every state; the real link is always on the card.
 */
export function DeployCard() {
  // -1 at rest, 0–3 while that step runs, 4 once all four are done.
  const [step, setStep] = React.useState(-1);
  const running = step >= 0 && step < STEPS.length;
  const done = step >= STEPS.length;

  const runRef = React.useRef<HTMLButtonElement>(null);
  const realRef = React.useRef<HTMLAnchorElement>(null);
  // The primary control changes element as the preview finishes or restarts;
  // if the keyboard was on it, carry focus to whatever replaces it.
  const focusNext = React.useRef<"run" | "real" | null>(null);

  React.useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      if (step === STEPS.length - 1 && document.activeElement === runRef.current) focusNext.current = "real";
      setStep((s) => s + 1);
    }, STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step, running]);

  React.useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    if (target === "real" && done) {
      realRef.current?.focus();
      focusNext.current = null;
    } else if (target === "run" && !done) {
      runRef.current?.focus();
      focusNext.current = null;
    }
  }, [done]);

  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function run(e: React.MouseEvent<HTMLButtonElement>) {
    if (running) return;
    if (reducedMotion()) {
      if (document.activeElement === e.currentTarget) focusNext.current = "real";
      setStep(STEPS.length);
    } else {
      setStep(0);
    }
  }

  function again(e: React.MouseEvent<HTMLButtonElement>) {
    if (document.activeElement === e.currentTarget) focusNext.current = "run";
    // With motion off there is nothing to replay, so go back to the start.
    setStep(reducedMotion() ? -1 : 0);
  }

  const total = COSTS.reduce((sum, c) => sum + c.monthly, 0);

  return (
    <Window
      bar={
        <>
          <BarTitle>Deploy OpenVenture</BarTitle>
          <span className="ml-auto">
            {done ? (
              <Chip tone="success" className={styles.pop}>
                <Check className="size-3" strokeWidth={3} aria-hidden />
                Done
              </Chip>
            ) : running ? (
              <Chip tone="accent" className="tnum">
                <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
                Running · {step + 1} of {STEPS.length}
              </Chip>
            ) : (
              <Chip>Ready</Chip>
            )}
          </span>
        </>
      }
    >
      <div className="px-5 pb-5 pt-3 sm:px-6 sm:pt-4">
        <ol aria-label="What the deploy does">
          {STEPS.map((s, i) => {
            const isDone = i < step;
            const isRunning = i === step;
            return (
              <li key={s.label} className="flex gap-3">
                {/* The marker, on a rail that fills in as the steps complete. */}
                <span aria-hidden className="flex w-5 shrink-0 flex-col items-center">
                  <span className={cn("w-px flex-1 transition-colors duration-300", i === 0 ? "bg-transparent" : i <= step ? "bg-success" : "bg-border-strong")} />
                  {isDone ? (
                    <span className={cn(styles.pop, "inline-flex size-5 items-center justify-center rounded-full bg-success text-bg")}>
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  ) : isRunning ? (
                    <LoaderCircle className="size-5 animate-spin text-accent motion-reduce:animate-none" />
                  ) : (
                    <span className="size-5 rounded-full border-[1.5px] border-border-strong bg-bg" />
                  )}
                  <span
                    className={cn(
                      "w-px flex-1 transition-colors duration-300",
                      i === STEPS.length - 1 ? "bg-transparent" : isDone ? "bg-success" : "bg-border-strong"
                    )}
                  />
                </span>
                <span className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 py-2">
                  <span className={cn("text-base leading-snug transition-colors", isDone || isRunning ? "text-fg" : "text-fg-muted")}>
                    {s.label}
                    <span className="sr-only">{isDone ? " (done)" : isRunning ? " (running)" : " (not started)"}</span>
                  </span>
                  <span className={cn("tnum shrink-0 font-mono text-2xs transition-colors", isDone ? "text-fg-muted" : "text-fg-subtle")}>
                    {s.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 rounded-lg border border-border bg-panel px-3.5 shadow-xs">
          <table className="tnum w-full text-sm">
            <caption className="sr-only">What it costs to run each month</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Service</th>
                <th scope="col">Per month</th>
              </tr>
            </thead>
            <tbody>
              {COSTS.map((c) => (
                <tr key={c.name} className="border-b border-border">
                  <th scope="row" className="h-9 text-left font-normal text-fg">
                    {c.name}
                    <span className="text-fg-subtle"> · {c.role}</span>
                  </th>
                  <td className="h-9 text-right text-fg-muted">{usd(c.monthly)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" className="h-10 text-left font-semibold text-fg">
                  Total per month
                </th>
                <td className="h-10 text-right text-md font-semibold text-fg">{usd(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-fg-subtle">Covers a fifteen-person club.</p>
      </div>

      <div className="border-t border-border bg-bg-subtle/50 px-5 py-4 sm:px-6">
        <p role="status" aria-live="polite" className="min-h-8 text-xs leading-snug text-fg-muted sm:min-h-4">
          {done
            ? "Preview complete. Nothing was created."
            : running
              ? "Preview running. Nothing is being created."
              : "Preview. Nothing is created until you deploy for real."}
        </p>
        <div className="mt-3 flex flex-col gap-2 whitespace-nowrap sm:flex-row">
          {done ? (
            <>
              <a ref={realRef} href={DEPLOY_URL} className={cn(ui.button, ui.primary, styles.pop, "sm:flex-1")}>
                Deploy for real
                <ArrowRight className="size-3.5" aria-hidden />
              </a>
              <button type="button" onClick={again} className={cn(ui.button, ui.quiet)}>
                <RotateCcw className="size-3.5" aria-hidden />
                Run again
              </button>
            </>
          ) : (
            <>
              <button
                ref={runRef}
                type="button"
                aria-disabled={running || undefined}
                onClick={run}
                className={cn(ui.button, "sm:flex-1", running ? "cursor-default bg-bg-subtle text-fg-muted" : ui.primary)}
              >
                {running ? (
                  "Running the preview"
                ) : (
                  <>
                    <Play className="size-3.5" aria-hidden />
                    Preview the deploy
                  </>
                )}
              </button>
              <a href={DEPLOY_URL} className={cn(ui.button, ui.quiet)}>
                Deploy for real
                <ArrowUpRight className="size-3.5" aria-hidden />
              </a>
            </>
          )}
        </div>
      </div>
    </Window>
  );
}
