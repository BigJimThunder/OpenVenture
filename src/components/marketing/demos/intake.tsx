"use client";

import * as React from "react";
import { Check, Flag, Globe, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/patterns/field";
import { Input } from "@/components/ui/input";
import { Avatar, BarTitle, Chip, Dot, Window, styles, ui, usd } from "../kit";

/** Who gets the next application. Each submission moves one down the list. */
const ROTATION = [
  { initials: "MC", name: "Marcus Chen" },
  { initials: "EK", name: "Elena K." },
  { initials: "SG", name: "Sam G." },
  { initials: "MK", name: "Maya K." },
];

const FIRST_REF = 23; // the season has had 22 applications so far
const STEPS = 5;
const MIN = 200;
const MAX = 4000;

const toAmount = (s: string) => Number(s.replace(/[$,\s]/g, ""));

/**
 * The club's hosted application form on the left, and on the right what the
 * app does the instant it is submitted: a card with an owner, a confirmation
 * to the founder, a duplicate check and a Slack message. Same order as
 * `receiveApplication` runs them.
 */
export function IntakeDemo() {
  const [company, setCompany] = React.useState("Lecture Loop");
  const [blurb, setBlurb] = React.useState("AI note-taking synced to the course catalog");
  const [amount, setAmount] = React.useState("2,400");
  const [errors, setErrors] = React.useState<{ company?: string; amount?: string }>({});
  const [round, setRound] = React.useState(0);
  const [sent, setSent] = React.useState(false);
  const [done, setDone] = React.useState(0); // steps finished, 0 to 5
  const timers = React.useRef<number[]>([]);

  const ref = `APP-${FIRST_REF + round}`;
  const owner = ROTATION[round % ROTATION.length];
  const name = company.trim() || "The company";
  const ask = Number.isFinite(toAmount(amount)) && toAmount(amount) > 0 ? usd(Math.round(toAmount(amount))) : "$0";
  const finished = done === STEPS;

  function stop() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }
  React.useEffect(() => stop, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sent) {
      // "Submit another": the next ref, the next member in the rotation.
      stop();
      setSent(false);
      setDone(0);
      setRound((n) => n + 1);
      return;
    }
    const value = toAmount(amount);
    const next = {
      company: company.trim() ? undefined : "Enter the company's name.",
      amount:
        Number.isFinite(value) && value >= MIN && value <= MAX
          ? undefined
          : `Enter an amount from ${usd(MIN)} to ${usd(MAX)}.`,
    };
    setErrors(next);
    if (next.company || next.amount) return;
    setSent(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDone(STEPS);
      return;
    }
    for (let i = 1; i <= STEPS; i++) {
      timers.current.push(window.setTimeout(() => setDone(i), 200 + (i - 1) * 350));
    }
  }

  return (
    <Window
      className="h-full min-w-0"
      bar={
        <>
          <BarTitle>Apply to Cardinal Ventures</BarTitle>
          <span className="ml-auto">
            <Chip tone="accent">
              <Globe className="size-3" aria-hidden />
              Hosted form
            </Chip>
          </span>
        </>
      }
    >
      <div className="grid gap-x-8 gap-y-7 p-5 sm:p-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* The public form */}
        <form noValidate onSubmit={onSubmit} className="flex flex-col">
          <p className={styles.label}>What the founder fills in</p>
          <fieldset disabled={sent} className="mt-3 flex min-w-0 flex-col gap-3.5">
            <legend className="sr-only">Application</legend>
            <Field label="Company" hint="A working name is fine." error={errors.company}>
              <Input
                name="company"
                autoComplete="off"
                maxLength={40}
                value={company}
                onChange={(e) => {
                  setCompany(e.target.value);
                  if (errors.company) setErrors((prev) => ({ ...prev, company: undefined }));
                }}
              />
            </Field>
            <Field label="What are you building?">
              <Input
                name="one-liner"
                autoComplete="off"
                maxLength={80}
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
              />
            </Field>
            <Field label="Amount requested" hint={`Checks run ${usd(MIN)} to ${usd(MAX)}.`} error={errors.amount}>
              <Input
                name="amount"
                leading="$"
                inputMode="numeric"
                className={sent ? "border-border bg-bg-subtle text-fg-muted shadow-none hover:border-border" : undefined}
                autoComplete="off"
                maxLength={9}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: undefined }));
                }}
              />
            </Field>
          </fieldset>

          <button type="submit" className={cn(ui.button, sent ? ui.quiet : ui.primary, "mt-5 w-full")}>
            {sent ? (
              <>
                <RotateCcw className="size-3.5" aria-hidden />
                Submit another
              </>
            ) : (
              "Submit application"
            )}
          </button>
          <p className="mt-3 min-h-11 text-sm leading-relaxed text-fg-muted" role="status" aria-live="polite">
            {!sent && "No account needed. Founders apply from a link."}
            {sent && !finished && `Received. Routing ${ref}.`}
            {finished && `${ref} is in the pipeline with an owner. No member had to be online for any of it.`}
          </p>
        </form>

        {/* What the app does with it */}
        <div className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <p className={styles.label}>What happens next</p>
            <p className="tnum text-xs text-fg-muted">{sent ? `${done} of ${STEPS} done` : "Runs on submit"}</p>
          </div>

          <ol className="mt-3">
            <Step
              on={done >= 1}
              title={
                <>
                  A new card appears in{" "}
                  <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                    <Dot n={10} className="self-center" />
                    Applied
                  </span>
                </>
              }
            >
              <div className="mt-2 rounded-lg bg-bg-subtle p-2">
                {/* The card's own markup holds the slot open, so landing never resizes the window. */}
                <div className="relative">
                  <div
                    className={cn(
                      "rounded-md border p-2.5",
                      done >= 1 ? cn(styles.pop, "border-border bg-panel shadow-xs") : "border-dashed border-border-strong"
                    )}
                  >
                    <div className={cn(done < 1 && "invisible")}>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[0.625rem] text-fg-subtle">{ref}</span>
                        <span aria-hidden className="flex items-end gap-px">
                          {[1, 2, 3].map((n) => (
                            <span
                              key={n}
                              className={cn("w-[3px] rounded-[1px]", n === 1 ? "bg-fg-muted" : "bg-border-strong")}
                              style={{ height: 3 + n * 2 }}
                            />
                          ))}
                        </span>
                        {done >= 2 ? (
                          <Avatar initials={owner.initials} className={cn(styles.pop, "ml-auto")} />
                        ) : (
                          <span aria-hidden className="ml-auto size-5 rounded-full border border-dashed border-border-strong" />
                        )}
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold leading-tight text-fg">{name}</p>
                      <p className="mt-0.5 min-h-4 truncate text-xs text-fg-muted">{blurb}</p>
                      <div className="tnum mt-2 flex items-baseline justify-between text-2xs">
                        <span className="text-fg-muted">{ask}</span>
                        <span className="text-fg-subtle">just now</span>
                      </div>
                    </div>
                  </div>
                  {done < 1 && (
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center font-mono text-[0.625rem] text-fg-subtle"
                    >
                      {ref} lands here
                    </span>
                  )}
                </div>
              </div>
            </Step>

            <Step
              on={done >= 2}
              title={
                <span className="inline-flex flex-wrap items-center gap-x-1.5">
                  Assigned to
                  <span className="inline-flex items-center gap-1.5">
                    <Avatar initials={owner.initials} />
                    {owner.name}
                  </span>
                </span>
              }
            >
              Next in the rotation, and notified by email.
            </Step>

            <Step on={done >= 3} title="Confirmation emailed to the founder">
              They hear back before a member has opened it.
            </Step>

            <Step on={done >= 4} flag title="Possible duplicate flagged">
              Same website as an application from last spring. A person reviews it. Nothing is merged or declined automatically.
            </Step>

            <Step on={done >= 5} last title="Slack pinged in #deal-flow">
              <span className="block truncate">
                {ref}: {name}, asking <span className="tnum">{ask}</span>
              </span>
            </Step>
          </ol>
        </div>
      </div>
    </Window>
  );
}

