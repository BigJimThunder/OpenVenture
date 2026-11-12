"use client";

import * as React from "react";
import { FileText, ShieldCheck, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, BarTitle, Chip, Dot, Window, styles, ui } from "../kit";

type View = "funnel" | "declines" | "sourcing";

type Row = {
  label: string;
  /** What the bar measures. */
  value: number;
  /** The quieter figure beside it. */
  note: string;
  /** The row in a sentence, shown under the chart. */
  reading: string;
  color: string;
  /** A second, solid bar inside the first (funded, within sourced). */
  inner?: number;
  lead: React.ReactNode;
};

/** The season, as the record has it. Every figure below is derived from these. */
const STAGES = [
  { label: "Applied", count: 22, cat: 10 },
  { label: "Screening", count: 16, cat: 2 },
  { label: "Coffee Chat", count: 11, cat: 3 },
  { label: "Pitched Group", count: 8, cat: 4 },
  { label: "Funded", count: 6, cat: 5 },
];
const REASONS = [
  { label: "Too early", count: 6, gloss: "the company was too early for a grant" },
  { label: "Not a fit", count: 4, gloss: "the company was not a fit for the club" },
  { label: "Outside our criteria", count: 3, gloss: "the company fell outside the published criteria" },
  { label: "Team", count: 2, gloss: "the team was the open question" },
  { label: "Went quiet", count: 1, gloss: "the founder stopped replying" },
];
const SOURCERS = [
  { name: "Priya Raman", first: "Priya", initials: "PR", sourced: 6, funded: 2 },
  { name: "Marcus Chen", first: "Marcus", initials: "MC", sourced: 5, funded: 2 },
  { name: "Elena K.", first: "Elena", initials: "EK", sourced: 4, funded: 1 },
  { name: "Sam G.", first: "Sam", initials: "SG", sourced: 4, funded: 1 },
];
const MEMBERS = 15;

const APPLIED = STAGES[0].count;
const FUNDED = STAGES[STAGES.length - 1].count;
const DECLINED = REASONS.reduce((n, r) => n + r.count, 0);
const MEDIAN_DAYS = 9;
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;

const STEP_READING = [
  `${APPLIED} applications came in this season.`,
  "applications passed screening",
  "screened applications led to a coffee chat",
  "coffee chats led to a group pitch",
  "group pitches were funded",
];

/** Sourced is the paler bar; the funded part of it is drawn solid on top. */
const SOURCED = "color-mix(in oklch, var(--cat-1) 42%, transparent)";

const named = SOURCERS.reduce((n, s) => n + s.sourced, 0);
const others = { sourced: APPLIED - named, funded: FUNDED - SOURCERS.reduce((n, s) => n + s.funded, 0) };

const VIEWS: Record<View, { tab: string; heading: string; aside: React.ReactNode; caption: string; rows: Row[] }> = {
  funnel: {
    tab: "Funnel",
    heading: "Applications by stage",
    aside: "Step conversion",
    caption: `${FUNDED} of ${APPLIED} applications ended with a grant (${pct(FUNDED, APPLIED)}). Each stage passed about seven in ten.`,
    rows: STAGES.map((s, i) => {
      const prev = STAGES[i - 1]?.count;
      return {
        label: s.label,
        value: s.count,
        note: prev ? pct(s.count, prev) : "",
        reading: prev ? `${s.count} of ${prev} ${STEP_READING[i]} (${pct(s.count, prev)}).` : STEP_READING[i],
        color: `var(--cat-${s.cat})`,
        lead: <Dot n={s.cat} />,
      };
    }),
  },
  declines: {
    tab: "Declines",
    heading: "Declines by reason",
    aside: `${DECLINED} declines`,
    caption: `All ${DECLINED} declines carry a recorded reason. The most common is too early, at ${REASONS[0].count}.`,
    rows: REASONS.map((r) => ({
      label: r.label,
      value: r.count,
      note: `of ${DECLINED}`,
      reading: `${r.count} of ${DECLINED} declines: ${r.gloss}.`,
      color: "var(--cat-1)",
      lead: null,
    })),
  },
  sourcing: {
    tab: "Sourcing",
    heading: "Sourced by member",
    aside: (
      <span className="inline-flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-xs" style={{ background: SOURCED }} />
          Sourced
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-xs" style={{ background: "var(--cat-5)" }} />
          Funded
        </span>
      </span>
    ),
    caption: `Four members sourced ${named} of the ${APPLIED} applications, and all ${FUNDED} of the funded ones.`,
    rows: [
      ...SOURCERS.map((s) => ({
        label: s.name,
        value: s.sourced,
        inner: s.funded,
        note: `${s.funded} funded`,
        reading: `${s.first} sourced ${s.sourced} applications. ${s.funded === 1 ? "1 was" : `${s.funded} were`} funded.`,
        color: SOURCED,
        lead: <Avatar initials={s.initials} />,
      })),
      {
        label: "Others",
        value: others.sourced,
        inner: others.funded,
        note: `${others.funded} funded`,
        reading: `The other ${MEMBERS - SOURCERS.length} members sourced ${others.sourced} applications between them. None were funded.`,
        color: SOURCED,
        lead: (
          <span aria-hidden className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-fg-muted">
            <Users className="size-3" />
          </span>
        ),
      },
    ],
  },
};
const ORDER: View[] = ["funnel", "declines", "sourcing"];

