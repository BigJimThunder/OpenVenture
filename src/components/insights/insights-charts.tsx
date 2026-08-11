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

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-8 scroll-mt-16">
      <h2 className="mb-3 text-md font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function InsightsCharts({ funnel, sourcing, money: moneyMix, composition, portfolio }: Props) {
  return (
    <div>
      {/* Anchor nav */}
      <nav className="mb-6 flex flex-wrap gap-1.5">
        {[
          ["funnel", "Funnel"],
          ["sourcing", "Sourcing"],
          ["money", "Money"],
          ["composition", "Composition"],
          ["portfolio", "Portfolio"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-border bg-panel px-3 py-1 text-xs text-fg-muted transition-colors hover:border-accent hover:text-accent"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section id="funnel" title="Funnel">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="Stage conversion"
            description="Applications that ever reached each stage"
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
          <div className="flex flex-col gap-3">
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
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="Applications by department"
            description="Are we only pulling from CS?"
            empty={sourcing.byDepartment.length === 0 && "No data yet."}
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
          <div className="flex flex-col gap-3">
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
            <div className="rounded-lg border border-border bg-panel p-4">
              <div className="mb-2 text-sm font-semibold">Member sourcing attribution</div>
              <div className="flex flex-col gap-1">
                {sourcing.byMember.slice(0, 6).map((m) => (
                  <div key={m.memberId} className="flex items-center justify-between text-sm">
                    <span className="text-fg-muted">{m.memberName}</span>
                    <span className="tnum text-xs">
                      {m.sourced} sourced · {m.funded} funded
                      {m.sourced > 0 ? ` (${Math.round((m.funded / m.sourced) * 100)}%)` : ""}
                    </span>
                  </div>
                ))}
                {sourcing.byMember.length === 0 && (
                  <p className="text-xs text-fg-subtle">No member-sourced applications yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section id="money" title="Money">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="Sector mix: applicants vs funded"
            description="The gap is the club's revealed preference vs. its stated thesis"
            empty={moneyMix.sectors.length === 0 && "No data yet."}
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
            description="Committed + deployed grants, $500 bins"
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
        <div className="grid gap-3 lg:grid-cols-2">
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
          <div className="rounded-lg border border-border bg-panel p-4">
            <div className="mb-1 text-sm font-semibold">Founder demographics</div>
            <p className="mb-3 text-2xs text-fg-subtle">
              Self-reported and optional ({composition.respondents} respondents). Aggregate-only:
              groups smaller than 5 are never shown, and cross-tabs are disabled by design.
            </p>
            <div className="flex flex-col gap-3">
              {(
                [
                  ["Gender", composition.gender],
                  ["Race / ethnicity", composition.raceEthnicity],
                  ["First generation", composition.firstGeneration],
                  ["International", composition.international],
                ] as const
              ).map(([label, buckets]) => (
                <div key={label}>
                  <div className="mb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                    {label}
                  </div>
                  {buckets.length === 0 ? (
                    <p className="text-xs text-fg-subtle">All groups too small to show.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {buckets.map((b) => (
                        <span
                          key={b.label}
                          className="tnum rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-xs capitalize text-fg-muted"
                        >
                          {b.label} · {b.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section id="portfolio" title="Portfolio construction">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="Outcome distribution"
            description="The power-law lesson: most grants go nowhere, a few carry the portfolio"
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
            description="Where the money ended up"
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
