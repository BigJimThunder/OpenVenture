"use client";

import * as React from "react";
import { ChevronRightIcon, CalculatorIcon } from "lucide-react";
import type { DerivationStep } from "@/lib/captable/types";
import { cn } from "@/lib/utils";

/**
 * The teaching feature: every derived number expands to the arithmetic
 * that produced it. This is what separates a teaching tool from a
 * calculator. The steps come verbatim from the engine.
 */
export function ShowYourWork({
  derivations,
  defaultOpen = false,
  title = "Show your work",
}: {
  derivations: DerivationStep[];
  defaultOpen?: boolean;
  title?: string;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (derivations.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-panel shadow-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-left outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <CalculatorIcon className="size-4 shrink-0 text-fg-subtle" />
        <span className="text-sm font-semibold">{title}</span>
        <span className="tnum text-xs text-fg-subtle">
          {derivations.length} {derivations.length === 1 ? "step" : "steps"}
        </span>
        <ChevronRightIcon
          className={cn("ml-auto size-4 text-fg-subtle transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <ol className="border-t border-border">
          {derivations.map((d, i) => (
            <li key={i} className="flex gap-3 border-b border-border px-3.5 py-2.5 last:border-0">
              <span className="tnum mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-bg-subtle text-2xs font-medium text-fg-muted">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{d.label}</div>
                <div className="tnum mt-0.5 font-mono text-xs break-words text-fg-muted">{d.math}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
