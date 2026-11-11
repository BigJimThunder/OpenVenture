import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  Check,
  CopyCheck,
  MailCheck,
  Newspaper,
  Shuffle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BallotReveal } from "./ballot-reveal";
import { Reveal } from "./reveal";
import styles from "./landing.module.css";

const GITHUB_URL = "https://github.com/BigJimThunder/OpenVenture";
const DEPLOY_URL = `${GITHUB_URL}#deploy-your-own`;

const STAGES = [
  {
    n: "01",
    name: "Application",
    cat: "bg-cat-1",
    copy: "A hosted form, or your own. It lands in the pipeline with an owner, and the founder hears back at once.",
  },
  {
    n: "02",
    name: "Screening",
    cat: "bg-cat-2",
    copy: "Scored against the club's own criteria, which live in the app and not in one officer's head.",
  },
  {
    n: "03",
    name: "Coffee chat",
    cat: "bg-cat-3",
    copy: "Two members meet the founders and log a verdict each, from their phones, on the walk back.",
  },
  {
    n: "04",
    name: "Memo and vote",
    cat: "bg-cat-4",
    copy: "The memo circulates in versions. Ballots stay sealed until a partner reveals the round.",
  },
  {
    n: "05",
    name: "Grant and outcome",
    cat: "bg-cat-5",
    copy: "Approvals are checked against the pool. Then receipts, and a check-in every term.",
  },
];

const AUTOMATIONS = [
  {
    icon: Shuffle,
    name: "Every application gets an owner",
    copy: "New applications rotate to whoever is carrying the least. Nothing sits unclaimed in a shared inbox.",
  },
  {
    icon: MailCheck,
    name: "Founders hear back",
    copy: "A confirmation the moment they apply. Decline and funding emails when you choose to switch them on.",
  },
  {
    icon: CopyCheck,
    name: "Duplicates are flagged",
    copy: "Same domain, same founder, near-identical name: flagged for a human. Never merged or declined for you.",
  },
  {
    icon: BellRing,
    name: "Votes close themselves",
    copy: "A reminder the day before, to everyone eligible. The round closes at its deadline and waits to be revealed.",
  },
  {
    icon: Newspaper,
    name: "One digest, on Monday",
    copy: "Each member gets their applications, open votes and action items in a single email. No per-event noise.",
  },
  {
    icon: CalendarClock,
    name: "Nothing quietly stalls",
    copy: "Past a stage deadline, the owner gets one nudge. Each quarter, a reminder to check in with grantees.",
  },
];

const PRINCIPLES = [
  {
    name: "Blind by construction",
    copy: "One query path reads ballots, and only at reveal. Before that there is no tally and no list of who has voted.",
  },
  {
    name: "Aggregates of five or more",
    copy: "Demographics only leave the database as groups. No per-person views, no exports, no cross-tabs.",
  },
  {
    name: "Money is decimal",
    copy: "Every dollar and share goes through exact arithmetic, pinned by golden-fixture tests. No floats, anywhere.",
  },
  {
    name: "Every action logged",
    copy: "Each change passes one gate: validated, session-checked, role-checked, written to the activity log.",
  },
];

const DEPLOY_STEPS = [
  "Click Deploy. Vercel copies the code and creates a free Postgres database.",
  "Sign in. The first person in names the club and sets this year's budget.",
  "Share your application link. The pipeline fills itself from there.",
];

const primaryCta =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent font-medium text-accent-fg shadow-xs outline-none transition-colors hover:bg-accent-hover focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";
const secondaryCta =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-panel font-medium text-fg shadow-xs outline-none transition-colors hover:border-border-strong hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40";

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
      <div className="overflow-hidden rounded-xl border border-border bg-panel shadow-lg">
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
        "inline-flex size-6 items-center justify-center rounded-md bg-accent text-2xs font-semibold text-accent-fg",
        className
      )}
    >
      OV
    </span>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-medium text-accent">{children}</p>;
}

const h2 = "text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.025em] sm:text-4xl";

/**
 * The project's front door. `applying` is set only when this deployment's
 * club has opened its application form — the page never offers a founder a
 * flow that doesn't exist.
 */
