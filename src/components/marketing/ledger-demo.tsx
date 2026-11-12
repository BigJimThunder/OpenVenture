"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

const POOL = 10_000;
const STEP = 100;

/** A fictional year so far. Whole dollars: this is a demonstration, not a ledger. */
const GRANTS = [
  { ref: "GRN-1", company: "MintBudget", status: "Reconciled", amount: 1150 },
  { ref: "GRN-2", company: "GreenPlate", status: "Cashed", amount: 1650 },
  { ref: "GRN-3", company: "LabMate", status: "Issued", amount: 2350 },
  { ref: "GRN-4", company: "AquaSense", status: "Approved", amount: 2650 },
] as const;
const COMMITTED = GRANTS.reduce((n, g) => n + g.amount, 0);

const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

/**
 * Exhibit B: the overdraw guard. The visitor is the treasurer, with one
 * proposed grant that is $200 more than the pool has left. Approving it is
 * refused in the app's own words; bring it down and it goes through.
 */
export function LedgerDemo() {
  const [amount, setAmount] = React.useState(2400);
  const [state, setState] = React.useState<"proposed" | "refused" | "approved">("proposed");

  const remaining = POOL - COMMITTED;
  const after = remaining - amount;
  const approved = state === "approved";
  const used = COMMITTED + (approved ? amount : 0);

  function change(delta: number) {
    setAmount((a) => Math.min(4000, Math.max(200, a + delta)));
    setState("proposed");
  }

  return (
    <div>
      <dl className="grid grid-cols-3 border-b border-border">
        {[
          ["Pool", usd(POOL)],
          ["Committed", usd(used)],
          ["Remaining", usd(POOL - used)],
        ].map(([label, value], i) => (
          <div key={label} className={cn("py-3.5", i > 0 && "border-l border-border pl-4 sm:pl-5")}>
            <dt className={cn(styles.label, "text-fg-subtle")}>{label}</dt>
            <dd className="tnum mt-1 font-display text-2xl font-medium tracking-tight sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-bg-subtle"
        role="img"
        aria-label={`${usd(used)} of ${usd(POOL)} committed`}
      >
        <div className={cn(styles.fill, "h-full rounded-full bg-fg")} style={{ width: `${(used / POOL) * 100}%` }} />
      </div>

      <table className="mt-5 w-full text-sm">
        <thead>
          <tr className={cn(styles.label, "text-left text-fg-subtle")}>
            <th scope="col" className="hidden pb-2 font-normal sm:table-cell">Ref</th>
            <th scope="col" className="pb-2 font-normal">Company</th>
            <th scope="col" className="pb-2 font-normal">Status</th>
            <th scope="col" className="pb-2 text-right font-normal">Amount</th>
          </tr>
        </thead>
        <tbody className="border-t border-border">
          {GRANTS.map((g) => (
            <tr key={g.ref} className="border-b border-border">
              <td className="hidden py-2.5 font-mono text-xs text-fg-subtle sm:table-cell">{g.ref}</td>
              <td className="py-2.5 font-medium">{g.company}</td>
              <td className="py-2.5 text-fg-muted">{g.status}</td>
              <td className="tnum py-2.5 text-right">{usd(g.amount)}</td>
            </tr>
          ))}
          <tr className={cn(approved ? "border-b border-border" : "bg-accent-subtle/60")}>
            <td className="hidden py-3 pl-2 font-mono text-xs text-fg-subtle sm:table-cell">GRN-5</td>
            <td className="py-3 pl-2 font-medium sm:pl-0">Lecture Loop</td>
            <td className="py-3">
              {approved ? (
                <span className={cn(styles.stamp, styles.thunk, "text-success")}>Approved</span>
              ) : (
                <span className="text-fg-muted">Proposed</span>
              )}
            </td>
            <td className="py-3 pr-2 text-right sm:pr-0">
              {approved ? (
                <span className="tnum">{usd(amount)}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => change(-STEP)}
                    aria-label="Lower the grant by $100"
                    className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-panel text-base leading-none outline-none hover:border-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    −
                  </button>
                  <span className="tnum w-16 text-center font-medium" aria-live="polite">{usd(amount)}</span>
                  <button
                    type="button"
                    onClick={() => change(STEP)}
                    aria-label="Raise the grant by $100"
                    className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-panel text-base leading-none outline-none hover:border-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    +
                  </button>
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {approved ? (
          <button
            type="button"
            onClick={() => {
              setAmount(2400);
              setState("proposed");
            }}
            className="inline-flex h-11 cursor-pointer items-center rounded-md border border-border-strong bg-panel px-5 text-sm font-medium outline-none transition-colors hover:border-fg focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            Start over
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setState(after < 0 ? "refused" : "approved")}
            className="inline-flex h-11 cursor-pointer items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-panel"
          >
            Approve {usd(amount)}
          </button>
        )}
        <p role="status" aria-live="polite" className="min-w-0 flex-1 basis-64 text-sm leading-relaxed">
          {state === "refused" && (
            <span className="text-danger">
              Approving would overdraw the pool by {usd(-after, true)} — only {usd(remaining, true)} remains
            </span>
          )}
          {state === "proposed" && (
            <span className="text-fg-muted">
              You&apos;re the treasurer. The vote came back in favor. Approve it.
            </span>
          )}
          {approved && (
            <span className="text-fg-muted">
              Approved. Remaining is now {usd(POOL - used)}, and nobody typed that number.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
