import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  Check,
  Coffee,
  FileText,
  HandCoins,
  Inbox,
  ListChecks,
  Vote,
} from "lucide-react";
import { getCtx } from "@/lib/actions/context";
import { appUrl } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getSetupProgress } from "@/lib/queries/setup-progress";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { Button } from "@/components/ui/button";
import { ChecklistVisibilityButton, CopyLinkButton } from "./welcome-actions";

export const metadata: Metadata = { title: "Getting started" };

/**
 * The path one application takes. Written to be read aloud in a handover:
 * each step says who does it, where, and what the app does without being asked.
 */
const WEEK = [
  {
    icon: Inbox,
    title: "A founder applies",
    body: "Through your application form, or a member adds one by hand. It lands in Applied.",
    auto: "Assigned to the next member in rotation. The founder gets a confirmation email.",
    href: "/pipeline",
    link: "Pipeline",
  },
  {
    icon: ListChecks,
    title: "The owner screens it",
    body: "Ten minutes: read it, score it against the club's criteria, then advance it or decline with a reason.",
    auto: "If it sits past the stage deadline, the owner gets one nudge.",
    href: "/inbox",
    link: "Inbox",
  },
  {
    icon: Coffee,
    title: "Two members have a coffee chat",
    body: "Half an hour with the founders. Both members log a verdict from their phones afterwards.",
    auto: "The stage won't advance until two attendees have logged it.",
    href: "/pipeline",
    link: "Pipeline",
  },
  {
    icon: FileText,
    title: "Someone writes the memo",
    body: "A short document from the club's template: team, traction, use of funds, risks, recommendation.",
    auto: "Drafts are versioned. A vote can't open on an uncirculated memo.",
    href: "/memos",
    link: "Memos",
  },
  {
    icon: Vote,
    title: "The club votes, blind",
    body: "Everyone eligible votes with a rationale. Nobody sees a tally or who voted how until a partner reveals.",
    auto: "A reminder goes out the day before. The round closes itself at the deadline.",
    href: "/memos",
    link: "Memos",
  },
  {
    icon: HandCoins,
    title: "An admin approves the grant",
    body: "Approve, issue, mark it cashed, attach receipts. Declines get a reason and a kind note.",
    auto: "An approval that would overdraw the year's pool is blocked.",
    href: "/grants",
    link: "Grants",
  },
  {
    icon: CalendarClock,
    title: "You check in each term",
    body: "A two-line update on how the company is doing. It is most of what next year's report is made of.",
    auto: "The owner is reminded once a quarter for every funded company.",
    href: "/outcomes",
    link: "Outcomes",
  },
] as const;

