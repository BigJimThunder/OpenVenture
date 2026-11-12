"use client";

import * as React from "react";
import { Check, Lock, MessageSquare, RotateCcw, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, BarTitle, Chip, Window, styles, ui } from "../kit";

type Version = 1 | 2;
type Stage = "draft" | "circulated" | "voting";

/** What changed between versions is marked, the way the app's version diff does it. */
function Changed({ children }: { children: React.ReactNode }) {
  return <mark className="rounded-[3px] bg-warning-bg box-decoration-clone px-0.5 text-fg">{children}</mark>;
}

/** The two passages that differ. Everything else in the memo is the same in both. */
const RISKS: Record<Version, React.ReactNode> = {
  1: "Sixty students use it every week, but most of them are friends of the founders. Whether anyone outside that circle wants it is unproven.",
  2: (
    <>
      Sixty students use it every week.{" "}
      <Changed>Forty-nine are friends of the founders and eleven found it on their own.</Changed> Demand beyond
      that circle is still thin.
    </>
  ),
};
const FUNDS: Record<Version, React.ReactNode> = {
  1: "The grant covers incorporation and a semester of API costs. Nothing goes to salaries.",
  2: (
    <>
      <Changed>
        <span className="tnum">$900</span> covers incorporation and <span className="tnum">$1,500</span> covers a
        semester of API costs.
      </Changed>{" "}
      Nothing goes to salaries.
    </>
  ),
};

/**
 * A grant memo as the app keeps it: numbered versions, a comment in the
 * margin, a completion check, and the gate. A vote cannot open on a memo
 * nobody has been sent.
 */
