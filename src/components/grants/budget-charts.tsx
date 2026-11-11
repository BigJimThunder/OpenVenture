"use client";

import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "@/components/patterns/chart";
import { Panel } from "@/components/patterns/data-panel";
import { BarList } from "@/components/patterns/data-bar-list";
import { USE_OF_FUNDS_LABELS } from "./use-of-funds";
import { formatCompact, formatMoney } from "@/lib/utils";
import type { UseOfFunds } from "@/db/schema";

const money = (v: number | string) => formatMoney(Number(v));

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
  const { months, todayLabel } = React.useMemo(() => {
    const start = new Date(fyStart).getTime();
    const end = new Date(fyEnd).getTime();
    const rows: { t: number; label: string; deployed: number | null; pace: number }[] = [];
    let cursor = new Date(fyStart);
    let cumulative = 0;
    const sorted = [...series].sort(
      (a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime()
    );
    let idx = 0;
    let today: string | null = null;
    while (cursor.getTime() <= end) {
      const t = cursor.getTime();
      while (idx < sorted.length && new Date(sorted[idx].issuedAt).getTime() <= t) {
        cumulative += sorted[idx].amount;
        idx++;
      }
      const label = format(cursor, "MMM");
      if (t <= nowT) today = label;
      rows.push({
        t,
        label,
        deployed: t <= nowT ? cumulative : null, // no line into the future
        pace: Math.round(((t - start) / (end - start)) * total),
      });
      cursor = new Date(cursor);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { months: rows, todayLabel: nowT < end ? today : null };
  }, [series, fyStart, fyEnd, total, nowT]);

  const categories = breakdown
    .map((b) => ({
      key: b.useOfFunds,
      label: USE_OF_FUNDS_LABELS[b.useOfFunds],
      value: b.total,
      display: formatMoney(b.total),
      note: `${b.count} ${b.count === 1 ? "grant" : "grants"}`,
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
      <ChartFrame
        title="Deployment against pace"
        description="are we on track to use the pool?"
        empty={series.length === 0 && "Nothing has been paid out of this pool yet."}
        legend={[
          { label: "Paid out, cumulative", color: "var(--cat-1)" },
          { label: "Even pace to year end", color: "var(--fg-subtle)" },
        ]}
      >
        <AreaChart data={months} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={12} />
          <YAxis
            {...axisProps}
            axisLine={false}
            tickFormatter={(v: number) => `$${formatCompact(v)}`}
            width={44}
            domain={[0, total]}
          />
          <Tooltip
            content={<ChartTooltip formatter={money} />}
            cursor={{ stroke: "var(--border-strong)" }}
          />
          <ReferenceLine
            y={total}
            stroke="var(--border-strong)"
            label={{
              value: `Pool ${money(total)}`,
              position: "insideBottomRight",
              fill: "var(--fg-muted)",
              fontSize: 11,
            }}
          />
          {todayLabel && (
            <ReferenceLine
              x={todayLabel}
              stroke="var(--border-strong)"
              strokeDasharray="2 3"
              label={{ value: "Today", position: "insideTopLeft", fill: "var(--fg-muted)", fontSize: 11 }}
            />
          )}
          <Area
            type="linear"
            dataKey="pace"
            name="Even pace"
            stroke="var(--fg-subtle)"
            strokeDasharray="4 4"
            fill="none"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
          <Area
            type="stepAfter"
            dataKey="deployed"
            name="Paid out"
            stroke="var(--cat-1)"
            fill="var(--cat-1)"
            fillOpacity={0.1}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartFrame>

      <Panel title="Where the money goes" note="approved or paid, by use of funds">
        {categories.length === 0 ? (
          <p className="px-3.5 py-10 text-center text-xs text-fg-muted">
            Nothing approved yet. Each grant is tagged with what it pays for, and the split shows up
            here.
          </p>
        ) : (
          <BarList items={categories} />
        )}
      </Panel>
    </div>
  );
}
