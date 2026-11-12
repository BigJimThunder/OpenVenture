"use client";

import * as React from "react";
import { CircleAlert, CircleCheck, Minus, Plus, RotateCcw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BarTitle, Chip, Window, styles, ui, usd } from "../kit";

const POOL = 10_000;
const STEP = 100;
const MIN = 200;
const MAX = 4_000;
const ASK = 2_400;

type Status = "Reconciled" | "Cashed" | "Issued" | "Approved" | "Proposed";
type Tone = React.ComponentProps<typeof Chip>["tone"];

/** The year so far. Whole dollars: this is a replica, not a ledger. */
const GRANTS: { ref: string; company: string; status: Exclude<Status, "Proposed">; amount: number }[] = [
  { ref: "GRN-1", company: "MintBudget", status: "Reconciled", amount: 1150 },
  { ref: "GRN-2", company: "GreenPlate", status: "Cashed", amount: 1650 },
  { ref: "GRN-3", company: "LabMate", status: "Issued", amount: 2350 },
  { ref: "GRN-4", company: "AquaSense", status: "Approved", amount: 2650 },
];
const COMMITTED = GRANTS.reduce((n, g) => n + g.amount, 0);
const REMAINING = POOL - COMMITTED;

/** One color per place the money can be: paid out, check in the mail, reserved. */
const TONE: Record<Status, Tone> = {
  Reconciled: "success",
  Cashed: "success",
  Issued: "info",
  Approved: "accent",
  Proposed: "neutral",
};
const FILL: Record<Exclude<Status, "Proposed">, string> = {
  Reconciled: "bg-success",
  Cashed: "bg-success",
  Issued: "bg-info",
  Approved: "bg-accent",
};
const LEGEND = [
  { label: "Paid out", fill: "bg-success" },
  { label: "Issued", fill: "bg-info" },
  { label: "Approved", fill: "bg-accent" },
];

/** A proposal is drawn hatched: it is not money yet. */
const hatch = (token: string): React.CSSProperties => ({
  backgroundColor: `color-mix(in oklch, var(${token}) 22%, transparent)`,
  backgroundImage: `repeating-linear-gradient(135deg, var(${token}) 0 2px, transparent 2px 5px)`,
});

/** Segments are parted by a 2px rule inside their own width, so the widths stay exact. */
const SPLIT = "border-l-2 border-transparent";

const share = (n: number) => `${(n / POOL) * 100}%`;

/**
 * The overdraw guard. The visitor is the treasurer, holding one proposed grant
 * that is $200 more than the pool has left. Approving it is refused in the
 * app's own words; bring it down to what remains and it goes through.
 */
