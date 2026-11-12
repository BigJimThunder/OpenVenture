"use client";

import * as React from "react";
import { Calculator, ChevronRight, RotateCcw } from "lucide-react";
import { foldCapTable } from "@/lib/captable/engine";
import type { CapEventInput, CapEventPayload } from "@/lib/captable/types";
import { POOL_ID, dollars, holderColors, pct, shares } from "@/components/lab/format";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { styles, usd } from "../kit";

/**
 * The Cap Table Lab in one card. The sliders write a five-event ledger and
 * the app's own engine folds it on every change, here in the browser. Nothing
 * below computes ownership: shares, percentages and the worked steps are the
 * engine's output, formatted with the Lab's own formatters.
 */

const DEFAULTS = { investment: 125_000, cap: 5_000_000, seed: true };

const ANA = { id: "founder-1", name: "Ana Ruiz", kind: "founder" as const };
const BEN = { id: "founder-2", name: "Ben Okoro", kind: "founder" as const };
const ANGEL = { id: "angel", name: "Angel investor", kind: "angel" as const };
const SEED = { id: "seed", name: "Seed investors", kind: "fund" as const };

/** Whole dollars and whole shares in; the engine turns them into decimals. */
function ledger(investment: number, cap: number, seed: boolean): CapEventInput[] {
  const payloads: CapEventPayload[] = [
    { kind: "founding_issuance", stakeholder: ANA, classId: "common", shares: 5_400_000 },
    { kind: "founding_issuance", stakeholder: BEN, classId: "common", shares: 3_600_000 },
    { kind: "pool_create", classId: "pool", shares: 1_000_000 },
    {
      kind: "safe_issue",
      instrumentId: "safe-1",
      stakeholder: ANGEL,
      principal: investment,
      capType: "post_money",
      valuationCap: cap,
      mfn: false,
    },
  ];
  if (seed) {
    payloads.push({
      kind: "priced_round",
      name: "Seed round",
      classId: "seed-preferred",
      preMoneyValuation: 8_000_000,
      newMoney: 1_000_000,
      participations: [{ stakeholder: SEED, amount: 1_000_000 }],
    });
  }
  return payloads.map((payload, i) => ({ seq: i + 1, effectiveDate: "2026-09-01", payload }));
}

/** Same colors the Lab would give these holders, in a fixed left-to-right order. */
const colorOf = holderColors(ledger(DEFAULTS.investment, DEFAULTS.cap, true));
const HOLDERS = [
  { id: ANA.id, label: ANA.name, tag: "Founder" },
  { id: BEN.id, label: BEN.name, tag: "Founder" },
  { id: POOL_ID, label: "Option pool", tag: "Unissued" },
  { id: ANGEL.id, label: ANGEL.name, tag: "SAFE" },
  { id: SEED.id, label: SEED.name, tag: "Seed" },
];