/** A figure in the letter that came from the record rather than from a person. */
function Fig({ children }: { children: React.ReactNode }) {
  return <span className="tnum rounded-[3px] bg-accent-subtle px-[3px] py-px text-fg">{children}</span>;
}

/** The pipeline paragraph of the letter, in the report's own voice. */
function Paragraph({ className, ...rest }: React.ComponentProps<"p">) {
  return (
    <p {...rest} className={cn("font-display text-base leading-[1.65] text-fg", className)}>
      We received <Fig>{APPLIED}</Fig> applications this season, funded <Fig>{FUNDED}</Fig> and declined{" "}
      <Fig>{DECLINED}</Fig>, each decline with a recorded reason and a reply to the founder. The most common
      reason, given for <Fig>{REASONS[0].count}</Fig> of them, was that {REASONS[0].gloss}. The median
      application had a decision in <Fig>{MEDIAN_DAYS}</Fig> days.
    </p>
  );
}

/**
 * Insights, small: three readings of one season, and the quarterly letter that
 * is composed from the same numbers. Nothing here is typed in twice.
 */
export function InsightsDemo() {
  const [view, setView] = React.useState<View>("funnel");
  const [grown, setGrown] = React.useState(true); // full on first paint, so it reads with scripts off
  const [hot, setHot] = React.useState<number | null>(null); // under the pointer or focused
  const [picked, setPicked] = React.useState<number | null>(null);
  const [letter, setLetter] = React.useState(false);

  const v = VIEWS[view];
  const max = Math.max(...v.rows.map((r) => r.value));
  const lit = hot ?? picked;

  function show(next: View) {
    if (next === view) return;
    setView(next);
    setHot(null);
    setPicked(null);
    // New bars mount at zero width, then grow on the next frame.
    setGrown(false);
    requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
  }

  return (
    <Window
      className="h-full"
      bar={
        <>
          <BarTitle meta="2026–27 season">Insights</BarTitle>
          <div role="group" aria-label="Chart" className="relative -mr-1.5 ml-auto flex items-center px-0.5">
            <span aria-hidden className="absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-lg border border-border bg-bg-subtle" />
            {ORDER.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => show(key)}
                className="group/seg relative inline-flex h-11 cursor-pointer items-center px-px outline-none"
              >
                <span
                  className={cn(
                    "inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-medium transition-colors group-focus-visible/seg:ring-2 group-focus-visible/seg:ring-accent/60",
                    view === key
                      ? "border-border-strong bg-bg text-fg shadow-xs"
                      : "border-transparent text-fg-muted group-hover/seg:text-fg"
                  )}
                >
                  {VIEWS[key].tab}
                </span>
              </button>
            ))}
          </div>
        </>
      }
    >
      <div className="@container flex h-full flex-col">
        {/* The season in four figures */}
        <ul className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-b border-border px-5 py-3 text-xs text-fg-muted sm:px-6 @[42rem]:flex @[42rem]:gap-x-0">
          {[
            [String(APPLIED), "applications"],
            [String(FUNDED), "funded"],
            [pct(FUNDED, APPLIED), "funding rate"],
            [`${MEDIAN_DAYS} days`, "median to a decision"],
          ].map(([figure, label], i) => (
            <li
              key={label}
              className={cn(
                "flex items-baseline gap-1.5 whitespace-nowrap",
                i > 0 && "@[42rem]:ml-5 @[42rem]:border-l @[42rem]:border-border @[42rem]:pl-5"
              )}
            >
              <span className="tnum whitespace-nowrap text-md font-semibold tracking-tight text-fg">{figure}</span>
              {label}
            </li>
          ))}
        </ul>

        <div className="grid flex-1 gap-x-7 gap-y-6 p-5 sm:p-6 @[34rem]:grid-cols-2 @[34rem]:grid-rows-[1fr_auto] @[42rem]:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          {/* The chart */}
          <div className="min-w-0">
            <div className="flex min-h-5 items-center justify-between gap-3">
              <p className={styles.label}>{v.heading}</p>
              <p className="tnum shrink-0 text-xs text-fg-muted">{v.aside}</p>
            </div>
            <ul key={view} className="-mx-2 mt-1.5" onMouseLeave={() => setHot(null)}>
              {v.rows.map((r, i) => (
                <li key={r.label}>
                  <button
                    type="button"
                    aria-pressed={picked === i}
                    onMouseEnter={() => setHot(i)}
                    onFocus={() => setHot(i)}
                    onBlur={() => setHot(null)}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "block w-full cursor-pointer rounded-md px-2 pb-2 pt-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
                      lit === i && "bg-bg-subtle"
                    )}
                  >
                    <span className="flex h-5 items-center gap-2 text-sm">
                      {r.lead}
                      <span className={cn("truncate", lit === i ? "text-fg" : "text-fg-muted")}>{r.label}</span>
                      <span className="tnum ml-auto font-semibold text-fg">{r.value}</span>
                      <span className="tnum w-[3.75rem] shrink-0 text-right text-xs text-fg-muted">{r.note}</span>
                    </span>
                    <span aria-hidden className="relative mt-1 block h-2 overflow-hidden rounded-full bg-border">
                      <span
                        className={cn(styles.grow, "absolute inset-y-0 left-0 rounded-full")}
                        style={{
                          width: grown ? `${(r.value / max) * 100}%` : "0%",
                          background: r.color,
                          transitionDelay: `${i * 45}ms`,
                        }}
                      />
                      {r.inner ? (
                        <span
                          className={cn(styles.grow, "absolute inset-y-0 left-0 rounded-full")}
                          style={{
                            width: grown ? `${(r.inner / max) * 100}%` : "0%",
                            background: "var(--cat-5)",
                            transitionDelay: `${i * 45 + 120}ms`,
                          }}
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {/* Every reading of this view is laid out unseen in the same cell,
                so the caption keeps the height of the longest at any width. */}
            <div className="tnum mt-2 grid border-l-2 border-accent pl-3 text-sm leading-5">
              {[v.caption, ...v.rows.map((r) => r.reading)].map((text, i) => (
                <p key={i} aria-hidden className="invisible col-start-1 row-start-1">
                  {text}
                </p>
              ))}
              <p role="status" aria-live="polite" className="col-start-1 row-start-1 text-fg">
                {lit === null ? v.caption : v.rows[lit].reading}
              </p>
            </div>
          </div>

          {/* The letter */}
          <div className="flex min-w-0 flex-col @[34rem]:col-start-2 @[34rem]:row-span-2 @[34rem]:row-start-1">
            <div className="flex flex-1 flex-col rounded-lg border border-border bg-panel p-4 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <p className={styles.label}>Quarterly letter</p>
                {letter ? (
                  <Chip tone="accent" className={styles.pop}>
                    Draft
                  </Chip>
                ) : (
                  <Chip>Not started</Chip>
                )}
              </div>
              <p className="mt-3 font-display text-md text-fg">Dear supporters,</p>
              {/* The paragraph is always laid out, unseen until drafted, so the
                  page keeps its height when the letter appears. */}
              <div className="mt-2 grid pb-3">
                <Paragraph aria-hidden className="invisible col-start-1 row-start-1" />
                <div role="status" aria-live="polite" className="col-start-1 row-start-1">
                  {letter ? (
                    <Paragraph className={styles.pop} />
                  ) : (
                    <>
                      <div aria-hidden className="space-y-2.5 pt-1.5">
                        {[100, 94, 98, 88, 56].map((w, i) => (
                          <span key={i} className="block h-2 rounded-full bg-border" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
                        The pipeline paragraph writes itself from the figures in this view.
                      </p>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-auto flex items-start gap-2 border-t border-border pt-3 text-xs leading-relaxed text-fg-muted">
                <span aria-hidden className="mt-1 size-2.5 shrink-0 rounded-[3px] bg-accent-subtle" />
                Figures come from the record. The prose stays editable.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLetter((on) => !on)}
              className={cn(ui.button, letter ? ui.quiet : ui.primary, "mt-3 w-full")}
            >
              {!letter && <FileText className="size-3.5" aria-hidden />}
              {letter ? "Hide letter" : "Draft the quarterly letter"}
            </button>
          </div>

          {/* What this screen never shows */}
          <p className="flex items-start gap-2 border-t border-border pt-3.5 text-xs leading-relaxed text-fg-muted @[34rem]:col-start-1 @[34rem]:row-start-2">
            <ShieldCheck className="mt-[3px] size-3.5 shrink-0 text-success" aria-hidden />
            Founder demographics are optional and aggregate-only. Groups smaller than five are withheld.
          </p>
        </div>
      </div>
    </Window>
  );
}
