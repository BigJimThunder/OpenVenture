import Link from "next/link";
import type { Route } from "next";
import { cn } from "@/lib/utils";

/**
 * The compact summary band under a header: 2-up on phones, one row from `md`.
 * Cells are separated by hairlines (the grid gap shows the border color), so
 * the strip never needs fixed widths and never clips at 390px.
 * Use for 2–4 headline numbers; anything richer is a chart.
 */
export function StatStrip({
  children,
  className,
  /** `flush` sits edge-to-edge under a ScreenHeader; `card` floats in a page. */
  variant = "flush",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "flush" | "card";
}) {
  return (
    <div
      className={cn(
        "grid shrink-0 grid-cols-2 gap-px bg-border md:auto-cols-fr md:grid-flow-col md:grid-cols-none",
        variant === "flush"
          ? "border-b border-border"
          : "overflow-hidden rounded-lg border border-border shadow-xs",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatStripItem({
  label,
  value,
  hint,
  tone = "default",
  href,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** One quiet line under the value — a qualifier, never a second metric. */
  hint?: React.ReactNode;
  /** Colors the value only when the number itself is the warning. */
  tone?: "default" | "success" | "warning" | "danger";
  href?: Route;
  /** Optional inline graphic (a meter, a sparkline) beside the value. */
  children?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="truncate text-xs text-fg-muted">{label}</div>
      <div className="mt-1 flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            "tnum truncate text-md leading-6 font-semibold tracking-tight",
            tone === "success" && "text-success",
            tone === "warning" && "text-warning",
            tone === "danger" && "text-danger"
          )}
        >
          {value}
        </span>
        {children}
      </div>
      {hint && <div className="tnum mt-0.5 truncate text-2xs text-fg-subtle">{hint}</div>}
    </>
  );
  const cls = cn("min-w-0 bg-bg px-4 py-3 md:px-5", className);
  if (href) {
    return (
      <Link href={href} className={cn(cls, "transition-colors hover:bg-bg-subtle")}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}

/** Thin progress meter for a StatStripItem — a part-of-whole, 0..1. */
export function StatMeter({ fraction, label }: { fraction: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span
        className="h-1 min-w-8 max-w-28 flex-1 overflow-hidden rounded-full bg-bg-subtle"
        role="img"
        aria-label={label}
      >
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}