export function CapTableVisual() {
  const id = React.useId();
  const [investment, setInvestment] = React.useState(DEFAULTS.investment);
  const [cap, setCap] = React.useState(DEFAULTS.cap);
  const [seed, setSeed] = React.useState(DEFAULTS.seed);
  const [open, setOpen] = React.useState(false);

  const state = React.useMemo(() => foldCapTable(ledger(investment, cap, seed)), [investment, cap, seed]);
  const rowOf = (holderId: string) => state.rows.find((r) => r.stakeholderId === holderId);
  const angel = rowOf(ANGEL.id);
  const pending = state.outstanding[0];
  const untouched = investment === DEFAULTS.investment && cap === DEFAULTS.cap && seed === DEFAULTS.seed;

  function reset() {
    setInvestment(DEFAULTS.investment);
    setCap(DEFAULTS.cap);
    setSeed(DEFAULTS.seed);
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid flex-1 gap-x-8 gap-y-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* The terms */}
        <div className="flex flex-col">
          <div className="flex min-h-6 items-center justify-between gap-3">
            <p className={styles.label}>Post-money SAFE</p>
            <button
              type="button"
              onClick={reset}
              disabled={untouched}
              className="-mr-1.5 inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default disabled:text-fg-subtle max-md:-my-2.5 max-md:h-11"
            >
              <RotateCcw className="size-3" aria-hidden />
              Reset
            </button>
          </div>

          <Slider
            id={`${id}-investment`}
            label="Investment"
            value={investment}
            onChange={setInvestment}
            min={25_000}
            max={250_000}
            step={25_000}
            ends={["$25k", "$250k"]}
          />
          <Slider
            id={`${id}-cap`}
            label="Valuation cap"
            value={cap}
            onChange={setCap}
            min={2_000_000}
            max={12_000_000}
            step={500_000}
            ends={["$2M", "$12M"]}
          />

          <div className="mt-auto pt-4">
            <div className="flex items-center gap-3 border-t border-border pt-4">
              <Switch id={`${id}-seed`} checked={seed} onCheckedChange={setSeed} />
              <label htmlFor={`${id}-seed`} className="min-w-0 cursor-pointer">
                <span className="block text-sm font-medium text-fg">Then a priced seed</span>
                <span className="tnum block text-xs text-fg-muted">$1M at $8M pre-money</span>
              </label>
            </div>
          </div>
        </div>

        {/* What the engine returns */}
        <div className="flex min-w-0 flex-col">
          <div className="flex min-h-6 items-center justify-between gap-3">
            <p className={styles.label}>{seed ? "Ownership after the seed" : "Ownership today"}</p>
            <p className="tnum text-xs text-fg-muted">{shares(state.totalFullyDiluted)} shares</p>
          </div>

          <div
            role="img"
            aria-label={`Fully diluted ownership: ${state.rows.map((r) => `${r.name} ${pct(r.pct)}`).join(", ")}`}
            className="mt-2.5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-bg-subtle"
          >
            {HOLDERS.map((h) => {
              const row = rowOf(h.id);
              return (
                <span
                  key={h.id}
                  className={cn(styles.grow, "h-full rounded-[2px]")}
                  style={{
                    flexGrow: row?.pct ?? 0,
                    flexBasis: 0,
                    minWidth: row ? 3 : 0,
                    // A holder with no shares takes no width and no gap.
                    marginLeft: row ? undefined : "-0.125rem",
                    background: colorOf(h.id),
                  }}
                />
              );
            })}
          </div>

          <ul className="mt-3 border-b border-border">
            {HOLDERS.map((h) => {
              const row = rowOf(h.id);
              return (
                <li key={h.id} className="flex h-[1.6875rem] items-center gap-2 border-t border-border text-sm">
                  <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: colorOf(h.id) }} />
                  <span className="truncate text-fg">{h.label}</span>
                  <span className="hidden shrink-0 text-2xs text-fg-subtle xl:inline">{h.tag}</span>
                  <span className="tnum ml-auto shrink-0 text-xs text-fg-muted">
                    {row ? shares(row.shares) : h.id === ANGEL.id ? "Not converted" : "No round yet"}
                  </span>
                  <span className="tnum w-[3.25rem] shrink-0 text-right font-medium text-fg">
                    {row ? pct(row.pct) : <span className="text-fg-subtle">–</span>}
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="tnum mt-3 min-h-10 text-sm leading-relaxed text-fg-muted" role="status" aria-live="polite">
            {angel ? (
              <>
                {usd(investment)} on a {usd(cap)} cap converts to{" "}
                <span className="font-medium text-fg">{pct(angel.pct)}</span> of the company when the seed closes.
              </>
            ) : pending ? (
              <>
                {dollars(pending.principal)} on a {dollars(pending.valuationCap ?? 0)} cap is promised, not owned. A
                SAFE holds no shares until a priced round converts it.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {/* The engine's own derivation steps, verbatim */}
      <div className="rounded-lg border border-border bg-panel shadow-xs">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-work`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-left text-sm outline-none transition-colors hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/60 max-md:min-h-11"
        >
          <Calculator className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          <span className="shrink-0 font-medium text-fg">Show the work</span>
          <span className="tnum truncate text-xs text-fg-muted">
            {state.derivations.length > 0 ? (
              <>
                {state.derivations.length} steps<span className="max-sm:hidden">, straight from the engine</span>
              </>
            ) : (
              "Nothing to convert yet"
            )}
          </span>
          <ChevronRight
            className={cn("ml-auto size-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")}
            aria-hidden
          />
        </button>
        <div id={`${id}-work`} hidden={!open} className="border-t border-border px-3 py-3 md:min-h-[9.875rem]">
          {state.derivations.length > 0 ? (
            <ol className="grid gap-2.5">
              {state.derivations.map((d, i) => (
                <li key={d.label} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className="tnum mt-px inline-flex size-[1.125rem] shrink-0 items-center justify-center rounded-full bg-bg-subtle text-2xs font-medium text-fg-muted"
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-fg">{d.label}</p>
                    <p className="tnum mt-0.5 break-words font-mono text-xs leading-relaxed text-fg-muted">{d.math}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm leading-relaxed text-fg-muted">
              No arithmetic yet. Until a priced round sets a share price there is nothing to convert, so the SAFE
              sits off the table. Switch the seed back on to see each step.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Slider({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  ends,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  ends: [string, string];
}) {
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm text-fg-muted">
          {label}
        </label>
        <span className="tnum text-sm font-semibold text-fg">{usd(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={usd(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-accent mt-1.5 block h-5 w-full cursor-pointer max-md:-my-1.5 max-md:h-11"
      />
      <div aria-hidden className="tnum flex justify-between text-2xs text-fg-subtle">
        <span>{ends[0]}</span>
        <span>{ends[1]}</span>
      </div>
    </div>
  );
}
