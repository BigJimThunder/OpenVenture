"use client";

import * as React from "react";
import { ResponsiveContainer } from "recharts";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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

export function ChartFrame({
  title,
  description,
  height = 260,
  empty,
  children,
  className,
}: {
  title?: string;
  description?: string;
  height?: number;
  /** When set, renders the empty message instead of the chart. */
  empty?: string | false;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle>{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <div className="px-2 pb-3 pt-1" style={{ height }}>
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
    </Card>
  );
}