/** One line of the timeline: hollow while pending, checked once it has run. */
function Step({
  on,
  flag,
  last,
  title,
  children,
}: {
  on: boolean;
  flag?: boolean;
  last?: boolean;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className={cn("relative flex gap-3", !last && "pb-2.5")}>
      {!last && <span aria-hidden className="absolute bottom-0 left-[9px] top-5 w-px bg-border" />}
      {on ? (
        <span
          aria-hidden
          className={cn(
            styles.pop,
            "relative inline-flex size-[1.1875rem] shrink-0 items-center justify-center rounded-full",
            flag ? "border border-warning-border bg-warning-bg text-warning" : "bg-accent text-accent-fg"
          )}
        >
          {flag ? <Flag className="size-2.5" strokeWidth={2.5} /> : <Check className="size-3" strokeWidth={3} />}
        </span>
      ) : (
        <span aria-hidden className="relative size-[1.1875rem] shrink-0 rounded-full border border-border-strong bg-bg" />
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium leading-[1.1875rem] transition-colors", on ? "text-fg" : "text-fg-subtle")}>
          <span className="sr-only">{on ? "Done: " : "Pending: "}</span>
          {title}
        </p>
        <div className={cn("mt-0.5 text-xs leading-relaxed transition-colors", on ? "text-fg-muted" : "text-fg-subtle")}>
          {children}
        </div>
      </div>
    </li>
  );
}
