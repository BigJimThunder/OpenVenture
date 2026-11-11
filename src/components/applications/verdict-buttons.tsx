"use client";

import { MinusIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import type { CoffeeChatVerdict } from "@/db/schema";
import { cn } from "@/lib/utils";

const OPTIONS: {
  value: CoffeeChatVerdict;
  label: string;
  icon: typeof ThumbsUpIcon;
  on: string;
}[] = [
  { value: "advance", label: "Advance", icon: ThumbsUpIcon, on: "border-success-border bg-success-bg text-success" },
  { value: "undecided", label: "Undecided", icon: MinusIcon, on: "border-border-strong bg-bg-subtle text-fg" },
  { value: "decline", label: "Decline", icon: ThumbsDownIcon, on: "border-danger-border bg-danger-bg text-danger" },
];

export const VERDICT_LABELS: Record<CoffeeChatVerdict, string> = {
  advance: "Advance",
  undecided: "Undecided",
  decline: "Decline",
};

/** A coffee-chat verdict as three thumb-sized buttons. */
export function VerdictButtons({
  value,
  onChange,
  disabled,
}: {
  value: CoffeeChatVerdict | null;
  onChange: (next: CoffeeChatVerdict) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Verdict">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60 sm:h-11 sm:flex-row sm:gap-1.5",
            value === o.value
              ? o.on
              : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg"
          )}
        >
          <o.icon className="size-4" />
          {o.label}
        </button>
      ))}
    </div>
  );
}
