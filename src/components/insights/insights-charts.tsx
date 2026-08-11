"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from "recharts";
import {
  ChartFrame,
  ChartTooltip,
  axisProps,
  gridProps,
  CHART_PALETTE,
} from "@/components/patterns/chart";
import { TIER_META } from "@/components/grants/outcomes-table";
import type { OutcomeTier, DeclineReason } from "@/db/schema";
import { formatCompact } from "@/lib/utils";

const money = (v: number | string) => `$${Number(v).toLocaleString("en-US")}`;

const DECLINE_LABELS: Record<DeclineReason, string> = {
  too_early: "Too early",
  not_a_fit: "Not a fit",
  budget_exhausted: "Budget exhausted",
  team: "Team concerns",
  unresponsive: "Unresponsive",
  duplicate: "Duplicate",
  outside_criteria: "Outside criteria",
  other: "Other",
};

type Props = {
  funnel: {
    stages: { name: string; kind: string; colorToken: string; reached: number; medianDaysInPrev: number | null }[];
    monthly: { month: string; count: number }[];
    declines: { reason: DeclineReason | null; count: number }[];
  };
  sourcing: {
    byDepartment: { label: string; count: number; funded: number }[];
    byCampusSource: { label: string; count: number }[];
    byMember: { memberId: string; memberName: string; sourced: number; funded: number }[];
  };
  money: {
    sectors: { sectorName: string; colorToken: string; applicants: number; funded: number }[];
    checkHistogram: { label: string; count: number }[];
  };
  composition: {
    teamComposition: { label: string; count: number }[];
    studentMix: { label: string; count: number }[];
    respondents: number;
    gender: { label: string; count: number }[];
    raceEthnicity: { label: string; count: number }[];
    firstGeneration: { label: string; count: number }[];
    international: { label: string; count: number }[];
  };
  portfolio: {
    distribution: { tier: OutcomeTier; count: number; dollars: number }[];
    totalCompanies: number;
    hitRate: number | null;
    recentCheckIns: { companyName: string; tier: string; recordedAt: Date }[];
  };
};

/** Same hairline panel as ChartFrame, for the two blocks that aren't plots. */
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-panel">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-3 py-2.5">
        <span className="text-xs font-semibold">{title}</span>
        {note && <span className="shrink-0 text-2xs text-fg-subtle">{note}</span>}
      </div>
      {children}
    </div>
  );
}

function Section({ id, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-6 scroll-mt-12">
      {children}
    </section>
  );
}

