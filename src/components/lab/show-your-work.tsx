"use client";

import * as React from "react";
import { ChevronDownIcon, CalculatorIcon } from "lucide-react";
import type { DerivationStep } from "@/lib/captable/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The teaching feature: every derived number expands to the arithmetic
 * that produced it. This is what separates a teaching tool from a
 * calculator.
 */
export function ShowYourWork({ derivations }: { derivations: DerivationStep[] }) {
  const [open, setOpen] = React.useState(true);
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none flex-row items-center justify-between"
        onClick={() => setOpen((o) => !o)}
      >
        <CardTitle className="flex items-center gap-2">
          <CalculatorIcon className="size-4 text-fg-subtle" />
          Show your work
        </CardTitle>
        <ChevronDownIcon
          className={cn("size-4 text-fg-subtle transition-transform", open && "rotate-180")}
        />
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-2">
          {derivations.map((d, i) => (
            <div key={i} className="rounded-md border border-border bg-bg-subtle/50 p-2.5">
              <div className="text-xs font-medium">{d.label}</div>
              <div className="tnum mt-0.5 font-mono text-xs text-fg-muted">{d.math}</div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
