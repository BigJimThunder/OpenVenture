import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  EyeOff,
  History,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SkipLink } from "@/components/patterns/skip-link";
import { Chip, SectionHead, btn, styles } from "./kit";
import { Spotlight } from "./spotlight";
import { HeroBoard } from "./hero-board";
import { Workflow } from "./workflow";
import { CapTableVisual } from "./bento/cap-table";
import { SchedulerVisual } from "./bento/scheduler";
import { AutomationsVisual } from "./bento/automations";
import { MeetingsVisual } from "./bento/meetings";
import { DeployCard } from "./deploy-card";

const GITHUB_URL = "https://github.com/BigJimThunder/OpenVenture";
const DEPLOY_URL = `${GITHUB_URL}#deploy-your-own`;

/**
 * The project's front door. It sells the product by letting a visitor use it:
 * the hero is the pipeline board, the tour is five working pieces of the app,
 * and the feature grid is built from the same parts. Copy is plain and
 * confident — what it does and why that matters, never a joke at anyone's
 * expense. Every club, member, company and number shown is fictional; every
 * behavior shown is the software's. See DESIGN_BRIEF.md §11.
 */

const NAV = [
  { href: "#workflow", label: "Workflow" },
  { href: "#features", label: "Features" },
  { href: "#principles", label: "Principles" },
  { href: "#open-source", label: "Open source" },
];

const STATS = [
  { value: "1", unit: "workspace", text: "for deal flow, memos, votes, grants and reports" },
  { value: "$0", unit: "to run", text: "on free hosting tiers, for a club of fifteen" },
  { value: "10", unit: "minutes", text: "from one click to your first admin signed in" },
  { value: "100%", unit: "yours", text: "your database, your code, full export any time" },
];

const PRINCIPLES = [
  {
    icon: EyeOff,
    title: "Blind by default",
    text: "Ballots stay sealed until the round is revealed. The server enforces it, for admins too.",
  },
  {
    icon: ShieldCheck,
    title: "Overdraw-proof",
    text: "Every approval re-checks the pool as it commits, even when two officers click at once.",
  },
  {
    icon: UsersRound,
    title: "Private by design",
    text: "Demographics are aggregate-only and hidden below a group of five. No per-person view, no export.",
  },
  {
    icon: History,
    title: "A record that outlasts you",
    text: "Stage moves, decline reasons, votes and grants are all logged, so next year's team inherits the full history.",
  },
];

/** What "open source" buys a fund. The deploy card beside these shows the how. */
const OWNERSHIP = [
  { title: "Self-hosted", text: "Runs on your own hosting and your own Postgres. One fund per deployment." },
  { title: "Readable", text: "Every line that touches a vote or a dollar is in the repository." },
  { title: "Portable", text: "Export everything as JSON or CSV whenever you like. Nothing is locked in." },
];

const STACK = ["Next.js", "TypeScript", "Postgres", "Drizzle", "Better Auth", "MIT license"];

function OVMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-lg bg-accent text-[0.6875rem] font-semibold text-accent-fg",
        className
      )}
    >
      OV
    </span>
  );
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cn("size-4 fill-current", className)}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * One card of the feature grid: a working visual above, a name and a sentence
 * below. Each card is a two-row subgrid, so the dividers of the cards in a row
 * line up however their sentences wrap.
 */
function Feature({
  id,
  title,
  children,
  visual,
  className,
  visualClassName,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  className?: string;
  visualClassName?: string;
}) {
  return (
    <Spotlight id={`feature-${id}`} className={cn(styles.reveal, "row-span-2 grid grid-rows-subgrid gap-0", className)}>
      <div className={cn("relative border-b border-border bg-chrome/50 p-4 sm:p-5", visualClassName)}>{visual}</div>
      <div className="p-5 sm:p-6">
        <h3 className={styles.h3}>{title}</h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">{children}</p>
      </div>
    </Spotlight>
  );
}