export function MemoDemo() {
  const [version, setVersion] = React.useState<Version>(2);
  const [stage, setStage] = React.useState<Stage>("draft");
  const circulateButton = React.useRef<HTMLButtonElement>(null);
  const voteButton = React.useRef<HTMLButtonElement>(null);

  // The pressed button goes inert, so hand keyboard focus to the next action.
  function go(next: Stage, focus: React.RefObject<HTMLButtonElement | null>) {
    setStage(next);
    requestAnimationFrame(() => focus.current?.focus());
  }

  return (
    <Window
      className="h-full min-w-0"
      bar={
        <>
          <BarTitle meta="MEM-3 · Marcus Chen">
            Lecture Loop<span className="max-sm:sr-only">: grant memo</span>
          </BarTitle>
          <div className="ml-auto flex shrink-0 items-center gap-2.5">
            <div role="group" aria-label="Memo version" className="flex rounded-md border border-border-strong p-0.5 text-xs">
              {([1, 2] as Version[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={version === v}
                  aria-label={`Version ${v}`}
                  onClick={() => setVersion(v)}
                  className={cn(
                    "tnum relative h-6 min-w-8 cursor-pointer rounded-[5px] px-2 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60",
                    "max-md:min-w-11 max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-2.5",
                    version === v ? "bg-bg-subtle text-fg" : "text-fg-muted hover:text-fg"
                  )}
                >
                  v{v}
                </button>
              ))}
            </div>
            {stage === "draft" ? (
              <Chip>Draft</Chip>
            ) : (
              <Chip tone="success" className={styles.pop}>
                Circulated
              </Chip>
            )}
          </div>
        </>
      }
    >
      <div className="grid gap-x-7 gap-y-7 p-5 sm:p-6 md:grid-cols-[minmax(0,13fr)_minmax(0,8fr)]">
        {/* The document */}
        <article aria-label={`Grant memo, version ${version}`} className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs text-fg-muted">
            <p className="tnum">
              Version {version} of 2 · {version === 2 ? "edited yesterday" : "saved 3 days ago"}
            </p>
            <p className="inline-flex items-center gap-1.5">
              {version === 2 ? (
                <>
                  <span aria-hidden className="size-2.5 rounded-[3px] border border-warning-border bg-warning-bg" />
                  Changed since v1
                </>
              ) : (
                "Earlier wording"
              )}
            </p>
          </div>

          <div className="mt-3 font-display">
            <p className="rounded-md border border-success-border bg-success-bg px-3 py-1.5 text-[0.9375rem] leading-snug text-fg">
              <span className="font-semibold text-success">Recommendation: fund</span>
              <span className="tnum"> · $2,400 of $2,400 requested</span>
            </p>

            <Section title="Summary">
              Lecture Loop files notes from lecture recordings under the right course. The product works today.
            </Section>
            <Section title="Team">
              Two sophomores, Ana Ortiz and Devin Park, built it in one semester. Neither has run a company
              before.
            </Section>
            <Section
              title="Risks"
              aside={
                <span className="inline-flex items-center gap-1 font-sans text-2xs text-fg-muted">
                  <MessageSquare className="size-3" aria-hidden />
                  <span className="tnum">1</span>
                  <span className="sr-only">comment</span>
                </span>
              }
            >
              <Versions version={version} of={RISKS} />
            </Section>
            <Section title="Use of funds">
              <Versions version={version} of={FUNDS} />
            </Section>
          </div>
        </article>

        {/* The rail: completion, the margin comment, the gate */}
        <div className="flex min-w-0 flex-col gap-5 md:border-l md:border-border md:pl-7">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className={styles.label}>Completion</p>
              <p className="tnum inline-flex items-center gap-1 text-xs text-fg-muted">
                <Check className="size-3 text-success" strokeWidth={3} aria-hidden />4 of 4 required sections
              </p>
            </div>
            <div
              className="mt-2.5 flex h-1.5 gap-0.5"
              role="img"
              aria-label="All four required sections are filled in"
            >
              {[0, 1, 2, 3].map((n) => (
                <span key={n} className="h-full flex-1 rounded-full bg-success" />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className={styles.label}>Comment on Risks</p>
              <p className="text-xs text-fg-muted">Answered in v2</p>
            </div>
            <div className="mt-2.5 rounded-lg border border-border bg-panel p-3 shadow-xs">
              <Remark initials="PR" name="Priya Raman" when="2 days ago">
                How many of the sixty did the founders not already know?
              </Remark>
              <div className="mt-3 border-t border-border pt-3">
                <Remark initials="MC" name="Marcus Chen" when="yesterday">
                  Eleven. I asked for the list and put the split in v2.
                </Remark>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <div className="flex flex-col gap-2">
              <button
                ref={circulateButton}
                type="button"
                disabled={stage !== "draft"}
                onClick={() => go("circulated", voteButton)}
                className={cn(ui.button, stage === "draft" ? ui.primary : ui.quiet, "w-full")}
              >
                {stage === "draft" ? (
                  <>
                    <Send className="size-3.5" aria-hidden />
                    Circulate memo
                  </>
                ) : (
                  <>
                    <Check className="size-3.5" aria-hidden />
                    Circulated
                  </>
                )}
              </button>
              {stage === "voting" ? (
                <button ref={voteButton} type="button" onClick={() => go("draft", circulateButton)} className={cn(ui.button, ui.quiet, "w-full")}>
                  <RotateCcw className="size-3.5" aria-hidden />
                  Start over
                </button>
              ) : (
                <button
                  ref={voteButton}
                  type="button"
                  disabled={stage === "draft"}
                  onClick={() => setStage("voting")}
                  className={cn(ui.button, stage === "draft" ? ui.quiet : ui.primary, "w-full")}
                >
                  {stage === "draft" && <Lock className="size-3.5" aria-hidden />}
                  Open blind vote
                </button>
              )}
            </div>
            <p className="mt-3 min-h-11 text-sm leading-relaxed text-fg-muted" role="status" aria-live="polite">
              {stage === "draft" && "A vote can't open until the memo is circulated."}
              {stage === "circulated" && "Circulated to the club. A blind vote can open now."}
              {stage === "voting" && "Vote opened. Seven members were notified."}
            </p>
          </div>
        </div>
      </div>
    </Window>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-[0.9375rem] font-semibold leading-snug text-fg">{title}</h4>
        {aside}
      </div>
      <div className="mt-0.5 text-base leading-[1.55] text-fg-muted">{children}</div>
    </section>
  );
}

/**
 * Both wordings share one grid cell and only the chosen one shows, so the
 * passage is as tall as the longer of the two and switching never moves the
 * page. The hidden one is out of the accessibility tree.
 */
function Versions({ version, of }: { version: Version; of: Record<Version, React.ReactNode> }) {
  return (
    <div className="grid">
      {([1, 2] as Version[]).map((v) => (
        <p key={v} aria-hidden={v !== version} className={cn("col-start-1 row-start-1", v !== version && "invisible")}>
          {of[v]}
        </p>
      ))}
    </div>
  );
}

function Remark({
  initials,
  name,
  when,
  children,
}: {
  initials: string;
  name: string;
  when: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2">
      <Avatar initials={initials} className="mt-px" />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline justify-between gap-2 text-xs">
          <span className="truncate font-medium text-fg">{name}</span>
          <span className="tnum shrink-0 text-2xs text-fg-subtle">{when}</span>
        </p>
        <p className="mt-0.5 text-sm leading-snug text-fg-muted">{children}</p>
      </div>
    </div>
  );
}
