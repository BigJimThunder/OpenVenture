import type * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BallotReveal } from "./ballot-reveal";
import { Reveal } from "./reveal";
import styles from "./landing.module.css";

const GITHUB_URL = "https://github.com/BigJimThunder/OpenVenture";
const REQUEST_URL =
  "mailto:chrismesch@gmail.com?subject=OpenVenture%20access%20request&body=Club%20name%2C%20school%2C%20and%20what%20you%27re%20funding%3A";

const STAGES = [
  {
    n: "01",
    name: "Application",
    cat: "bg-cat-1",
    copy: "One form, straight into the pipeline. The response clock starts counting the moment it lands.",
  },
  {
    n: "02",
    name: "Screening",
    cat: "bg-cat-2",
    copy: "Scored against the club's own rubric — criteria live in the app, not in one officer's head.",
  },
  {
    n: "03",
    name: "Coffee chat",
    cat: "bg-cat-3",
    copy: "Two members meet the founders. Both must mark advance — one maybe is a no.",
  },
  {
    n: "04",
    name: "Memo & vote",
    cat: "bg-cat-4",
    copy: "The memo circulates in versions. Ballots stay sealed until the reveal.",
  },
  {
    n: "05",
    name: "Grant & outcome",
    cat: "bg-cat-5",
    copy: "Approvals are budget-guarded. Issuance, receipts, and what happened the season after.",
  },
];

const PRINCIPLES = [
  {
    name: "Blind by construction",
    copy: "No query path reads a ballot before reveal. Members see who voted, never how.",
  },
  {
    name: "Aggregates of five or more",
    copy: "Demographics only ever leave the database as groups — no per-person views, no exports, no cross-tabs.",
  },
  {
    name: "Money is decimal",
    copy: "Every dollar and share flows through one exact arithmetic engine, pinned by golden-fixture tests. No floats, anywhere.",
  },
  {
    name: "Every action logged",
    copy: "Each mutation passes one gate: validated, session-checked, role-checked, written to the activity log.",
  },
];

function ProductFrame({
  light,
  dark,
  alt,
  priority = false,
  caption,
}: {
  light: string;
  dark: string;
  alt: string;
  priority?: boolean;
  caption?: string;
}) {
  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-[0_1px_2px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.18)]">
        <div className="flex items-center gap-1.5 border-b border-border bg-bg-subtle px-3.5 py-2.5">
          <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
          <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
          <span className="size-2.5 rounded-full border border-border-strong" aria-hidden />
          <span className="mx-auto rounded-sm border border-border bg-panel px-6 py-0.5 font-mono text-2xs text-fg-subtle">
            cardinal.openventure.app
          </span>
          <span className="w-10" aria-hidden />
        </div>
        <Image src={light} alt={alt} width={1440} height={838} priority={priority} className="block w-full dark:hidden" />
        <Image src={dark} alt={alt} width={1440} height={838} priority={priority} className="hidden w-full dark:block" />
      </div>
      {caption && (
        <figcaption className="mt-3 text-center text-xs text-fg-subtle">{caption}</figcaption>
      )}
    </figure>
  );
}

function OVMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-sm bg-accent font-display text-xs font-semibold text-accent-fg",
        className
      )}
    >
      OV
    </span>
  );
}

