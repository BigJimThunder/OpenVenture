"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import { format } from "date-fns";
import {
  ChartFrame,
  ChartTooltip,
  axisProps,
  gridProps,
  CHART_PALETTE,
} from "@/components/patterns/chart";
import { USE_OF_FUNDS_LABELS } from "./new-grant-dialog";
import { formatCompact } from "@/lib/utils";
import type { UseOfFunds } from "@/db/schema";

const money = (v: number | string) => `$${Number(v).toLocaleString("en-US")}`;

export function BudgetCharts({
  total,
  series,
  breakdown,
  fyStart,
  fyEnd,
}: {
  total: number;
  series: { issuedAt: string; amount: number }[];
  breakdown: { useOfFunds: UseOfFunds; total: number; count: number }[];
  fyStart: string;
  fyEnd: string;
}) {
  // Captured once per mount — "today" doesn't need to tick live.
  const [nowT] = React.useState(() => Date.now());

  // Cumulative deployment by month, with a straight-line pacing reference.
  const burnDown = React.useMemo(() => {
    const start = new Date(fyStart).getTime();
    const end = new Date(fyEnd).getTime();
    const months: { t: number; label: string; deployed: number | null; pace: number }[] = [];
    let cursor = new Date(fyStart);
    let cumulative = 0;
    const sorted = [...series].sort(
      (a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
    );
    let idx = 0;
    while (cursor.getTime() <= end) {
      const t = cursor.getTime();
      while (idx < sorted.length && new Date(sorted[idx].issuedAt).getTime() <= t) {
        cumulative += sorted[idx].amount;
        idx++;
      }
      months.push({
        t,
        label: format(cursor, "MMM"),
        deployed: t <= nowT ? cumulative : null, // no line into the future
        pace: Math.round(((t - start) / (end - start)) * total),
      });
      cursor = new Date(cursor);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return months;
  }, [series, fyStart, fyEnd, total, nowT]);

  const catData = breakdown
    .map((b) => ({ ...b, label: USE_OF_FUNDS_LABELS[b.useOfFunds] }))
    .sort((a, b) => b.total - a.total);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartFrame
        title="Deployment burn-down"
        description="Cumulative dollars out the door vs. straight-line pacing to fiscal year end"
        empty={series.length === 0 && "No grants issued from this pool yet."}
      >
        <AreaChart data={burnDown} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v: number) => `$${formatCompact(v)}`} width={52} />
          <Tooltip content={<ChartTooltip formatter={money} />} />
          <Area
            type="monotone"
            dataKey="pace"
            name="Pacing"
            stroke="var(--fg-subtle)"
            strokeDasharray="4 4"
            fill="none"
            strokeWidth={1.5}
            dot={false}
          />
          <Area
            type="stepAfter"
            dataKey="deployed"
            name="Deployed"
            stroke="var(--accent)"
            fill="var(--accent)"
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <ReferenceLine
            y={total}
            stroke="var(--border-strong)"
            strokeDasharray="2 2"
            label={{
              value: `Pool ${money(total)}`,
              position: "insideTopRight",
              fill: "var(--fg-subtle)",
              fontSize: 10,
            }}
          />
        </AreaChart>
      </ChartFrame>

      <ChartFrame
        title="Where the money goes"
        description="Committed + deployed dollars by use of funds"
        empty={catData.length === 0 && "No approved grants yet."}
      >
        <BarChart
          data={catData}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid {...gridProps} horizontal={false} vertical />
          <XAxis
            type="number"
            {...axisProps}
            tickFormatter={(v: number) => `$${formatCompact(v)}`}
          />
          <YAxis
            type="category"
            dataKey="label"
            {...axisProps}
            width={92}
            tick={{ fill: "var(--fg-muted)", fontSize: 11 }}
          />
          <Tooltip content={<ChartTooltip formatter={money} />} cursor={{ fill: "var(--bg-subtle)" }} />
          <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]} barSize={16}>
            {catData.map((_, i) => (
              <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
    </div>
  );
}
