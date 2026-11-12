"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { styles } from "./kit";
import { IntakeDemo } from "./demos/intake";
import { MemoDemo } from "./demos/memo";
import { VoteDemo } from "./demos/vote";
import { LedgerDemo } from "./demos/ledger";
import { InsightsDemo } from "./demos/insights";

/**
 * The product tour: one application's path from the form to the report, five
 * steps, each with a working piece of the app beside it. It advances on its
 * own while it is on screen and stops for good the moment the visitor picks a
 * step or touches a demo.
 */
const STEPS = [
  {
    key: "intake",
    title: "Intake",
    head: "Every application lands with an owner.",
    text: "A hosted form, or your own through a signed webhook. Each application is assigned in rotation and checked for duplicates, and the founder hears back right away.",
    Demo: IntakeDemo,
  },
  {
    key: "diligence",
    title: "Diligence",
    head: "Memos built like real diligence.",
    text: "Templated sections, numbered versions and comments in the margin. A vote cannot open on a memo that has not been circulated.",
    Demo: MemoDemo,
  },
  {
    key: "decide",
    title: "Decide",
    head: "Blind votes, revealed together.",
    text: "Every ballot stays sealed until a partner reveals the round. Each member commits to a view before seeing anyone else's, and the server enforces it.",
    Demo: VoteDemo,
  },
  {
    key: "fund",
    title: "Fund",
    head: "A budget that cannot be overdrawn.",
    text: "Grants move from proposed to approved, issued and reconciled against a pool that does its own arithmetic. An approval that would overdraw it is refused.",
    Demo: LedgerDemo,
  },
  {
    key: "learn",
    title: "Learn",
    head: "Your season, in numbers.",
    text: "Funnel conversion, decline reasons and sourcing, live from the record. Quarterly letters and the annual report arrive with the numbers already filled in.",
    Demo: InsightsDemo,
  },
] as const;

export function Workflow() {
  const [index, setIndex] = React.useState(0);
  const [touring, setTouring] = React.useState(false);
  const [held, setHeld] = React.useState(false); // pointer or focus is inside the demo
  const [visible, setVisible] = React.useState(false);
  const root = React.useRef<HTMLDivElement>(null);
  const tabs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const step = STEPS[index];

  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    setTouring(true);
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function pick(i: number, focus = false) {
    setTouring(false);
    setIndex(i);
    if (focus) tabs.current[i]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (delta) {
      e.preventDefault();
      pick((index + delta + STEPS.length) % STEPS.length, true);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      pick(e.key === "Home" ? 0 : STEPS.length - 1, true);
    }
  }

  return (
    <div ref={root} className="grid gap-x-10 gap-y-6 lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[23rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <div
          role="tablist"
          aria-label="The workflow, step by step"
          aria-orientation="vertical"
          onKeyDown={onKeyDown}
          className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible"
        >
          {STEPS.map((s, i) => {
            const active = i === index;
            return (
              <button
                key={s.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`tour-tab-${s.key}`}
                aria-selected={active}
                aria-controls="tour-panel"
                tabIndex={active ? 0 : -1}
                onClick={() => pick(i)}
                className={cn(
                  "group relative shrink-0 cursor-pointer overflow-hidden rounded-xl border text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent",
                  "min-h-11 px-4 py-2 lg:px-5 lg:py-3.5",
                  active
                    ? "border-border-strong bg-bg shadow-sm"
                    : "border-border bg-transparent hover:border-border-strong lg:border-transparent lg:hover:border-border lg:hover:bg-bg/50"
                )}
              >
                <span className="flex items-baseline gap-3">
                  <span className={cn("font-mono text-xs", active ? "text-accent" : "text-fg-subtle")}>0{i + 1}</span>
                  <span className={cn("text-[0.9375rem] font-semibold tracking-tight lg:text-base", active ? "text-fg" : "text-fg-muted")}>
                    {s.title}
                  </span>
                </span>
                <span className={cn("mt-1.5 hidden pl-[1.9rem] text-[0.9375rem] font-medium leading-snug lg:block", active ? "text-fg" : "text-fg-muted")}>
                  {s.head}
                </span>
                {/* Only the active step spells itself out; the rest keep their headline. */}
                <span
                  className={cn(
                    "hidden transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none lg:grid",
                    active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  )}
                >
                  <span className="overflow-hidden">
                    <span className="block pl-[1.9rem] pt-1.5 text-sm leading-relaxed text-fg-muted">{s.text}</span>
                  </span>
                </span>
                {active && touring && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-border">
                    <span
                      key={index}
                      className={cn(styles.progress, (held || !visible) && styles.paused, "block h-full bg-accent")}
                      onAnimationEnd={() => setIndex((n) => (n + 1) % STEPS.length)}
                    />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* Below lg the steps are chips, so the active one's words go here. */}
        <div className="mt-5 lg:hidden">
          <p className="text-lg font-semibold tracking-tight">{step.head}</p>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-fg-muted">{step.text}</p>
        </div>
      </div>

      <div
        id="tour-panel"
        role="tabpanel"
        aria-labelledby={`tour-tab-${step.key}`}
        className={cn(styles.halo, "min-w-0")}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        onPointerDownCapture={() => setTouring(false)}
        onKeyDownCapture={() => setTouring(false)}
      >
        <div key={step.key} className={cn(styles.pop, "relative grid grid-cols-[minmax(0,1fr)] lg:min-h-[38rem] xl:min-h-[33rem]")}>
          <step.Demo />
        </div>
      </div>
    </div>
  );
}