export default async function WelcomePage() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const isAdmin = can(ctx.member.role, "manageClub");
  const settings = orgSettings(ctx.org);
  const progress = isAdmin ? await getSetupProgress(ctx.org) : null;
  const nextStep = progress?.steps.find((s) => !s.done);
  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;
  const applyUrl = appUrl("/apply");
  const scheduled = Boolean(process.env.CRON_SECRET);
  const emailing = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow="Getting started"
        title={`Welcome to ${ctx.org.name}`}
        description={
          isAdmin
            ? "A short list to get the club running, and the one-page version of how a week works. Hand this page to whoever takes over from you."
            : "The one-page version of how an application moves through the club, and where you come in."
        }
      />

      <div className="flex max-w-3xl flex-col gap-8 px-4 md:px-6">
        {progress && (
          <section aria-labelledby="checklist-heading" className="rounded-xl border border-border bg-panel shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3.5 sm:px-5">
              <div className="min-w-0">
                <h2 id="checklist-heading" className="text-base font-semibold">
                  {progress.complete ? "You're set up" : "Set up your club"}
                </h2>
                <p className="tnum mt-0.5 text-sm text-fg-muted">
                  {progress.complete
                    ? "Everything on the list is done."
                    : `${progress.done} of ${progress.total} done${nextStep ? `. Next: ${nextStep.title.toLowerCase()}.` : ""}`}
                </p>
              </div>
              <ChecklistVisibilityButton dismissed={progress.dismissed} />
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                aria-label="Setup progress"
                className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle"
              >
                <div
                  className={cn("h-full rounded-full transition-[width]", progress.complete ? "bg-success" : "bg-accent")}
                  style={{ width: `${Math.max(percent, 3)}%` }}
                />
              </div>
            </div>
            <ol>
              {progress.steps.map((step) => {
                const isNext = step.key === nextStep?.key;
                return (
                  <li
                    key={step.key}
                    className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="flex min-w-0 flex-1 gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                          step.done
                            ? "bg-success text-accent-fg"
                            : isNext
                              ? "border-2 border-accent"
                              : "border border-border-strong"
                        )}
                      >
                        {step.done && <Check className="size-3 stroke-[3]" />}
                      </span>
                      <div className="min-w-0">
                        <div className={cn("text-base font-medium", step.done && "text-fg-muted")}>
                          {step.title}
                          <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-fg-muted">{step.description}</p>
                      </div>
                    </div>
                    <Button
                      asChild
                      variant={isNext ? "default" : step.done ? "ghost" : "secondary"}
                      className="shrink-0 max-sm:ml-8 max-sm:h-10 max-sm:self-start"
                    >
                      <Link href={step.href}>
                        {step.done ? "Review" : step.cta}
                        {isNext && <ArrowRight />}
                      </Link>
                    </Button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {isAdmin && settings.apply.enabled && (
          <section className="flex flex-col gap-3 rounded-xl border border-border bg-panel p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Your application form is open</h2>
              <p className="mt-0.5 truncate font-mono text-xs text-fg-muted">{applyUrl}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <CopyLinkButton url={applyUrl} label="Copy link" />
              <Button asChild variant="ghost" size="sm" className="max-md:h-10">
                <Link href="/apply" target="_blank">
                  Preview
                </Link>
              </Button>
            </div>
          </section>
        )}

        <section aria-labelledby="week-heading">
          <h2 id="week-heading" className="text-md font-semibold tracking-tight">
            What a week looks like
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-fg-muted">
            Every application takes the same seven steps. The grey line under each is what the
            app does on its own, so nobody has to remember it.
          </p>
          <ol className="mt-5">
            {WEEK.map((step, i) => (
              <li key={step.title} className="relative flex gap-3.5 pb-6 last:pb-0">
                {i < WEEK.length - 1 && (
                  <span aria-hidden className="absolute bottom-0 left-[15px] top-9 w-px bg-border" />
                )}
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-panel text-fg-muted shadow-xs"
                >
                  <step.icon className="size-4 stroke-[1.75]" />
                </span>
                <div className="min-w-0 pt-1">
                  <h3 className="text-base font-medium">
                    <span className="tnum mr-1.5 text-fg-subtle">{i + 1}</span>
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg-subtle">{step.auto}</p>
                  <Link
                    href={step.href}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-sm text-sm font-medium text-accent underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-1.5"
                  >
                    Open {step.link}
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="rhythm-heading" className="rounded-xl border border-border bg-bg-subtle/50 p-4 sm:p-5">
          <h2 id="rhythm-heading" className="text-base font-semibold">
            What lands in your inbox
          </h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm leading-relaxed text-fg-muted">
            <li>
              <span className="font-medium text-fg">Monday morning:</span> one digest with your
              applications, open votes, action items and the next meeting.
            </li>
            <li>
              <span className="font-medium text-fg">The day before a vote closes:</span> a reminder
              to everyone eligible. The app can&apos;t see who has voted, so it goes to all.
            </li>
            <li>
              <span className="font-medium text-fg">When something stalls:</span> one nudge per
              application per stage, to its owner.
            </li>
          </ul>
          {isAdmin && (!scheduled || !emailing) && (
            <p className="mt-4 rounded-lg border border-warning-border bg-warning-bg px-3.5 py-2.5 text-sm leading-relaxed text-fg">
              {!emailing
                ? "Email isn't connected yet, so none of this is being sent. "
                : "The daily schedule isn't protected by a CRON_SECRET yet, so none of this runs. "}
              <Link href="/settings#email" className="font-medium underline underline-offset-2">
                Finish connecting it
              </Link>{" "}
              or check{" "}
              <a href="/api/health" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                the health report
              </a>
              .
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
