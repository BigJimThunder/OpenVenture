"use client";

import * as React from "react";
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { format } from "date-fns";
import { ShieldCheckIcon } from "lucide-react";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "@/components/patterns/chart";
import { Panel, microLabel } from "@/components/patterns/data-panel";
import { BarList } from "@/components/patterns/data-bar-list";
import { SegmentLegend } from "@/components/patterns/data-segment-bar";
import { TierLadder } from "@/components/grants/tier-ladder";
import { TIER_META } from "@/components/grants/tiers";
import type { OutcomeTier, DeclineReason } from "@/db/schema";
import { SUPPRESSED_LABEL as SUPPRESSED } from "@/lib/insights/k-anonymize";

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


type Bucket = { label: string; count: number };

type Props = {
  funnel: {
    stages: { name: string; kind: string; colorToken: string; reached: number; medianDaysInPrev: number | null }[];
    monthly: { month: string; count: number }[];
    declines: { reason: DeclineReason | null; count: number }[];
  };
  sourcing: {
    byDepartment: { label: string; count: number; funded: number }[];
    byCampusSource: Bucket[];
    byMember: { memberId: string; memberName: string; sourced: number; funded: number }[];
  };
  money: {
    sectors: { sectorName: string; colorToken: string; applicants: number; funded: number }[];
    checkHistogram: Bucket[];
  };
  composition: {
    teamComposition: Bucket[];
    studentMix: Bucket[];
    respondents: number;
    gender: Bucket[];
    raceEthnicity: Bucket[];
    firstGeneration: Bucket[];
    international: Bucket[];
  };
  portfolio: {
    distribution: { tier: OutcomeTier; count: number; dollars: number }[];
    totalCompanies: number;
    hitRate: number | null;
    recentCheckIns: { companyName: string; tier: string; recordedAt: Date }[];
  };
};

