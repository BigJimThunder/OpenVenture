"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

/**
 * The one chart wrapper the design system calls for. Every chart in the app
 * renders inside ChartFrame and uses these themed prop sets, so axes, grid,
 * tooltips, and palette are consistent — and dark mode is free because
 * everything resolves through CSS tokens.
 */

export const CHART_PALETTE = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
  "var(--cat-9)",
  "var(--cat-10)",
];

export const axisProps = {
  stroke: "var(--border-strong)",
  tick: { fill: "var(--fg-subtle)", fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: "var(--border)" },
} as const;

export const gridProps = {
  stroke: "var(--border)",
  strokeDasharray: "3 3",
  vertical: false,
} as const;

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  formatter?: (value: number | string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-panel-raised px-2.5 py-1.5 text-xs shadow-md">
      {label && <div className="mb-1 font-medium text-fg">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5 text-fg-muted">
          {p.color && (
            <span className="size-2 rounded-full" style={{ background: p.color }} />
          )}
          <span>{p.name}:</span>
          <span className="tnum font-medium text-fg">
            {formatter && p.value != null ? formatter(p.value) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Hairline panel: title on the left, the chart's question on the right. The
 * caption is deliberately a question ("are we only pulling from CS?") — these
 * charts exist to teach members what to ask, not just to report.
 */
export function ChartFrame({
  title,
  description,
  height = 260,
  empty,
  legend,
  children,
  className,
}: {
  title?: string;
  description?: string;
  height?: number;
  /** When set, renders the empty message instead of the chart. */
  empty?: string | false;
  /** Required for two or more series — identity is never colour alone. */
  legend?: { label: string; color: string }[];
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-md border border-border bg-panel",
        className
      )}
    >
      {(title || description) && (
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2.5">
          {title && <span className="text-xs font-semibold">{title}</span>}
          {description && (
            <span className="shrink-0 text-2xs text-fg-subtle">{description}</span>
          )}
        </div>
      )}
      {/* Grows to fill the grid row so panels never end in dead space; `height`
          is the floor, not a fixed size. */}
      <div className="flex-1 px-1 pt-2" style={{ minHeight: height }}>
        {empty ? (
          <div className="flex h-full items-center justify-center text-xs text-fg-muted">
            {empty}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
      {legend && !empty && (
        <div className="flex flex-wrap gap-3 px-3 pt-1 pb-2.5 text-2xs text-fg-muted">
          {legend.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-[2px]" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