export function LedgerDemo() {
  const [amount, setAmount] = React.useState(ASK);
  const [phase, setPhase] = React.useState<"proposed" | "refused" | "approved">("proposed");
  const [touched, setTouched] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  const approved = phase === "approved";
  const committed = COMMITTED + (approved ? amount : 0);
  const left = POOL - committed;
  const over = approved ? 0 : Math.max(0, amount - REMAINING);

  function change(delta: number) {
    setAmount((a) => Math.min(MAX, Math.max(MIN, a + delta)));
    setPhase("proposed");
    setTouched(true);
  }

  function approve() {
    if (over > 0) {
      setPhase("refused");
      setAttempt((n) => n + 1);
    } else {
      setPhase("approved");
    }
  }

  function reset() {
    setAmount(ASK);
    setPhase("proposed");
    setTouched(false);
  }

  const stats = [
    { label: "Pool", value: usd(POOL), live: false },
    { label: "Committed", value: usd(committed), live: true },
    { label: "Remaining", value: usd(left), live: true },
  ];

  return (
    <Window
      className="h-full"
      bar={
        <>
          <BarTitle meta="2026–27 pool">Grants</BarTitle>
          <span className="ml-auto">
            <Chip key={left} tone="accent" className={cn("tnum", approved && styles.pop)}>
              {usd(left)} remaining
            </Chip>
          </span>
        </>
      }
    >
      <div className="@container p-5 sm:p-6">
        {/* The pool at a glance */}
        <dl className="grid grid-cols-3">
          {stats.map((s, i) => (
            <div key={s.label} className={cn(i > 0 && "border-l border-border pl-3.5 sm:pl-5")}>
              <dt className={styles.label}>{s.label}</dt>
              <dd
                key={s.value}
                className={cn(
                  "tnum mt-1 text-lg font-semibold tracking-tight text-fg sm:text-[1.625rem] sm:leading-8",
                  s.live && approved && styles.pop
                )}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Burn-down: every grant is a segment of the pool; the proposal is a
            hatched preview, and whatever does not fit runs past the limit. */}
        <div
          className="mt-4 flex h-2.5 items-stretch"
          role="img"
          aria-label={
            approved
              ? `${usd(committed)} of ${usd(POOL)} committed.`
              : `${usd(committed)} of ${usd(POOL)} committed. The proposed ${usd(amount)} ${
                  over > 0 ? `is ${usd(over)} more than the pool has left.` : "fits in what remains."
                }`
          }
        >
          <div
            className={cn(styles.grow, "flex min-w-0 basis-0 overflow-hidden rounded-full bg-bg-subtle")}
            style={{ flexGrow: POOL }}
          >
            {GRANTS.map((g, i) => (
              <span
                key={g.ref}
                className={cn("h-full bg-clip-padding", i > 0 && SPLIT, FILL[g.status])}
                style={{ width: share(g.amount) }}
              />
            ))}
            <span
              className={cn(styles.grow, "h-full bg-clip-padding", SPLIT, approved && "bg-accent")}
              style={{
                width: share(approved ? amount : Math.min(amount, REMAINING)),
                ...(approved ? null : hatch(over > 0 ? "--danger" : "--accent")),
              }}
            />
          </div>
          <span className={cn("-my-1 w-0.5 shrink-0 rounded-full bg-danger", over > 0 ? "mx-[3px]" : "hidden")} />
          <span
            className={cn(styles.grow, "basis-0 rounded-full bg-danger")}
            style={{ flexGrow: over, minWidth: over > 0 ? "0.5rem" : 0 }}
          />
        </div>
        <div className="mt-2.5 flex min-h-10 flex-wrap content-start items-center justify-between gap-x-4 gap-y-1 text-xs text-fg-muted @[28rem]:min-h-5">
          <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
            {LEGEND.map((l) => (
              <li key={l.label} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("size-2 rounded-xs", l.fill)} />
                {l.label}
              </li>
            ))}
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-xs" style={hatch(over > 0 ? "--danger" : "--accent")} />
              Proposed
            </li>
          </ul>
          <p className={cn("tnum", over > 0 && "font-medium text-danger")}>
            {approved
              ? left > 0
                ? `${usd(left)} left to grant this year`
                : "The pool is fully committed"
              : over > 0
                ? phase === "refused"
                  ? `Lower GRN-5 by ${usd(over)} to fit`
                  : `GRN-5 is ${usd(over)} over the pool`
                : `GRN-5 fits, leaving ${usd(REMAINING - amount)}`}
          </p>
        </div>

        {/* The grants */}
        <div className="mt-3.5 overflow-hidden rounded-lg border border-border bg-panel">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className={cn(styles.label, "text-left")}>
                <th scope="col" className="hidden h-8 w-[4.5rem] border-b border-border pl-3.5 font-normal sm:table-cell">
                  Ref
                </th>
                <th scope="col" className="h-8 border-b border-border pl-3.5 font-normal sm:pl-0">
                  Company
                </th>
                <th scope="col" className="hidden h-8 w-[34%] border-b border-border font-normal sm:table-cell">
                  Status
                </th>
                <th scope="col" className="h-8 w-[10.75rem] border-b border-border pr-3.5 text-right font-normal md:w-36">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {GRANTS.map((g) => (
                <tr key={g.ref}>
                  <td className="hidden h-9 border-b border-border pl-3.5 font-mono text-xs text-fg-subtle sm:table-cell">
                    {g.ref}
                  </td>
                  <td className="border-b border-border py-2 pl-3.5 font-medium text-fg sm:py-0 sm:pl-0">
                    {g.company}
                    <span className="mt-1 block sm:hidden">
                      <Chip tone={TONE[g.status]}>{g.status}</Chip>
                    </span>
                  </td>
                  <td className="hidden border-b border-border sm:table-cell">
                    <Chip tone={TONE[g.status]}>{g.status}</Chip>
                  </td>
                  <td className="tnum border-b border-border pr-3.5 text-right text-fg">{usd(g.amount)}</td>
                </tr>
              ))}
              <ProposedRow
                amount={amount}
                approved={approved}
                nudge={phase === "refused"}
                onChange={change}
              />
            </tbody>
          </table>
        </div>

        {/* The approval */}
        <div className="mt-3.5 flex flex-col gap-3 @[32rem]:flex-row @[32rem]:items-center @[32rem]:gap-4">
          {approved ? (
            <button type="button" onClick={reset} className={cn(ui.button, ui.quiet, "shrink-0 @[32rem]:w-44")}>
              <RotateCcw className="size-3.5" aria-hidden />
              Start over
            </button>
          ) : (
            <button type="button" onClick={approve} className={cn(ui.button, ui.primary, "tnum shrink-0 @[32rem]:w-44")}>
              Approve {usd(amount)}
            </button>
          )}
          {/* The longest refusal is laid out unseen in the same cell, so the
              line keeps one height at every width and in every state. */}
          <div className="grid min-w-0 flex-1 items-start text-sm leading-snug text-fg-muted @[32rem]:items-center">
            <Refusal aria-hidden over={MAX - REMAINING} className="invisible col-start-1 row-start-1" />
            <div role="status" aria-live="polite" className="col-start-1 row-start-1 min-w-0">
              {phase === "refused" && <Refusal key={attempt} over={over} className={styles.shake} />}
              {phase === "proposed" && (
                <p className="tnum">
                  {!touched && `The vote passed. Lecture Loop asked for ${usd(ASK)}. Approve the grant.`}
                  {touched && over > 0 && `${usd(amount)} is still ${usd(over)} more than the pool has left.`}
                  {touched &&
                    over === 0 &&
                    `${usd(amount)} fits. Approving it leaves ${usd(REMAINING - amount)} in the pool.`}
                </p>
              )}
              {approved && (
                <p className={cn(styles.pop, "tnum flex items-start gap-2")}>
                  <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
                  <span>
                    Approved at {usd(amount)}. {usd(left)} remains in the pool.
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-fg-muted">
          <ShieldCheck className="mt-[3px] size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          The check runs again as the write commits, so two officers approving at the same moment cannot
          overdraw the pool either.
        </p>
      </div>
    </Window>
  );
}

/** The refusal, in the words the server sends back. */
function Refusal({ over, className, ...rest }: { over: number } & React.ComponentProps<"p">) {
  return (
    <p
      {...rest}
      className={cn(
        "tnum flex w-full items-start gap-2 rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-danger",
        className
      )}
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>
        Approving would overdraw the pool by {usd(over, true)}. Only {usd(REMAINING, true)} remains.
      </span>
    </p>
  );
}

const stepper =
  "inline-flex size-11 cursor-pointer items-center justify-center text-fg-muted outline-none transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 disabled:cursor-default disabled:text-fg-subtle disabled:hover:bg-transparent md:size-7";

/** GRN-5: the one row the visitor can change. */
function ProposedRow({
  amount,
  approved,
  nudge,
  onChange,
}: {
  amount: number;
  approved: boolean;
  nudge: boolean;
  onChange: (delta: number) => void;
}) {
  const cell = cn(styles.grow, approved ? "bg-transparent" : "bg-accent-subtle");
  return (
    <tr>
      <td className={cn(cell, "hidden pl-3.5 font-mono text-xs text-fg-muted sm:table-cell")}>GRN-5</td>
      <td className={cn(cell, "py-2 pl-3.5 font-medium text-fg sm:py-0 sm:pl-0")}>
        Lecture Loop
        <span className="mt-1 block sm:hidden">
          <StatusChip approved={approved} />
        </span>
      </td>
      <td className={cn(cell, "hidden sm:table-cell")}>
        <StatusChip approved={approved} />
      </td>
      <td className={cn(cell, "py-1.5 pr-3.5 md:pr-2.5")}>
        <div className="flex h-11 items-center justify-end md:h-7">
          {approved ? (
            <span className="tnum text-fg md:pr-1">{usd(amount)}</span>
          ) : (
            <span className="inline-flex items-center overflow-hidden rounded-md border border-border-strong bg-panel">
              <button
                type="button"
                onClick={() => onChange(-STEP)}
                disabled={amount <= MIN}
                aria-label="Lower the grant by $100"
                className={cn(stepper, nudge && "bg-accent text-accent-fg hover:bg-accent-hover hover:text-accent-fg")}
              >
                <Minus className="size-3.5" aria-hidden />
              </button>
              <span className="tnum w-[3.75rem] border-x border-border-strong text-center font-medium leading-[2.75rem] text-fg md:leading-7">
                {usd(amount)}
              </span>
              <button
                type="button"
                onClick={() => onChange(STEP)}
                disabled={amount >= MAX}
                aria-label="Raise the grant by $100"
                className={stepper}
              >
                <Plus className="size-3.5" aria-hidden />
              </button>
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function StatusChip({ approved }: { approved: boolean }) {
  return approved ? (
    <Chip tone={TONE.Approved} className={styles.pop}>
      Approved
    </Chip>
  ) : (
    <Chip tone={TONE.Proposed} className="bg-panel">
      Proposed
    </Chip>
  );
}
