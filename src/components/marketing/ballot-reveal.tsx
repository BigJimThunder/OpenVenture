"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

const BALLOTS = [
  { initials: "EK", vote: "fund" },
  { initials: "SG", vote: "fund" },
  { initials: "PR", vote: "decline" },
  { initials: "MK", vote: "fund" },
  { initials: "JW", vote: "abstain" },
  { initials: "SA", vote: "fund" },
  { initials: "TR", vote: "fund" },
] as const;

const VOTE_LABEL = { fund: "Fund", decline: "Decline", abstain: "Abstain" } as const;

/**
 * The signature moment: a vote round the way the product runs one. Ballots
 * render sealed, flip on scroll-in, then the tally draws. Reduced motion
 * gets the revealed end state immediately.
 */
export function BallotReveal() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = React.useState(false);
  const [instant, setInstant] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        if (reduced) {
          setInstant(true);
          setRevealed(true);
        } else {
          setTimeout(() => setRevealed(true), 700);
        }
      },
      { threshold: reduced ? 0.1 : 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const funds = BALLOTS.filter((b) => b.vote === "fund").length;

  function replay() {
    setRevealed(false);
    setTimeout(() => setRevealed(true), 900);
  }

  return (
    <div ref={ref} className="flex flex-col items-center gap-8">
      <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
        {BALLOTS.map((b, i) => (
          <div
            key={b.initials}
            className={cn(styles.ballot, revealed && styles.flipped, "h-24 w-[4.5rem] sm:h-28 sm:w-20")}
          >
            <div
              className={cn(styles.ballotInner, "h-full w-full")}
              style={{ "--d": instant ? "0s" : `${i * 0.09}s` } as React.CSSProperties}
            >
              {/* Sealed face */}
              <div
                className={cn(
                  styles.face,
                  "flex h-full w-full flex-col items-center justify-between rounded-md border border-border bg-panel py-3 shadow-sm"
                )}
              >
                <span className="text-2xs font-medium tracking-[0.12em] text-fg-subtle uppercase">
                  {b.initials}
                </span>
                <span className="block size-5 rounded-full bg-accent/85 shadow-inner" aria-hidden />
                <span className="text-2xs tracking-[0.14em] text-fg-subtle uppercase">Sealed</span>
              </div>
              {/* Revealed face */}
              <div
                className={cn(
                  styles.back,
                  "flex h-full w-full flex-col items-center justify-between rounded-md border py-3 shadow-sm",
                  b.vote === "fund" && "border-accent/40 bg-accent-subtle",
                  b.vote === "decline" && "border-border-strong bg-bg-subtle",
                  b.vote === "abstain" && "border-border bg-panel"
                )}
              >
                <span className="text-2xs font-medium tracking-[0.12em] text-fg-subtle uppercase">
                  {b.initials}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold",
                    b.vote === "fund" && "text-accent",
                    b.vote === "decline" && "text-fg",
                    b.vote === "abstain" && "text-fg-subtle"
                  )}
                >
                  {VOTE_LABEL[b.vote]}
                </span>
                <span className="block h-5" aria-hidden />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-md" aria-live="polite">
        <div className="mb-2 flex items-baseline justify-between text-xs text-fg-muted">
          <span className={cn("transition-opacity duration-500", revealed ? "opacity-100" : "opacity-0")}>
            {funds} of {BALLOTS.length} vote fund · quorum met
          </span>
          <span
            className={cn(
              "tnum font-medium text-fg transition-opacity delay-700 duration-500",
              revealed ? "opacity-100" : "opacity-0"
            )}
          >
            Funded — $2,200 to SplitStay
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className={cn(styles.tallyFill, "h-full rounded-full bg-accent")}
            style={{ width: revealed ? `${(funds / BALLOTS.length) * 100}%` : "0%" }}
          />
        </div>
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={replay}
            className={cn(
              "cursor-pointer text-xs text-fg-subtle underline-offset-4 transition-opacity duration-500 hover:text-fg hover:underline",
              revealed ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            Run the reveal again
          </button>
        </div>
      </div>
    </div>
  );
}