export function Landing({
  applying,
  demo = false,
}: {
  /** Set only when this deployment's club has opened its application form. */
  applying: { clubName: string } | null;
  /** This deployment is the public demo: offer a way in. */
  demo?: boolean;
}) {
  const primary = demo ? (
    <Link href="/login" className={cn(btn.base, btn.primary)}>
      Explore the live demo
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  ) : (
    <a href={DEPLOY_URL} className={cn(btn.base, btn.primary)}>
      Deploy your own
      <ArrowRight className="size-4" aria-hidden />
    </a>
  );
  const secondary = demo ? (
    <a href={DEPLOY_URL} className={cn(btn.base, btn.secondary)}>
      Deploy your own
    </a>
  ) : (
    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={cn(btn.base, btn.secondary)}>
      <GitHubMark />
      View on GitHub
    </a>
  );

  return (
    <div className={styles.page}>
      <SkipLink href="#top" />
      <div aria-hidden className={styles.aurora} />
      <div aria-hidden className={styles.grid} />

      <header className={cn(styles.navBar, "sticky top-0 z-40")}>
        <div className="mx-auto flex h-14 max-w-[78rem] items-center gap-6 px-5 sm:px-8">
          <a href="#top" className="flex h-11 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <OVMark />
            <span className="text-base font-semibold tracking-tight">OpenVenture</span>
          </a>
          <nav aria-label="Site" className="hidden items-center gap-1 text-sm md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex h-9 items-center rounded-md px-3 text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="OpenVenture on GitHub"
              className="inline-flex size-11 items-center justify-center rounded-md text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent sm:size-9"
            >
              <GitHubMark className="size-[1.125rem]" />
            </a>
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-md px-2.5 text-fg-muted outline-none transition-colors hover:text-fg focus-visible:ring-2 focus-visible:ring-accent sm:h-9 sm:px-3"
            >
              {demo ? "Live demo" : "Sign in"}
            </Link>
            <a
              href={DEPLOY_URL}
              className="inline-flex h-9 items-center rounded-lg bg-fg px-3.5 font-medium text-bg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome"
            >
              Deploy
            </a>
          </div>
        </div>
      </header>

      <main id="top" tabIndex={-1} className="relative outline-none">
        {/* Hero */}
        <section aria-labelledby="hero-title" className="mx-auto max-w-[78rem] px-5 pt-12 sm:px-8 sm:pt-16 lg:pt-20">
          <div className="mx-auto max-w-6xl text-center">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className={cn(
                styles.pill,
                styles.rise,
                "outline-none transition-colors hover:border-fg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              Open source and MIT licensed
              <span aria-hidden className="h-3.5 w-px bg-border-strong" />
              <span className="inline-flex items-center gap-1 font-medium text-fg">
                Star on GitHub
                <ArrowUpRight className="size-3.5" aria-hidden />
              </span>
            </a>
            <h1 id="hero-title" className={cn(styles.display, styles.rise, "mt-7")} style={{ "--d": "0.05s" } as React.CSSProperties}>
              The operating system{" "}
              <span className="text-fg-muted lg:block">for student venture funds.</span>
            </h1>
            <p className={cn(styles.lede, styles.rise, "mx-auto mt-6 max-w-2xl")} style={{ "--d": "0.1s" } as React.CSSProperties}>
              Pipeline, diligence memos, blind committee votes and grant accounting in one open-source
              workspace. The discipline of a real fund, free to run for your whole club.
            </p>
            <div
              className={cn(styles.rise, "mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center")}
              style={{ "--d": "0.15s" } as React.CSSProperties}
            >
              {primary}
              {secondary}
            </div>
            <p className={cn(styles.rise, "mt-5 text-sm text-fg-subtle")} style={{ "--d": "0.15s" } as React.CSSProperties}>
              Free on hobby tiers · Ten-minute setup · No terminal required
            </p>
            {applying && (
              <p className="mt-4 text-sm text-fg-muted">
                A founder looking for a grant?{" "}
                <Link href="/apply" className="font-medium text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg">
                  Apply to {applying.clubName}
                </Link>
              </p>
            )}
          </div>

          <div className={cn(styles.halo, "mt-12 sm:mt-14")}>
            <div className={styles.settle}>
              <HeroBoard />
            </div>
          </div>
        </section>

        {/* The short version */}
        <section aria-label="At a glance" className="mx-auto max-w-[78rem] px-5 pt-16 sm:px-8 lg:pt-24">
          <dl className={cn(styles.reveal, "grid grid-cols-2 gap-x-6 gap-y-8 border-y border-border py-8 lg:grid-cols-4 lg:py-10")}>
            {STATS.map((s) => (
              <div key={s.unit} className="flex flex-col-reverse justify-end gap-2">
                <dt className="max-w-[16rem] text-sm leading-relaxed text-fg-muted">{s.text}</dt>
                <dd className="flex items-baseline gap-2">
                  <span className="tnum text-4xl font-semibold tracking-tighter sm:text-5xl">{s.value}</span>
                  <span className="text-sm font-medium text-fg-muted">{s.unit}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* The tour */}
        <section id="workflow" aria-labelledby="workflow-title" className="mx-auto max-w-[78rem] scroll-mt-20 px-5 pt-24 sm:px-8 lg:pt-36">
          <SectionHead id="workflow-title" eyebrow="The workflow" title="From first pitch to final check.">
            One record follows every application from the form to the annual report. Each step below is a
            working piece of the app, so go ahead and use it.
          </SectionHead>
          <div className={cn(styles.reveal, "mt-12 lg:mt-16")}>
            <Workflow />
          </div>
        </section>

        {/* Everything else */}
        <section id="features" aria-labelledby="features-title" className="mx-auto max-w-[78rem] scroll-mt-20 px-5 pt-28 sm:px-8 lg:pt-40">
          <SectionHead id="features-title" eyebrow="Everything else" title="The whole fund runs here.">
            Past the pipeline are the tools a fund reaches for every week, and the ones it only needs twice
            a year. They all draw on the same record.
          </SectionHead>

          <div className="mt-12 grid gap-4 lg:mt-16 lg:grid-cols-6">
            <Feature
              id="cap-table"
              className="lg:col-span-4"
              title="Cap Table Lab"
              visual={<CapTableVisual />}
            >
              A dilution sandbox for advising founders. Move the sliders to see what a SAFE becomes when the
              seed closes, then open the arithmetic behind any number. This card runs the app&apos;s real engine.
            </Feature>
            <Feature className="lg:col-span-2" id="scheduler" title="Scheduler" visual={<SchedulerVisual />}>
              Members enter their classes once. The hour the committee is free is one look away.
            </Feature>
            <Feature className="lg:col-span-2" id="automations" title="Automations" visual={<AutomationsVisual />}>
              Vote reminders, deadline nudges, a Monday digest and quarterly check-ins, each sent once and
              each with its own switch.
            </Feature>
            <Feature className="lg:col-span-2" id="meetings" title="Meetings" visual={<MeetingsVisual />}>
              Build the agenda from what is waiting, take attendance in two taps, and send the recap when
              you wrap.
            </Feature>
            <Feature className="lg:col-span-2" id="reports" title="Reports" visual={<ReportVisual />}>
              Quarterly letters, funding requests and the annual report, print-ready, with every figure
              pulled from the record.
            </Feature>
            <Feature className="lg:col-span-3" id="assistant" title="Connect your AI" visual={<AssistantVisual />}>
              A built-in MCP endpoint and personal access tokens let each member&apos;s own assistant read the
              pipeline. It can never vote, move money or email a founder.
            </Feature>
            <Feature className="lg:col-span-3" id="onboarding" title="Onboarding" visual={<OnboardingVisual />}>
              Invite a new member once and a guided track takes them from the thesis to their first memo.
              Admins see where everyone stands.
            </Feature>
          </div>
        </section>

        {/* Principles */}
        <section id="principles" aria-labelledby="principles-title" className="mx-auto max-w-[78rem] scroll-mt-20 px-5 pt-28 sm:px-8 lg:pt-40">
          <SectionHead id="principles-title" eyebrow="Principles" title="Built like it handles real money.">
            Because it does. The rules that matter are enforced in code, where a busy semester cannot
            quietly undo them.
          </SectionHead>
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
            {PRINCIPLES.map((p) => (
              <li key={p.title} className={cn(styles.reveal, "bg-bg p-6 sm:p-7")}>
                <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border-strong bg-panel text-accent shadow-xs">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <h3 className={cn(styles.h3, "mt-5")}>{p.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-fg-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Open source */}
        <section id="open-source" aria-labelledby="open-source-title" className="mx-auto max-w-[78rem] scroll-mt-20 px-5 pt-28 sm:px-8 lg:pt-40">
          <div className="grid items-center gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
            <div>
              <SectionHead id="open-source-title" eyebrow="Open source" title="Yours to run. Yours to keep." align="left">
                No subscription and nobody in the middle. One click gives your fund its own copy, on its own
                database, under the MIT license.
              </SectionHead>
              <ul className={cn(styles.reveal, "mt-10 grid gap-6 sm:grid-cols-3")}>
                {OWNERSHIP.map((o) => (
                  <li key={o.title} className="border-t border-border-strong pt-4">
                    <p className="font-semibold tracking-tight">{o.title}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{o.text}</p>
                  </li>
                ))}
              </ul>
              <ul className={cn(styles.reveal, "mt-8 flex flex-wrap gap-2")} aria-label="Built with">
                {STACK.map((s) => (
                  <li key={s} className="rounded-full border border-border-strong bg-panel/60 px-3 py-1 text-xs text-fg-muted">
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <div id="deploy-card" className={cn(styles.halo, styles.reveal)}>
              <DeployCard />
            </div>
          </div>
        </section>

        {/* Close */}
        <section aria-labelledby="cta-title" className="mx-auto max-w-[78rem] px-5 py-28 sm:px-8 lg:py-40">
          <div className={cn(styles.card, styles.reveal, "px-6 py-16 text-center sm:px-10 sm:py-24")}>
            <div aria-hidden className={cn(styles.aurora, "h-full opacity-80")} />
            <div className="relative">
              <h2 id="cta-title" className={cn(styles.h2, "mx-auto max-w-3xl")}>
                Run your fund like a real one.
              </h2>
              <p className={cn(styles.lede, "mx-auto mt-5 max-w-xl")}>
                Set it up this afternoon. Hand it to next year&apos;s officers with every decision still in it.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                {primary}
                {secondary}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-border">
        <div className="mx-auto flex max-w-[78rem] flex-col gap-6 px-5 py-10 text-sm text-fg-muted sm:px-8 md:flex-row md:items-center">
          <div className="flex items-center gap-2.5">
            <OVMark className="size-6 rounded-md text-[0.5625rem]" />
            <span>
              <span className="font-medium text-fg">OpenVenture</span> · Open-source software for student-run funds
            </span>
          </div>
          <div className="-my-2 flex flex-wrap items-center gap-x-6 md:ml-auto">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center hover:text-fg">
              GitHub
            </a>
            {applying && (
              <Link href="/apply" className="inline-flex min-h-11 items-center hover:text-fg">
                Apply
              </Link>
            )}
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-fg">
              Privacy
            </Link>
            <Link href="/login" className="inline-flex min-h-11 items-center hover:text-fg">
              {demo ? "Live demo" : "Sign in"}
            </Link>
          </div>
        </div>
        <p className="mx-auto max-w-[78rem] px-5 pb-10 text-xs text-fg-subtle sm:px-8">
          Cardinal Ventures, its members and every company shown on this page are fictional demo data.
        </p>
      </footer>
    </div>
  );
}

/* ——— Static visuals for the feature grid ——— */

/** A quarterly letter, as the app prints it: serif, with the figures filled in. */
function ReportVisual() {
  return (
    <div aria-hidden className="relative h-56 overflow-hidden">
      <div className="mx-auto h-full max-w-[19rem] rounded-t-lg border border-b-0 border-border-strong bg-panel px-5 pt-5 shadow-md">
        <p className={styles.label}>Q3 letter · Cardinal Ventures</p>
        <p className="mt-2 font-display text-lg font-medium leading-snug tracking-tight">To our funders</p>
        <p className="mt-2 font-display text-[0.8125rem] leading-relaxed text-fg-muted">
          We received <b className="font-semibold text-fg">14</b> applications this quarter, funded{" "}
          <b className="font-semibold text-fg">3</b> and declined <b className="font-semibold text-fg">2</b>, every decline with
          a recorded reason and a reply to the founder.
        </p>
        <div className="tnum mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
          {[
            ["Deployed", "$5,150"],
            ["Committed", "$2,650"],
            ["Remaining", "$2,200"],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[0.625rem] text-fg-subtle">{k}</p>
              <p className="text-sm font-semibold">{v}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-chrome/80 to-transparent" />
    </div>
  );
}

/** A member's own assistant answering from the pipeline over MCP. */
function AssistantVisual() {
  return (
    <div aria-hidden className="flex h-52 flex-col justify-center gap-3">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-accent-fg">
        What has been stuck in Coffee Chat the longest?
      </div>
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border-strong bg-panel px-4 py-3 shadow-xs">
        <p className="flex items-center gap-1.5 text-2xs text-fg-subtle">
          <Sparkles className="size-3 text-accent" />
          Read from OpenVenture · read-only token
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">
          <span className="font-semibold">Solara Labs</span>, 19 days against a 14-day target. Priya owns it. TapTix
          is next at 12 days.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Chip tone="warning">APP-3 · 19 days</Chip>
          <Chip>APP-12 · 12 days</Chip>
        </div>
      </div>
    </div>
  );
}

/** A new member's track, part-way through. */
function OnboardingVisual() {
  const tasks = [
    ["Read the investment thesis", true],
    ["Shadow a coffee chat", true],
    ["Score a practice application", true],
    ["Write a practice memo", false],
    ["Sit in on a blind vote", false],
  ] as const;
  return (
    <div aria-hidden className="flex h-52 flex-col justify-center">
      <div className="rounded-xl border border-border-strong bg-panel p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-full bg-accent-subtle text-xs font-semibold">LM</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Lena Marsh · New analyst track</p>
            <p className="tnum text-xs text-fg-muted">3 of 5 complete</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle">
          <div className="h-full w-3/5 rounded-full bg-accent" />
        </div>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {tasks.map(([label, done]) => (
            <li key={label} className={cn("flex items-center gap-2 text-xs", done ? "text-fg-muted" : "text-fg")}>
              <span
                className={cn(
                  "inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                  done ? "border-success bg-success text-bg" : "border-border-strong"
                )}
              >
                {done && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              <span className="truncate">{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