export function InsightsCharts({ funnel, sourcing, money: moneyMix, composition, portfolio }: Props) {
  return (
    <div>
      <Section id="funnel" title="Funnel">
        <div className="grid gap-2 lg:grid-cols-2">
          <ChartFrame
            title="Stage conversion"
            description="ever reached each stage"
            empty={funnel.stages.length === 0 && "No data yet."}
          >
            <BarChart data={funnel.stages} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axisProps} width={100} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="reached" name="Reached" radius={[0, 4, 4, 0]} barSize={18}>
                {funnel.stages.map((s, i) => (
                  <Cell key={i} fill={`var(--${s.colorToken})`} />
                ))}
                <LabelList dataKey="reached" position="right" style={{ fill: "var(--fg-muted)", fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ChartFrame>
          <div className="flex flex-col gap-2">
            <ChartFrame
              title="Applications per month"
              height={150}
              empty={funnel.monthly.length === 0 && "No data yet."}
            >
              <AreaChart data={funnel.monthly} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="month" {...axisProps} tickFormatter={(m: string) => m.slice(5)} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="count" name="Applications" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ChartFrame>
            <ChartFrame
              title="Why we say no"
              height={150}
              empty={funnel.declines.length === 0 && "No declines recorded yet."}
            >
              <BarChart
                data={funnel.declines.map((d) => ({
                  label: d.reason ? DECLINE_LABELS[d.reason] : "Unknown",
                  count: d.count,
                }))}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <XAxis type="number" {...axisProps} allowDecimals={false} hide />
                <YAxis type="category" dataKey="label" {...axisProps} width={110} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
                <Bar dataKey="count" name="Declines" fill="var(--cat-7)" radius={[0, 3, 3, 0]} barSize={12} />
              </BarChart>
            </ChartFrame>
          </div>
        </div>
      </Section>

      <Section id="sourcing" title="Sourcing">
        <div className="grid gap-2 lg:grid-cols-2">
          <ChartFrame
            title="Applications by department"
            description="are we only pulling from CS?"
            empty={sourcing.byDepartment.length === 0 && "No data yet."}
            legend={[
              { label: "Applied", color: "var(--cat-2)" },
              { label: "Funded", color: "var(--cat-4)" },
            ]}
          >
            <BarChart
              data={sourcing.byDepartment.slice(0, 8)}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
            >
              <CartesianGrid {...gridProps} horizontal={false} vertical />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="label" {...axisProps} width={130} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="count" name="Applied" fill="var(--cat-2)" radius={[0, 3, 3, 0]} barSize={12} />
              <Bar dataKey="funded" name="Funded" fill="var(--cat-4)" radius={[0, 3, 3, 0]} barSize={12} />
            </BarChart>
          </ChartFrame>
          <div className="flex flex-col gap-2">
            <ChartFrame
              title="Campus source"
              height={170}
              empty={sourcing.byCampusSource.length === 0 && "No data yet."}
            >
              <BarChart
                data={sourcing.byCampusSource.slice(0, 6)}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <XAxis type="number" {...axisProps} allowDecimals={false} hide />
                <YAxis type="category" dataKey="label" {...axisProps} width={150} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
                <Bar dataKey="count" name="Applications" radius={[0, 3, 3, 0]} barSize={12}>
                  {sourcing.byCampusSource.slice(0, 6).map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartFrame>
            <Panel title="Member sourcing attribution" note="sourced · funded · conversion">
              {sourcing.byMember.length === 0 ? (
                <p className="px-3 py-3 text-xs text-fg-subtle">
                  No member-sourced applications yet.
                </p>
              ) : (
                sourcing.byMember.slice(0, 6).map((m) => (
                  <div
                    key={m.memberId}
                    className="grid grid-cols-[1fr_60px_60px_60px] items-center gap-2 border-b border-border px-3 py-[7px] text-sm last:border-0"
                  >
                    <span className="truncate">{m.memberName}</span>
                    <span className="tnum text-right text-xs text-fg-muted">{m.sourced}</span>
                    <span className="tnum text-right text-xs text-fg-muted">{m.funded}</span>
                    <span
                      className={
                        m.sourced > 0
                          ? "tnum text-right text-xs text-success"
                          : "tnum text-right text-xs text-fg-subtle"
                      }
                    >
                      {m.sourced > 0 ? `${Math.round((m.funded / m.sourced) * 100)}%` : "—"}
                    </span>
                  </div>
                ))
              )}
            </Panel>
          </div>
        </div>
      </Section>

      <Section id="money" title="Money">
        <div className="grid gap-2 lg:grid-cols-2">
          <ChartFrame
            title="Sector mix: applicants vs funded"
            description="revealed preference vs stated thesis"
            empty={moneyMix.sectors.length === 0 && "No data yet."}
            legend={[
              { label: "Applicants", color: "var(--cat-10)" },
              { label: "Funded", color: "var(--cat-4)" },
            ]}
          >
            <BarChart data={moneyMix.sectors} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="sectorName" {...axisProps} interval={0} angle={-28} textAnchor="end" height={54} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="applicants" name="Applicants" fill="var(--cat-10)" radius={[3, 3, 0, 0]} barSize={12} />
              <Bar dataKey="funded" name="Funded" fill="var(--cat-4)" radius={[3, 3, 0, 0]} barSize={12} />
            </BarChart>
          </ChartFrame>
          <ChartFrame
            title="Check-size distribution"
            description="committed + deployed, $500 bins"
            empty={moneyMix.checkHistogram.length === 0 && "No grants yet."}
          >
            <BarChart data={moneyMix.checkHistogram} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="count" name="Grants" fill="var(--cat-3)" radius={[3, 3, 0, 0]} barSize={22} />
            </BarChart>
          </ChartFrame>
        </div>
      </Section>

      <Section id="composition" title="Applicant composition">
        <div className="grid gap-2 lg:grid-cols-2">
          <ChartFrame title="Team shape" height={170} empty={composition.teamComposition.length === 0 && "No data yet."}>
            <BarChart
              data={[...composition.teamComposition, ...composition.studentMix]}
              layout="vertical"
              margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
            >
              <XAxis type="number" {...axisProps} allowDecimals={false} hide />
              <YAxis type="category" dataKey="label" {...axisProps} width={130} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="count" name="Applications" fill="var(--cat-9)" radius={[0, 3, 3, 0]} barSize={12} />
            </BarChart>
          </ChartFrame>
          <Panel
            title="Founder demographics"
            note={`${composition.respondents} respondents · k-anonymity ≥ 5`}
          >
            <div className="flex flex-col gap-2.5 p-3">
              {(
                [
                  ["Gender", composition.gender],
                  ["Race / ethnicity", composition.raceEthnicity],
                  ["First generation", composition.firstGeneration],
                  ["International", composition.international],
                ] as const
              ).map(([label, buckets]) => (
                <div
                  key={label}
                  className="grid grid-cols-[110px_1fr] items-baseline gap-2"
                >
                  <span className="text-[10.5px] font-medium tracking-[0.06em] uppercase text-fg-subtle">
                    {label}
                  </span>
                  {buckets.length === 0 ? (
                    <p className="text-xs text-fg-subtle">All groups too small to show.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {buckets.map((b) => (
                        <span
                          key={b.label}
                          className="tnum rounded-full border border-border bg-bg-subtle px-2.5 py-px text-[11.5px] capitalize text-fg-muted"
                        >
                          {b.label} · {b.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className="text-[10.5px] text-fg-subtle">
                Aggregate-only: groups smaller than 5 are never shown; cross-tabs disabled by
                design.
              </p>
            </div>
          </Panel>
        </div>
      </Section>

      <Section id="portfolio" title="Portfolio construction">
        <div className="grid gap-2 lg:grid-cols-2">
          <ChartFrame
            title="Outcome distribution"
            description="the power-law lesson"
            empty={portfolio.totalCompanies === 0 && "No portfolio companies yet."}
          >
            <BarChart
              data={portfolio.distribution.map((d) => ({
                label: TIER_META[d.tier].label,
                count: d.count,
                colorToken: TIER_META[d.tier].colorToken,
              }))}
              margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
            >
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval={0} angle={-28} textAnchor="end" height={64} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="count" name="Companies" radius={[3, 3, 0, 0]} barSize={26}>
                {portfolio.distribution.map((d, i) => (
                  <Cell key={i} fill={`var(--${TIER_META[d.tier].colorToken})`} />
                ))}
              </Bar>
            </BarChart>
          </ChartFrame>
          <ChartFrame
            title="Dollars by outcome"
            description="where the money ended up"
            empty={portfolio.distribution.every((d) => d.dollars === 0) && "No issued grants yet."}
          >
            <BarChart
              data={portfolio.distribution
                .filter((d) => d.dollars > 0)
                .map((d) => ({
                  label: TIER_META[d.tier].label,
                  dollars: d.dollars,
                  colorToken: TIER_META[d.tier].colorToken,
                }))}
              layout="vertical"
              margin={{ top: 4, right: 24, left: 8, bottom: 0 }}
            >
              <XAxis type="number" {...axisProps} tickFormatter={(v: number) => `$${formatCompact(v)}`} />
              <YAxis type="category" dataKey="label" {...axisProps} width={110} tick={{ fill: "var(--fg-muted)", fontSize: 11 }} />
              <Tooltip content={<ChartTooltip formatter={money} />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar dataKey="dollars" name="Granted" radius={[0, 3, 3, 0]} barSize={16}>
                {portfolio.distribution
                  .filter((d) => d.dollars > 0)
                  .map((d, i) => (
                    <Cell key={i} fill={`var(--${TIER_META[d.tier].colorToken})`} />
                  ))}
              </Bar>
            </BarChart>
          </ChartFrame>
        </div>
      </Section>
    </div>
  );
}
