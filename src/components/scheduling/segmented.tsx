"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** A small either/or control: one of a few options, always exactly one chosen. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: React.ReactNode }[];
  /** Read to screen readers; the visible label, if any, is the caller's. */
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("grid gap-1 rounded-lg bg-bg-subtle p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 cursor-pointer truncate rounded-md px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8",
            value === o.value ? "bg-panel text-fg shadow-xs" : "text-fg-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A pill that is on or off: a weekday, a person. 40px under a thumb. */
export function ToggleChip({
  pressed,
  onPressedChange,
  children,
  disabled,
  className,
  ...props
}: Omit<React.ComponentProps<"button">, "onClick" | "type"> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:px-3 sm:text-xs",
        pressed
          ? "border-accent/50 bg-accent-subtle font-medium text-accent"
          : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
