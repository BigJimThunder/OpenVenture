import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SkipLink } from "@/components/patterns/skip-link";
import { LedgerDemo } from "./ledger-demo";
import { SealedVote } from "./sealed-vote";
import styles from "./landing.module.css";

const GITHUB_URL = "https://github.com/BigJimThunder/OpenVenture";
const DEPLOY_URL = `${GITHUB_URL}#deploy-your-own`;

/**
 * The project's front door, written as the thing the product exists to
 * replace: the handover memo a graduating officer never quite leaves behind.
 *
 * It is a document, so it is set like one (the serif the app reserves for
 * memos and letters), and its claims are exhibits a visitor can operate
 * rather than screenshots to take on trust. Everything named in it — the
 * club, its members, the companies, the numbers — is fictional; everything
 * it says the software does, the software does.
 */

const ENCLOSED = [
  { letter: "A", href: "#vote", text: "A vote you can cast" },
  { letter: "B", href: "#budget", text: "A budget that says no" },
  { letter: "C", href: "#paper", text: "A memo, the way we write them" },
  { letter: "D", href: "#chasing", text: "A week of chasing, already done" },
  { letter: "E", href: "#yours", text: "How to make it yours" },
];

const DECLINES = [
  { reason: "Too early", n: 6 },
  { reason: "Not a fit", n: 4 },
  { reason: "Outside our criteria", n: 3 },
  { reason: "Team", n: 2 },
  { reason: "Went quiet", n: 1 },
];

const WEEK = [
  {
    when: "Mon 08:00",
    what: "Digest",
    text: "One email each to 14 members: their applications, their open votes, their overdue action items. Nothing for the member with nothing waiting.",
  },
  {
    when: "Tue 14:12",
    what: "Intake",
    text: "APP-22 arrives through the form. It goes to Marcus, who is next in the rotation, and the founder gets a confirmation.",
  },
  {
    when: "Tue 14:12",
    what: "Flag",
    text: "Same website as an application from last spring. Flagged for a person to look at. Nothing is merged or declined for you.",
  },
  {
    when: "Wed 08:00",
    what: "Reminder",
    text: "The Lecture Loop vote closes tomorrow. Three members who haven't voted hear about it. Nobody else learns who they are.",
  },
  {
    when: "Thu 17:00",
    what: "Deadline",
    text: "Voting ends on the minute. The ballots stay sealed until a partner reveals them.",
  },
  {
    when: "Fri 08:00",
    what: "Nudge",
    text: "Solara Labs has sat in Coffee Chat for 19 days against a target of 14. Its owner is told, once.",
  },
];

const INVENTORY = [
  ["Applications, each with its owner and history", "22"],
  ["Declines, each with the reason we gave", "16"],
  ["Grant memos, every version and comment", "6"],
  ["Blind votes, revealed and decided", "5"],
  ["Grants, reconciled against receipts", "$7,800"],
  ["Things you have to remember to do", "0"],
];

const STEPS = [
  ["Click Deploy.", "Vercel copies the code into your own GitHub account and creates a free Postgres database."],
  ["Sign in.", "The first person in names the club and sets this year's budget."],
  ["Share one link.", "Founders apply, and the pipeline fills from there."],
];

const cta =
  "inline-flex h-12 items-center justify-center gap-2 rounded-md px-6 text-base font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2";
const inkLink =
  "inline-flex min-h-11 items-center gap-1.5 text-base font-medium underline decoration-fg/30 underline-offset-[5px] outline-none transition-colors hover:decoration-fg focus-visible:decoration-accent focus-visible:decoration-2";

function OVMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md bg-accent text-2xs font-semibold text-accent-fg",
        className
      )}
    >
      OV
    </span>
  );
}

/** A numbered section of the memo: the number hangs in the margin, as on a legal pad. */
function Section({
  n,
  id,
  aside,
  title,
  children,
}: {
  n: string;
  id: string;
  /** A short marginal note. */
  aside: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-border">
      <div className="mx-auto grid max-w-[76rem] gap-x-10 gap-y-6 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:py-28">
        <div className="lg:col-span-3">
          <div className="flex items-baseline gap-3 lg:sticky lg:top-8 lg:block">
            <p className="font-display text-2xl text-fg-subtle lg:text-4xl">§{n}</p>
            <p className={cn(styles.label, "max-w-[14rem] text-fg-subtle lg:mt-3")}>{aside}</p>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-9">
          <h2 id={`${id}-title`} className={styles.heading}>
            {title}
          </h2>
          {children}
        </div>
      </div>
    </section>
  );
}