export function Landing({ applying }: { applying: { clubName: string } | null }) {
  return (
    <div className="min-h-svh bg-bg text-fg">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-bg/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="#top" className="flex items-center gap-2.5">
            <OVMark />
            <span className="text-base font-semibold tracking-tight">OpenVenture</span>
          </a>
          <div className="ml-auto hidden items-center gap-6 text-sm text-fg-muted md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-fg">How it works</a>
            <a href="#automation" className="transition-colors hover:text-fg">Automation</a>
            <a href="#blind-votes" className="transition-colors hover:text-fg">Blind votes</a>
            <a href="#open-source" className="transition-colors hover:text-fg">Open source</a>
          </div>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            <Link href="/login" className={cn(secondaryCta, "h-9 px-3 text-sm")}>
              Partner login
            </Link>
            <a href={DEPLOY_URL} className={cn(primaryCta, "hidden h-9 px-3 text-sm sm:inline-flex")}>
              Deploy your own
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-24 sm:pb-20">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p
              className={cn(
                styles.rise,
                "inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs font-medium text-fg-muted shadow-xs"
              )}
            >
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Open source · MIT licensed · Self-hosted
            </p>
            <h1
              className={cn(
                styles.rise,
                "mt-6 text-[clamp(2.25rem,6.4vw,4.25rem)] leading-[1.03] font-semibold tracking-[-0.04em]"
              )}
              style={{ "--d": "0.08s" } as React.CSSProperties}
            >
              Run your grant club <span className="text-accent">like a fund.</span>
            </h1>
            <p
              className={cn(styles.rise, "mt-5 max-w-xl text-md leading-relaxed text-fg-muted")}
              style={{ "--d": "0.16s" } as React.CSSProperties}
            >
              Applications, screening, memos, blind votes and budget-checked grants in one place.
              Built for student clubs that hand the keys to new officers every spring.
            </p>
            <div
              className={cn(styles.rise, "mt-8 flex w-full flex-col items-center justify-center gap-2.5 sm:w-auto sm:flex-row")}
              style={{ "--d": "0.24s" } as React.CSSProperties}
            >
              <a href={DEPLOY_URL} className={cn(primaryCta, "h-11 w-full px-5 text-base sm:w-auto")}>
                Deploy your own
                <ArrowRight className="size-4" />
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className={cn(secondaryCta, "h-11 w-full px-5 text-base sm:w-auto")}
              >
                View on GitHub
                <ArrowUpRight className="size-4 text-fg-subtle" />
              </a>
            </div>
            <p
              className={cn(styles.rise, "mt-4 text-sm text-fg-subtle")}
              style={{ "--d": "0.3s" } as React.CSSProperties}
            >
              Free to run on hobby tiers. About ten minutes, no terminal.
            </p>
            {applying && (
              <Link
                href="/apply"
                className={cn(
                  styles.rise,
                  "mt-6 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40"
                )}
                style={{ "--d": "0.34s" } as React.CSSProperties}
              >
                A founder? Apply for a grant from {applying.clubName}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
          <div className={cn(styles.rise, "mt-12 sm:mt-16")} style={{ "--d": "0.38s" } as React.CSSProperties}>
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
        <section id="how-it-works" className="scroll-mt-14 border-y border-border bg-bg-subtle/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>How it works</Eyebrow>
              <h2 className={cn(h2, "mt-2")}>One honest pipeline.</h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                Five stages, each with a rule attached. A decline always records a reason, which
                is what makes the end-of-year retro worth holding.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-5">
              {STAGES.map((s, i) => (
                <Reveal key={s.n} delay={i * 0.07} className="bg-panel">
                  <div className="flex h-full flex-col gap-2.5 p-5">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-2 rounded-full", s.cat)} aria-hidden />
                      <span className="tnum font-mono text-2xs text-fg-subtle">{s.n}</span>
                    </div>
                    <h3 className="text-base font-semibold">{s.name}</h3>
                    <p className="text-sm leading-relaxed text-fg-muted">{s.copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Automation */}
        <section id="automation" className="mx-auto max-w-6xl scroll-mt-14 px-4 py-16 sm:px-6 sm:py-24">
          <Reveal className="max-w-2xl">
            <Eyebrow>Automation</Eyebrow>
            <h2 className={cn(h2, "mt-2")}>The chasing is done for you.</h2>
            <p className="mt-4 text-base leading-relaxed text-fg-muted">
              Nobody joins a club to send reminder emails. One scheduled job a day does the
              remembering, and every part of it can be switched off.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {AUTOMATIONS.map((a, i) => (
              <Reveal key={a.name} delay={(i % 3) * 0.07}>
                <div className="flex gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-panel text-accent shadow-xs">
                    <a.icon className="size-4 stroke-[1.75]" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{a.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-fg-muted">{a.copy}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Memos */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-[2fr_3fr] lg:gap-14">
              <Reveal>
                <Eyebrow>Memos</Eyebrow>
                <h2 className={cn(h2, "mt-2")}>Memos that read like memos.</h2>
                <p className="mt-4 text-base leading-relaxed text-fg-muted">
                  A grant memo is a document, so it is set like one: templated sections,
                  versioned drafts, comments in the margin. A vote can&apos;t open until the memo
                  has been circulated.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <ProductFrame
                  light="/marketing/memo-light.png"
                  dark="/marketing/memo-dark.png"
                  alt="A grant memo in OpenVenture: document sections for summary, team, product and traction, with versions and comments alongside"
                />
              </Reveal>
            </div>
          </div>
        </section>

        {/* Blind votes — signature */}
        <section id="blind-votes" className="scroll-mt-14 border-y border-border bg-bg-subtle/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal className="mx-auto max-w-2xl text-center">
              <Eyebrow>Blind votes</Eyebrow>
              <h2 className={cn(h2, "mt-2")}>Sealed until reveal.</h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                While a round is open nobody sees a tally, a voter list or anyone else&apos;s
                rationale. Not partners, not admins. So nobody votes with the room.
              </p>
            </Reveal>
            <Reveal delay={0.1} className="mt-10">
              <BallotReveal />
            </Reveal>
          </div>
        </section>

        {/* Insights */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[3fr_2fr] lg:gap-14">
            <Reveal className="order-last lg:order-first">
              <ProductFrame
                light="/marketing/insights-light.png"
                dark="/marketing/insights-dark.png"
                alt="OpenVenture insights: stage conversion funnel, applications per month, decline reasons, and sourcing attribution"
              />
            </Reveal>
            <Reveal delay={0.1}>
              <Eyebrow>Insights</Eyebrow>
              <h2 className={cn(h2, "mt-2")}>Every season teaches the next.</h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                Officers graduate every spring; the record stays. Stage conversion, why the club
                says no, which sourcing channels turn into grants. The club gets smarter than any
                single class year.
              </p>
            </Reveal>
          </div>
        </section>

        {/* Principles */}
        <section id="principles" className="scroll-mt-14 border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal className="max-w-2xl">
              <Eyebrow>Principles</Eyebrow>
              <h2 className={cn(h2, "mt-2")}>Rules the software keeps for you.</h2>
              <p className="mt-4 text-base leading-relaxed text-fg-muted">
                Process survives turnover only when it is enforced by construction, not by
                whoever happens to be treasurer.
              </p>
            </Reveal>
            <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
              {PRINCIPLES.map((p, i) => (
                <Reveal key={p.name} delay={i * 0.07} className="bg-panel">
                  <div className="h-full p-5">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-fg-muted">{p.copy}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Open source */}
        <section id="open-source" className="scroll-mt-14 border-t border-border bg-fg text-bg dark:bg-panel dark:text-fg">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
              <Reveal>
                <p className="text-sm font-medium opacity-60">Open source</p>
                <h2 className={cn(h2, "mt-2")}>Your club, your database.</h2>
                <p className="mt-4 max-w-md text-base leading-relaxed opacity-75">
                  There is no OpenVenture company holding your data. You run your own copy on
                  your own Postgres, can read every line that touches the money, and can export
                  everything whenever you like.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <a
                    href={DEPLOY_URL}
                    className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-bg px-5 text-base font-medium text-fg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-bg/50 dark:bg-accent dark:text-accent-fg"
                  >
                    Deploy your own
                    <ArrowRight className="size-4" />
                  </a>
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md py-2 text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-bg/50"
                  >
                    Read the source
                    <ArrowUpRight className="size-3.5 opacity-60" />
                  </a>
                </div>
              </Reveal>
              <Reveal delay={0.1}>
                <ol className="flex flex-col gap-px overflow-hidden rounded-xl border border-bg/15 bg-bg/15 dark:border-border dark:bg-border">
                  {DEPLOY_STEPS.map((step, i) => (
                    <li key={step} className="flex gap-3.5 bg-fg p-4 text-base leading-relaxed dark:bg-bg-subtle">
                      <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full border border-bg/25 font-mono text-xs dark:border-border-strong">
                        {i + 1}
                      </span>
                      <span className="opacity-85">{step}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-3 flex items-center gap-1.5 text-sm opacity-60">
                  <Check className="size-3.5" aria-hidden />
                  Vercel Hobby, Neon and Resend free tiers cover a 15-person club.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-24">
            <Reveal>
              <h2 className="mx-auto max-w-2xl text-4xl leading-[1.08] font-semibold tracking-[-0.035em] sm:text-5xl">
                Bring it to your club.
              </h2>
              <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-fg-muted">
                Deploy a copy for your club this afternoon. Already a member of one? Your
                partners are inside.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
                <a href={DEPLOY_URL} className={cn(primaryCta, "h-11 w-full px-5 text-base sm:w-auto")}>
                  Deploy your own
                  <ArrowRight className="size-4" />
                </a>
                <Link href="/login" className={cn(secondaryCta, "h-11 w-full px-5 text-base sm:w-auto")}>
                  Partner login
                </Link>
              </div>
              {applying && (
                <p className="mt-5 text-sm text-fg-muted">
                  Looking for funding?{" "}
                  <Link href="/apply" className="font-medium text-accent underline-offset-4 hover:underline">
                    Apply for a grant from {applying.clubName}
                  </Link>
                </p>
              )}
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2.5">
            <OVMark className="size-5" />
            <span>OpenVenture. Open-source software for student grant clubs.</span>
          </div>
          <div className="flex items-center gap-5 sm:ml-auto">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="hover:text-fg">GitHub</a>
            <a href={DEPLOY_URL} className="hover:text-fg">Deploy</a>
            {applying && <Link href="/apply" className="hover:text-fg">Apply</Link>}
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
