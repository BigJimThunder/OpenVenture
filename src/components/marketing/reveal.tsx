"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/**
 * Fades children up once they enter the viewport. Delay in seconds.
 *
 * The motion is an enhancement, never a gate: the server sends the content
 * visible, so it reads without JavaScript, before hydration, and if the
 * bundle fails to load. Once mounted, only blocks still below the fold are
 * tucked away (nobody can see that happen) and then revealed as they scroll
 * in. Driven by a data attribute React doesn't own — no inline script, so
 * nothing here needs a CSP nonce.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Already on screen (or scrolled past): leave it exactly as rendered.
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.dataset.reveal = "wait";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "in";
        io.disconnect();
      },
      // A line 12% up from the bottom edge, so a block of any height trips it.
      { rootMargin: "0px 0px -12% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      delete el.dataset.reveal;
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn(styles.reveal, className)}
      style={{ "--d": `${delay}s` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