function Exhibit({
  letter,
  title,
  children,
  className,
}: {
  letter: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("mt-10 rounded-lg border border-border-strong bg-panel shadow-md", className)}>
      <figcaption className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3 sm:px-8">
        <span className={cn(styles.label, "whitespace-nowrap")}>Exhibit {letter}</span>
        <span className="text-right text-sm text-fg-muted">{title}</span>
      </figcaption>
      <div className="p-5 sm:p-8">{children}</div>
    </figure>
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
  return (
    <div className="min-h-svh bg-bg text-fg">
      <SkipLink href="#top" />

      <header className="mx-auto flex h-16 max-w-[76rem] items-center gap-5 px-5 sm:px-8">
        <a href="#top" className="flex h-11 items-center gap-2.5 outline-none focus-visible:underline">
          <OVMark />
          <span className="text-base font-semibold tracking-tight">OpenVenture</span>
        </a>
        <nav aria-label="Site" className="ml-auto flex items-center gap-5 text-sm sm:gap-7">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden min-h-11 items-center text-fg-muted outline-none hover:text-fg focus-visible:underline sm:inline-flex"
          >
            Source
          </a>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center text-fg-muted outline-none hover:text-fg focus-visible:underline"
          >
            {demo ? "Live demo" : "Partner login"}
          </Link>
          <a
            href={DEPLOY_URL}
            className="inline-flex h-9 items-center rounded-md bg-fg px-3.5 font-medium text-bg outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Deploy
          </a>
        </nav>
      </header>

      <main id="top" tabIndex={-1} className="outline-none">
        {/* The memo's head */}
        <section className="mx-auto max-w-[76rem] px-5 pb-16 pt-6 sm:px-8 sm:pt-10 lg:pb-24">
          <div className="flex items-baseline justify-between gap-4 border-b-2 border-fg pb-3">
            <p className={styles.label}>Memorandum</p>
            <p className={cn(styles.label, "text-fg-subtle")}>MEM-001 · Handover</p>
          </div>

          <div className="relative">
            <dl className="mt-6 grid grid-cols-[4.25rem_1fr] gap-y-2 text-base sm:grid-cols-[7rem_1fr]">
              <dt className={cn(styles.label, "pt-1 text-fg-subtle")}>To</dt>
              <dd>Whoever runs the club next year</dd>
              <dt className={cn(styles.label, "pt-1 text-fg-subtle")}>From</dt>
              <dd>The officers who are about to graduate</dd>
            </dl>
            {/* The wrapper owns visibility: .stamp sets its own display. */}
            <div aria-hidden className="absolute right-1 top-0 hidden text-danger md:block">
              <span className={cn(styles.stamp, styles.stampLarge)}>Read before September</span>
            </div>
          </div>

          <div className="mt-6 grid gap-y-2 sm:mt-8 sm:grid-cols-[7rem_1fr]">
            <p className={cn(styles.label, "text-fg-subtle sm:pt-5")} aria-hidden>
              Re
            </p>
            <h1 className={styles.display}>
              Everything we know <em>leaves</em> in May.
            </h1>
          </div>

          {/* Indented to the headline's left edge: the label column is the margin. */}
          <div className="mt-10 grid gap-x-12 gap-y-10 sm:mt-14 sm:pl-[7rem] lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="max-w-[41rem]">
              <p className={styles.lede}>
                We ran ten thousand dollars a year through a spreadsheet, a Notion page, three Google
                Forms and a group chat. It worked because we remembered how. You won&apos;t have us.
              </p>
              <p className={cn(styles.lede, "mt-4 text-fg-muted")}>
                So this is the whole operation in one place: applications, screening, memos, blind
                votes and a budget that checks itself. It is open source, it runs on your own
                database, and it keeps the rules so that nobody has to remember them.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
                {demo ? (
                  <Link
                    href="/login"
                    className={cn(cta, "bg-accent text-accent-fg hover:bg-accent-hover focus-visible:ring-offset-bg")}
                  >
                    Explore the live demo
                    <ArrowRight className="size-4" aria-hidden />
                  </Link>
                ) : (
                  <a
                    href={DEPLOY_URL}
                    className={cn(cta, "bg-accent text-accent-fg hover:bg-accent-hover focus-visible:ring-offset-bg")}
                  >
                    Deploy your own
                    <ArrowRight className="size-4" aria-hidden />
                  </a>
                )}
                {demo ? (
                  <a href={DEPLOY_URL} className={inkLink}>
                    Deploy your own
                  </a>
                ) : (
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={inkLink}>
                    Read the source
                    <ArrowUpRight className="size-4 text-fg-subtle" aria-hidden />
                  </a>
                )}
              </div>
              <p className={cn(styles.label, "mt-5 text-fg-subtle")}>
                Free on hobby tiers · about ten minutes · no terminal
              </p>
              {applying && (
                <p className="mt-6 text-sm text-fg-muted">
                  A founder looking for a grant?{" "}
                  <Link
                    href="/apply"
                    className="font-medium text-fg underline decoration-fg/30 underline-offset-4 hover:decoration-fg"
                  >
                    Apply to {applying.clubName}
                  </Link>
                </p>
              )}
            </div>

            <nav aria-label="In this memo">
              <p className={cn(styles.label, "border-b border-border-strong pb-2 text-fg-subtle")}>Enclosed</p>
              <ol>
                {ENCLOSED.map((item) => (
                  <li key={item.letter} className="border-b border-border">
                    <a
                      href={item.href}
                      className="group flex min-h-11 items-baseline gap-3 py-2.5 text-sm outline-none focus-visible:underline"
                    >
                      <span className={cn(styles.label, "w-4 text-fg-subtle")}>{item.letter}</span>
                      <span className="underline-offset-4 group-hover:underline">{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>
        </section>

        {/* The product itself, before any argument */}
        <section aria-label="The app" className="mx-auto max-w-[84rem] px-3 pb-16 sm:px-6 lg:pb-28">
          <figure className="m-0">
            <div className="overflow-hidden rounded-lg border border-border-strong bg-panel shadow-lg">
              <Image
                src="/marketing/pipeline-light.png"
                alt="The pipeline board: applications as cards in columns for Applied, Screening, Coffee Chat, Pitched Group and Decision, each with an owner, an amount and its days in stage."
                width={1440}
                height={838}
                priority
                sizes="(min-width: 1344px) 1296px, 100vw"
                className="block w-[190%] max-w-none sm:w-full dark:hidden"
              />
              <Image
                src="/marketing/pipeline-dark.png"
                alt="The pipeline board: applications as cards in columns for Applied, Screening, Coffee Chat, Pitched Group and Decision, each with an owner, an amount and its days in stage."
                width={1440}
                height={838}
                priority
                sizes="(min-width: 1344px) 1296px, 100vw"
                className="hidden w-[190%] max-w-none sm:w-full dark:block"
              />
            </div>
            <figcaption className={cn(styles.label, "mt-3 px-2 text-fg-subtle")}>
              Fig. 1 · The pipeline on an ordinary Tuesday. The club and its companies are fictional.
            </figcaption>
          </figure>
        </section>

        <Section n="1" id="vote" aside="How we decide" title="The loudest person in the room used to decide.">
          <div className={cn(styles.prose, "mt-5 max-w-[42rem]")}>
            <p>
              We&apos;d go around the table, the first confident opinion would land, and everyone after
              it would agree a little. So now every ballot is sealed until a partner reveals the
              round. You commit to what you think before you find out what anyone else does.
            </p>
            <p className="mt-4 text-fg-muted">Try it. Here is a pitch, and six ballots already in.</p>
          </div>
          <Exhibit letter="A" title="A blind vote, with you as the seventh member">
            <SealedVote />
          </Exhibit>
        </Section>

        <Section n="2" id="budget" aside="How we don't overspend" title="Nobody types the number that's left.">
          <div className={cn(styles.prose, "mt-5 max-w-[42rem]")}>
            <p>
              Our remaining budget lived in a cell that someone updated by hand, when they remembered.
              Here it is worked out from the grants themselves, every time, and an approval that would
              take the pool below zero is refused. That holds even when two of you click at once.
            </p>
            <p className="mt-4 text-fg-muted">The vote below came back in favor. There is one problem.</p>
          </div>
          <Exhibit letter="B" title="The grant ledger, with $2,200 left">
            <LedgerDemo />
          </Exhibit>
        </Section>

        <Section n="3" id="paper" aside="How we write it down" title="Write down why, especially when it's no.">
          <div className={cn(styles.prose, "mt-5 max-w-[42rem]")}>
            <p>
              A grant memo here is a document: required sections, numbered versions, comments in the
              margin. A vote can&apos;t open on one that hasn&apos;t been circulated. And a decline
              can&apos;t be saved without its reason, which by spring is the most useful thing you
              will own.
            </p>
          </div>
          <Exhibit letter="C" title="A memo in its second version, and a year of reasons">
            <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
              <article>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                  <p className={cn(styles.label, "text-fg-subtle")}>MEM-3 · Version 2 · Marcus Chen</p>
                  <span className={cn(styles.stamp, "text-accent")}>Circulated</span>
                </div>
                <h3 className="mt-3 font-display text-[1.75rem] font-medium leading-tight tracking-tight">
                  Lecture Loop: grant memo
                </h3>
                <p className="mt-1.5 text-sm text-fg-muted">
                  Recommendation: fund · <span className="tnum">$2,400</span> proposed of{" "}
                  <span className="tnum">$2,400</span> requested
                </p>
                <div className="mt-6 space-y-5 font-display text-[1.0625rem] leading-[1.65]">
                  <div>
                    <h4 className={cn(styles.label, "text-fg-subtle")}>Summary</h4>
                    <p className="mt-1.5">
                      Note-taking that syncs with the course catalog. Two sophomores, a working
                      product, and sixty weekly users they can name. They want $2,400 to incorporate
                      and to cover a semester of API costs.
                    </p>
                  </div>
                  <div>
                    <h4 className={cn(styles.label, "text-fg-subtle")}>Risks</h4>
                    <p className="mt-1.5">
                      <mark className="rounded-sm bg-warning-bg px-0.5 text-fg">
                        Usage is real but small, and most of it is friends.
                      </mark>{" "}
                      The honest read is that this is early even by our standards, and the grant is
                      exactly what gets them past a specific blocker.
                    </p>
                  </div>
                </div>
                <div className="mt-5 border-l-2 border-warning-border pl-4">
                  <p className={cn(styles.label, "text-fg-subtle")}>Comment · Priya Raman</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">
                    &ldquo;Friends&rdquo; is carrying a lot here. How many of the sixty did they not
                    already know?
                  </p>
                </div>
              </article>

              <div>
                <h3 className={cn(styles.label, "border-b border-border-strong pb-2 text-fg-subtle")}>
                  Why we said no, this year
                </h3>
                <ul className="mt-1">
                  {DECLINES.map((d) => (
                    <li key={d.reason} className="border-b border-border py-2.5">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span>{d.reason}</span>
                        <span className="tnum font-medium">{d.n}</span>
                      </div>
                      <div aria-hidden className="mt-1.5 h-1 rounded-full bg-bg-subtle">
                        <div className="h-full rounded-full bg-fg-subtle" style={{ width: `${(d.n / 6) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                  Sixteen declines, sixteen reasons. If &ldquo;too early&rdquo; keeps winning, the
                  club is being found by the wrong founders, and that is a thing you can fix.
                </p>
              </div>
            </div>
          </Exhibit>
        </Section>

        <Section n="4" id="chasing" aside="What it does on its own" title="Nobody joined a venture club to send reminder emails.">
          <div className={cn(styles.prose, "mt-5 max-w-[42rem]")}>
            <p>
              One of us spent an evening a week nudging people. That job is gone. New applications get
              an owner, votes close on their deadline, and anything stuck gets one nudge, sent to the
              person who can unstick it.
            </p>
          </div>
          <Exhibit letter="D" title="One week, without anyone asking">
            <ol className="-my-3">
              {WEEK.map((entry, i) => (
                <li
                  key={i}
                  className="grid gap-x-6 gap-y-1 border-b border-border py-3.5 last:border-b-0 sm:grid-cols-[6.5rem_5.5rem_1fr]"
                >
                  <span className="tnum font-mono text-xs text-fg-subtle sm:pt-0.5">{entry.when}</span>
                  <span className={cn(styles.label, "sm:pt-1")}>{entry.what}</span>
                  <span className="text-[0.9375rem] leading-relaxed text-fg-muted">{entry.text}</span>
                </li>
              ))}
            </ol>
          </Exhibit>
          <p className="mt-5 max-w-[42rem] text-sm text-fg-muted">
            Each of these has its own switch, and each message is sent once. Any member can turn the
            digest or the reminders off for themselves.
          </p>
        </Section>

        <Section n="5" id="inherit" aside="What we're leaving you" title="In September you sign in, and it is all where we left it.">
          <div className="mt-8 grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
            <ul>
              {INVENTORY.map(([what, n]) => (
                <li key={what} className="flex items-baseline gap-3 border-b border-border py-3">
                  <span className="font-display text-lg leading-snug">{what}</span>
                  <span aria-hidden className="mb-1 min-w-6 flex-1 self-end border-b border-dotted border-border-strong" />
                  <span className="tnum font-display text-2xl font-medium">{n}</span>
                </li>
              ))}
            </ul>
            <div className={cn(styles.prose, "text-fg-muted")}>
              <p>
                That is one fictional year. Yours will have different numbers and the same shape:
                the record survives because the software kept it, and the process survives because
                the software enforces it.
              </p>
              <p className="mt-4">
                The annual report, the quarterly letter to whoever funds you and the funding request
                for each grant are all built from this record. You write the judgment. The numbers
                are already there.
              </p>
            </div>
          </div>
        </Section>

        {/* Making it yours */}
        <section id="yours" aria-labelledby="yours-title" className="scroll-mt-6 bg-fg text-bg">
          <div className="mx-auto grid max-w-[76rem] gap-x-10 gap-y-8 px-5 py-16 sm:px-8 lg:grid-cols-12 lg:py-28">
            <div className="lg:col-span-3">
              <div className="flex items-baseline gap-3 lg:block">
                <p className="font-display text-2xl text-bg/70 lg:text-4xl">§6</p>
                <p className={cn(styles.label, "text-bg/70 lg:mt-3")}>Making it yours</p>
              </div>
            </div>
            <div className="min-w-0 lg:col-span-9">
              <h2 id="yours-title" className={styles.heading}>
                There is no OpenVenture company.
              </h2>
              <div className={cn(styles.prose, "mt-5 max-w-[42rem] text-bg/80")}>
                <p>
                  Nothing to subscribe to and nobody in the middle. You run your own copy on your own
                  database, you can read every line that touches the money, and you can export all of
                  it whenever you like. The license is MIT.
                </p>
              </div>
              <ol className="mt-10 grid gap-x-8 gap-y-6 border-t border-bg/25 pt-8 md:grid-cols-3">
                {STEPS.map(([lead, rest], i) => (
                  <li key={lead}>
                    <p className="font-display text-4xl text-bg/70">{i + 1}</p>
                    <p className="mt-2 text-base leading-relaxed">
                      <span className="font-semibold">{lead}</span> <span className="text-bg/80">{rest}</span>
                    </p>
                  </li>
                ))}
              </ol>
              <div className="mt-10 flex flex-wrap items-center gap-x-7 gap-y-3">
                <a
                  href={DEPLOY_URL}
                  className={cn(cta, "bg-bg text-fg hover:opacity-90 focus-visible:ring-bg focus-visible:ring-offset-fg")}
                >
                  Deploy your own
                  <ArrowRight className="size-4" aria-hidden />
                </a>
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center gap-1.5 text-base font-medium underline decoration-bg/40 underline-offset-[5px] outline-none hover:decoration-bg focus-visible:decoration-2"
                >
                  Read the source
                  <ArrowUpRight className="size-4" aria-hidden />
                </a>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center text-base font-medium underline decoration-bg/40 underline-offset-[5px] outline-none hover:decoration-bg focus-visible:decoration-2"
                >
                  {demo ? "Explore the demo" : "Partner login"}
                </Link>
              </div>
              <p className={cn(styles.label, "mt-6 text-bg/70")}>
                Vercel Hobby, Neon and Resend free tiers cover a fifteen-person club
              </p>

              <div className="mt-16 border-t border-bg/25 pt-8">
                <p className="font-display text-2xl italic leading-snug sm:text-3xl">
                  Good luck. Keep the receipts.
                </p>
                <p className={cn(styles.label, "mt-3 text-bg/70")}>The outgoing officers</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[76rem] flex-col gap-4 px-5 py-8 text-sm text-fg-muted sm:flex-row sm:items-center sm:px-8">
        <div className="flex items-center gap-2.5">
          <OVMark className="size-5" />
          <span>OpenVenture. Open-source software for student grant clubs.</span>
        </div>
        <div className="-my-2 flex items-center gap-5 sm:ml-auto">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="py-2 hover:text-fg">
            GitHub
          </a>
          {applying && (
            <Link href="/apply" className="py-2 hover:text-fg">
              Apply
            </Link>
          )}
          <Link href="/privacy" className="py-2 hover:text-fg">
            Privacy
          </Link>
          <Link href="/login" className="py-2 hover:text-fg">
            Partner login
          </Link>
        </div>
      </footer>
      <p className="mx-auto max-w-[76rem] px-5 pb-8 text-xs text-fg-subtle sm:px-8">
        P.S. Cardinal Ventures, its members and every company named on this page are fictional. The
        software is real.
      </p>
    </div>
  );
}
