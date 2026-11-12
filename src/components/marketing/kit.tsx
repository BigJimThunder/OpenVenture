import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./landing.module.css";

/**
 * Shared pieces of the marketing page. Everything a visitor can operate on
 * that page is a small replica of the app built from these, so the demos look
 * like one product and like the real one. No hooks here: usable from server
 * and client components alike.
 */

export const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });

/** Page-level calls to action. 44px tall on every device. */
export const btn = {
  base: "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-5 text-[0.9375rem] font-medium outline-none transition-[background-color,border-color,opacity,transform] duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-chrome active:scale-[0.98]",
  primary: "bg-fg text-bg hover:opacity-90",
  secondary: "border border-border-strong bg-panel/60 text-fg backdrop-blur hover:border-fg-subtle hover:bg-panel",
};

/** Controls inside a product window. Same shape as the app's buttons. */
export const ui = {
  button:
    "inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-default max-md:h-11",
  primary: "bg-accent text-accent-fg hover:bg-accent-hover disabled:bg-bg-subtle disabled:text-fg-subtle",
  quiet: "border border-border-strong bg-panel text-fg hover:border-fg-subtle disabled:text-fg-subtle disabled:hover:border-border-strong",
};

/**
 * A product window: the glass ring, then the app's own surface. `bar` is the
 * 44px header every screen in the app draws for itself (title on the left,
 * status or controls on the right).
 */
export function Window({
  bar,
  children,
  className,
  bodyClassName,
}: {
  bar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={cn(styles.windowRing, className)}>
      <div className={cn(styles.window, "flex h-full flex-col")}>
        {bar && (
          <div className="flex min-h-11 shrink-0 items-center gap-3 border-b border-border px-4 text-sm">{bar}</div>
        )}
        <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
      </div>
    </div>
  );
}

/** Title + trailing count, as in the app's screen headers. */
export function BarTitle({ children, meta }: { children: React.ReactNode; meta?: React.ReactNode }) {
  return (
    <p className="flex min-w-0 items-baseline gap-2.5">
      <span className="truncate font-semibold text-fg">{children}</span>
      {meta && <span className="tnum hidden truncate text-fg-muted sm:inline">{meta}</span>}
    </p>
  );
}

export function Avatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[0.5625rem] font-semibold tracking-tight text-fg",
        className
      )}
    >
      {initials}
    </span>
  );
}

const TONES = {
  neutral: "border-border-strong bg-bg-subtle text-fg-muted",
  accent: "border-transparent bg-accent-subtle text-fg",
  success: "border-success-border bg-success-bg text-success",
  warning: "border-warning-border bg-warning-bg text-warning",
  danger: "border-danger-border bg-danger-bg text-danger",
  info: "border-info-border bg-info-bg text-info",
} as const;

/** The app's badge: a tinted chip with a status word in it. */
export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[0.6875rem] font-medium leading-none",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** A stage's colored dot. `n` is the 1-based --cat index. */
export function Dot({ n, className }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ background: `var(--cat-${n})` }}
    />
  );
}

/** The mono eyebrow, big heading and one paragraph that open a section. */
export function SectionHead({
  eyebrow,
  title,
  children,
  id,
  align = "center",
  className,
}: {
  eyebrow: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  id: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div className={cn(styles.reveal, align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl", className)}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={cn(styles.h2, "mt-4")}>
        {title}
      </h2>
      {children && <p className={cn(styles.lede, "mt-5", align === "center" && "mx-auto max-w-2xl")}>{children}</p>}
    </div>
  );
}

export { styles };