export function Landing() {
  return (
    <div className="min-h-svh bg-bg text-fg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <OVMark />
            <span className="font-display text-md font-medium">OpenVenture</span>
          </a>
          <div className="ml-auto hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-fg">How it works</a>
            <a href="#blind-votes" className="transition-colors hover:text-fg">Blind votes</a>
            <a href="#principles" className="transition-colors hover:text-fg">Principles</a>
            <a href="#open-source" className="transition-colors hover:text-fg">Open source</a>
          </div>
          <div className="ml-auto flex items-center gap-2.5 md:ml-0">
            <Link
              href="/login"
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:border-border-strong hover:bg-bg-subtle"
            >
              Partner login
            </Link>
            <a
              href={REQUEST_URL}
              className="hidden rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover sm:block"
            >
              Request access
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className={cn(styles.rise, "font-mono text-2xs tracking-[0.22em] text-fg-muted uppercase")}>
              Open source · for student-run venture funds
            </p>
            <h1
              className={cn(styles.rise, "mt-5 text-[clamp(2.75rem,7vw,4.5rem)] leading-[1.04] font-medium tracking-[-0.015em]")}
              style={{ "--d": "0.08s" } as React.CSSProperties}
            >
              Take the fund <em className="text-accent">seriously.</em>
            </h1>
            <p
              className={cn(styles.rise, "mt-6 max-w-xl text-base leading-relaxed text-fg-muted sm:text-[1.0625rem]")}
              style={{ "--d": "0.16s" } as React.CSSProperties}
            >
              OpenVenture runs your club&apos;s whole grant process — applications, screening,
              memos, blind votes, and budget-guarded grants — with the discipline of a real
              fund and none of the spreadsheet sprawl.
            </p>
            <div
              className={cn(styles.rise, "mt-8 flex flex-wrap items-center justify-center gap-3")}
              style={{ "--d": "0.24s" } as React.CSSProperties}
            >
              <a
                href={REQUEST_URL}
                className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
              >
                Request access
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:border-border-strong hover:bg-bg-subtle"
              >
                View on GitHub
                <ArrowUpRightIcon className="size-3.5 text-fg-subtle" />
              </a>
            </div>
          </div>
          <div className={cn(styles.rise, "mt-14 sm:mt-16")} style={{ "--d": "0.34s" } as React.CSSProperties}>
            <ProductFrame
              light="/marketing/pipeline-light.png"
              dark="/marketing/pipeline-dark.png"
              alt="The OpenVenture pipeline board: applications moving through Applied, Screening, Coffee Chat, Pitched Group, and Decision stages"
              priority
              caption="The pipeline board, running on fictional demo data."
            />
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y border-border bg-bg-subtle/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
                One honest pipeline.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-base text-fg-muted">
                Five stages, each with a rule attached. Declines always get a reason recorded
                and a kind, specific email within a week.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.07} className="bg-panel">
                  <div className="flex h-full flex-col gap-3 p-5">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", s.cat)} aria-hidden />
                      <span className="font-mono text-2xs text-fg-subtle">{s.n}</span>
                    </div>
                    <h3 className="text-sm font-semibold">{s.name}</h3>
                    <p className="text-xs leading-relaxed text-fg-muted">{s.copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Memos */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[2fr_3fr] lg:gap-14">
            <Reveal>
              <p className="font-mono text-2xs tracking-[0.22em] text-fg-muted uppercase">Memos</p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
                Memos that read like memos.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                Investment memos are documents, so OpenVenture sets them like documents —
                serif prose, versioned drafts, section-by-section completeness before a vote
                can open. Comments go to the author; the memo goes to the record.
              </p>
            </Reveal>
            <Reveal delay={0.1}>
              <ProductFrame
                light="/marketing/memo-light.png"
                dark="/marketing/memo-dark.png"
                alt="A grant memo in OpenVenture: serif document sections for summary, team, product and traction, with versions and comments alongside"
              />
            </Reveal>
          </div>
        </section>

        {/* Blind votes — signature */}
        <section id="blind-votes" className="border-y border-border bg-bg-subtle/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
                Sealed until reveal.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-base leading-relaxed text-fg-muted">
                While a round is open, exactly one query path can read a ballot — the one
                that runs the reveal. Members see participation, never positions, so nobody
                votes with the room.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="mt-12">
              <BallotReveal />
            </Reveal>
          </div>
        </section>

        {/* Insights */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[3fr_2fr] lg:gap-14">
            <Reveal className="order-last lg:order-first">
              <ProductFrame
                light="/marketing/insights-light.png"
                dark="/marketing/insights-dark.png"
                alt="OpenVenture insights: stage conversion funnel, applications per month, decline reasons, and sourcing attribution"
              />
            </Reveal>
            <Reveal delay={0.1}>
              <p className="font-mono text-2xs tracking-[0.22em] text-fg-muted uppercase">Insights</p>
              <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
                Every season teaches the next.
              </h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                Boards graduate every spring; the data stays. Stage conversion, why the club
                says no, which sourcing channels actually convert — carried season over
                season, so the fund gets smarter than any single class year.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Principles */}
        <section id="principles" className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <Reveal>
              <h2 className="text-center text-3xl font-medium tracking-tight sm:text-4xl">
                Rules the software keeps for you.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-center text-base text-fg-muted">
                Process survives turnover only if it&apos;s enforced by construction, not by
                whoever happens to be treasurer.
              </p>
            </Reveal>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((p, i) => (
                <Reveal key={p.name} delay={i * 0.07}>
                  <div className="border-t-2 border-accent pt-4">
                    <h3 className="font-display text-md font-medium">{p.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Open source */}
        <section id="open-source" className="border-t border-border bg-fg text-bg dark:bg-panel dark:text-fg">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <Reveal>
                <p className="font-mono text-2xs tracking-[0.22em] uppercase opacity-60">Open source</p>
                <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
                  Your fund, your Postgres.
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed opacity-75">
                  Self-host the whole suite on your own database, read every line that
                  touches your money, and fork the workflow when your club outgrows ours.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <div className="rounded-lg border border-bg/20 bg-bg/10 p-5 font-mono text-sm dark:border-border dark:bg-bg-subtle">
                  <p className="select-all">
                    <span className="opacity-50">$ </span>git clone {GITHUB_URL}.git
                  </p>
                  <p className="mt-2 opacity-50"># pnpm install · pnpm db:push · pnpm dev</p>
                </div>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium underline-offset-4 hover:underline"
                >
                  Read the source
                  <ArrowUpRightIcon className="size-3.5 opacity-60" />
                </a>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
            <Reveal>
              <h2 className="mx-auto max-w-2xl text-4xl font-medium tracking-tight sm:text-5xl">
                Bring it to your club.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base text-fg-muted">
                Tell us about your fund and we&apos;ll get a workspace set up. Already a
                member? Your partners are inside.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a
                  href={REQUEST_URL}
                  className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover"
                >
                  Request access
                </a>
                <Link
                  href="/login"
                  className="rounded-md px-6 py-3 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
                >
                  Partner login
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2.5">
            <OVMark className="size-5 text-2xs" />
            <span>OpenVenture — the open-source suite for student-run venture funds.</span>
          </div>
          <div className="flex items-center gap-5 sm:ml-auto">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
            <Link href="/login" className="hover:text-fg">Partner login</Link>
          </div>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-xs text-fg-subtle sm:px-6">
          Product screens show fictional demo data.
        </p>
      </footer>
    </div>
  );
}