function Section({
  id,
  title,
  question,
  children,
}: {
  id: string;
  title: string;
  /** What this section is for, phrased as the question a member should ask. */
  question: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-8 scroll-mt-14">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-md font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-fg-muted">{question}</p>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3.5 py-8 text-center text-xs text-fg-muted">{children}</p>;
}

const APPLIED_VS_FUNDED = [
  { key: "applied", label: "Applied", fraction: 1, color: "color-mix(in oklab, var(--cat-1) 35%, transparent)" },
  { key: "funded", label: "Funded", fraction: 1, color: "var(--cat-1)" },
];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function InsightsCharts({ funnel, sourcing, money: moneyMix, composition, portfolio }: Props) {
  const applied = funnel.stages[0]?.reached ?? 0;
  const funnelItems = funnel.stages.map((s) => ({
    key: s.name,
    label: s.name,
    value: s.reached,
    display: String(s.reached),
    note: applied > 0 ? `${Math.round((s.reached / applied) * 100)}% of applicants` : undefined,
  }));
  const monthly = funnel.monthly.map((m) => ({
    label: format(new Date(`${m.month}-15`), "MMM yyyy"),
    count: m.count,
  }));
  const withMedian = funnel.stages.filter((s) => s.medianDaysInPrev != null);
  const departments = sourcing.byDepartment.slice(0, 8);
  const demographics = [
    ["Gender", composition.gender],
    ["Race / ethnicity", composition.raceEthnicity],
    ["First generation", composition.firstGeneration],
    ["International", composition.international],
  ] as const;

  return (
    <div className="mx-auto max-w-6xl">
      <Section id="funnel" title="Funnel" question="Where do applications stall, and why do we say no?">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="How far applications get"
            note="ever reached each stage"
            footer={
              withMedian.length > 0
                ? `Median days before moving on: ${withMedian.map((s) => `${s.name} ${s.medianDaysInPrev}d`).join(" · ")}`
                : undefined
            }
          >
            {funnelItems.length === 0 ? (
              <Empty>The funnel draws itself once applications start moving between stages.</Empty>
            ) : (
              <BarList items={funnelItems} />
            )}
          </Panel>
          <div className="flex flex-col gap-3">
            <ChartFrame
              title="Applications per month"
              height={170}
              empty={funnel.monthly.length === 0 && "No applications yet."}
            >
              <AreaChart data={monthly} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="label"
                  {...axisProps}
                  minTickGap={16}
                  tickFormatter={(l: string) => l.slice(0, 3)}
                />
                <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border-strong)" }} />
                <Area
                  type="monotone"
                  dataKey="count"
                  name="Applications"
                  stroke="var(--cat-1)"
                  fill="var(--cat-1)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--panel)" }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ChartFrame>
            <Panel title="Why we say no" note="recorded decline reasons">
              {funnel.declines.length === 0 ? (
                <Empty>Every decline records a reason. They add up here.</Empty>
              ) : (
                <BarList
                  color="var(--cat-10)"
                  items={funnel.declines.map((d) => ({
                    key: d.reason ?? "unknown",
                    label: d.reason ? DECLINE_LABELS[d.reason] : "No reason recorded",
                    value: d.count,
                    display: String(d.count),
                  }))}
                />
              )}
            </Panel>
          </div>
        </div>
      </Section>

      <Section id="sourcing" title="Sourcing" question="Are we only hearing from the people we already know?">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Applications by department" note="are we only pulling from CS?">
            {departments.length === 0 ? (
              <Empty>Departments come from the application form.</Empty>
            ) : (
              <>
                <BarList
                  items={departments.map((d) => ({
                    key: d.label,
                    label: d.label,
                    value: d.count,
                    inner: d.funded,
                    display: String(d.count),
                    note: `${d.funded} funded`,
                  }))}
                />
                <SegmentLegend segments={APPLIED_VS_FUNDED} className="border-t border-border px-3.5 py-2.5" />
              </>
            )}
          </Panel>
          <div className="flex flex-col gap-3">
            <Panel title="Where founders heard about us" note="campus source">
              {sourcing.byCampusSource.length === 0 ? (
                <Empty>Sources come from the application form.</Empty>
              ) : (
                <BarList
                  items={sourcing.byCampusSource.slice(0, 6).map((s) => ({
                    key: s.label,
                    label: s.label,
                    value: s.count,
                    display: String(s.count),
                  }))}
                />
              )}
            </Panel>
            <Panel title="Who brought them in" note="member sourcing">
              {sourcing.byMember.length === 0 ? (
                <Empty>
                  When a member is credited with sourcing an application, it is counted here.
                </Empty>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className={microLabel}>
                      <th className="px-3.5 py-2 text-left font-medium">Member</th>
                      <th className="px-2 py-2 text-right font-medium">Sourced</th>
                      <th className="py-2 pr-3.5 pl-2 text-right font-medium">Funded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sourcing.byMember.slice(0, 6).map((m) => (
                      <tr key={m.memberId} className="border-t border-border">
                        <td className="max-w-0 truncate px-3.5 py-2">{m.memberName}</td>
                        <td className="tnum px-2 py-2 text-right text-fg-muted">{m.sourced}</td>
                        <td className="tnum py-2 pr-3.5 pl-2 text-right font-medium">{m.funded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      </Section>

      <Section id="money" title="Money" question="Does what we fund match what we say we fund?">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Sectors: who applies, who we fund" note="revealed preference vs stated thesis">
            {moneyMix.sectors.length === 0 ? (
              <Empty>Tag companies with a sector and the mix appears here.</Empty>
            ) : (
              <>
                <BarList
                  items={moneyMix.sectors.map((s) => ({
                    key: s.sectorName,
                    label: s.sectorName,
                    value: s.applicants,
                    inner: s.funded,
                    display: String(s.applicants),
                    note: `${s.funded} funded`,
                  }))}
                />
                <SegmentLegend segments={APPLIED_VS_FUNDED} className="border-t border-border px-3.5 py-2.5" />
              </>
            )}
          </Panel>
          <ChartFrame
            title="Check sizes"
            description="grants approved or paid, $500 bins"
            height={240}
            empty={moneyMix.checkHistogram.length === 0 && "No grants yet."}
          >
            <BarChart data={moneyMix.checkHistogram} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} minTickGap={8} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} width={28} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
              <Bar
                dataKey="count"
                name="Grants"
                fill="var(--cat-1)"
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
                isAnimationActive={false}
              />
            </BarChart>
          </ChartFrame>
        </div>
      </Section>

      <Section id="composition" title="Composition" question="Who is applying — and who isn't?">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Team shape" note="from the application form">
            {composition.teamComposition.length + composition.studentMix.length === 0 ? (
              <Empty>Team details come from the application form.</Empty>
            ) : (
              <BarList
                items={[...composition.teamComposition, ...composition.studentMix].map((b) => ({
                  key: b.label,
                  label: capitalize(b.label),
                  value: b.count,
                  display: String(b.count),
                }))}
              />
            )}
          </Panel>
          <Panel
            title="Founder demographics"
            note={`${composition.respondents} optional ${composition.respondents === 1 ? "response" : "responses"}`}
            footer={
              <span className="flex gap-2">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-success" />
                <span>
                  Private by design. Any group of fewer than 5 people is folded into “{SUPPRESSED}”,
                  and left out entirely if the folded group is still under 5. Answers are never
                  shown per person, exported, or combined across questions.
                </span>
              </span>
            }
          >
            <div className="flex flex-col divide-y divide-border">
              {demographics.map(([label, buckets]) => (
                <div key={label} className="px-3.5 py-3">
                  <div className={microLabel}>{label}</div>
                  {buckets.length === 0 ? (
                    <p className="mt-1.5 text-xs text-fg-muted">
                      Not shown — every group is still smaller than 5.
                    </p>
                  ) : (
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {buckets.map((b) => {
                        const folded = b.label === SUPPRESSED;
                        return (
                          <li key={b.label} className="flex items-baseline justify-between gap-3 text-sm">
                            <span className={folded ? "text-fg-muted italic" : undefined}>
                              {folded ? "Small groups, folded together" : capitalize(b.label)}
                            </span>
                            <span className="tnum font-medium">{b.count}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </Section>

      <Section
        id="portfolio"
        title="Portfolio"
        question="Most grants go nowhere. That is the job — what did the rest do?"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            title="The outcome ladder"
            note={`${portfolio.totalCompanies} ${portfolio.totalCompanies === 1 ? "company" : "companies"} · count and dollars granted`}
          >
            {portfolio.totalCompanies === 0 ? (
              <Empty>Companies join the ladder when their first grant is paid.</Empty>
            ) : (
              <TierLadder distribution={portfolio.distribution} className="py-1.5" />
            )}
          </Panel>
          <Panel title="Recent check-ins" note="latest recorded outcomes">
            {portfolio.recentCheckIns.length === 0 ? (
              <Empty>
                Ask each grantee how it is going once a quarter and record the answer on Outcomes.
              </Empty>
            ) : (
              <ul className="divide-y divide-border">
                {portfolio.recentCheckIns.slice(0, 8).map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                    <span className="min-w-0 truncate font-medium">{c.companyName}</span>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {TIER_META[c.tier as OutcomeTier]?.label ?? c.tier}
                      <span className="tnum text-fg-subtle"> · {format(c.recordedAt, "MMM d, yyyy")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Section>
      <p className="text-2xs text-fg-subtle">
        Dollars are grants paid out. The club takes no equity, so there is no portfolio value to
        report — only how far each company got.
      </p>
    </div>
  );
}
