import Link from "next/link";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/**
 * The frame of the new-member welcome flow: a step rail beside (or, on a
 * phone, a progress strip above) one focused screen. Deliberately not the app
 * shell — there is nowhere else to go until this is done.
 */

export type RailStep = {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming";
  /** Reachable steps link back to themselves. */
  href: string | null;
};

export function StartShell({
  orgName,
  email,
  steps,
  minutesLeft,
  headerAction,
  footer,
  children,
}: {
  orgName: string;
  email: string;
  steps: RailStep[];
  minutesLeft: number;
  headerAction?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const current = Math.max(
    0,
    steps.findIndex((s) => s.state === "current")
  );
  return (
    <div className="flex min-h-svh flex-col bg-chrome lg:grid lg:grid-cols-[19rem_minmax(0,1fr)]">
      {/* ——— Rail (desktop) ——— */}
      <aside className="sticky top-0 hidden h-svh flex-col px-6 py-7 lg:flex">
        <div className="flex items-center gap-2.5">
          <ClubInitials name={orgName} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-tight">{orgName}</span>
            <span className="block text-xs text-fg-subtle">New member setup</span>
          </span>
        </div>
        <nav aria-label="Steps" className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <ol className="flex flex-col">
            {steps.map((s, i) => {
              const row = (
                <span
                  className={cn(
                    "flex items-start gap-3 rounded-md px-2 py-1.5 text-sm",
                    s.state === "current" && "bg-panel font-medium shadow-xs ring-1 ring-border",
                    s.state === "upcoming" && "text-fg-subtle",
                    s.state === "done" && "text-fg-muted",
                    s.href && s.state !== "current" && "hover:bg-bg-subtle hover:text-fg"
                  )}
                >
                  <StepDot state={s.state} n={i + 1} />
                  <span className="min-w-0 flex-1 leading-5">{s.label}</span>
                </span>
              );
              return (
                <li key={s.key} aria-current={s.state === "current" ? "step" : undefined}>
                  {s.href && s.state !== "current" ? (
                    <Link href={s.href} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="mt-6 border-t border-border pt-4 text-xs text-fg-subtle">
          {minutesLeft > 0 && (
            <p className="tnum mb-2 text-fg-muted">About {minutesLeft} min left. You can stop and come back.</p>
          )}
          <p className="truncate">Signed in as {email}</p>
          {footer}
        </div>
      </aside>

      {/* ——— The screen ——— */}
      <div className="flex min-h-svh min-w-0 flex-col bg-panel lg:my-2 lg:mr-2 lg:min-h-[calc(100svh-1rem)] lg:rounded-xl lg:border lg:border-border lg:shadow-xs">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:border-0 lg:px-8 lg:pt-6 lg:pb-0">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden">
            <ClubInitials name={orgName} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">{orgName}</span>
              <span className="tnum block text-xs text-fg-subtle">
                Step {current + 1} of {steps.length}
                {minutesLeft > 0 && ` · about ${minutesLeft} min left`}
              </span>
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">{headerAction}</div>
        </header>
        <div
          className="flex gap-1 px-4 pt-3 lg:hidden"
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={current + 1}
        >
          {steps.map((s) => (
            <span
              key={s.key}
              className={cn(
                "h-1 flex-1 rounded-full",
                s.state === "upcoming" ? "bg-bg-subtle ring-1 ring-border ring-inset" : "bg-accent",
                s.state === "done" && "opacity-45"
              )}
            />
          ))}
        </div>
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

function ClubInitials({ name }: { name: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fg text-xs font-semibold tracking-tight text-bg">
      {initials(name)}
    </span>
  );
}

function StepDot({ state, n }: { state: RailStep["state"]; n: number }) {
  return (
    <span
      className={cn(
        "tnum mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full text-2xs font-medium",
        state === "done" && "bg-success text-panel",
        state === "current" && "bg-accent text-accent-fg",
        state === "upcoming" && "text-fg-subtle ring-1 ring-border-strong ring-inset"
      )}
    >
      {state === "done" ? <CheckIcon className="size-3" strokeWidth={3} /> : n}
    </span>
  );
}

/** Title block + body of one step. The step's own `StepNav` goes last inside `children`. */
export function StepBody({
  eyebrow,
  title,
  lede,
  wide,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  lede?: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto flex w-full flex-1 flex-col px-4 pt-6 md:px-8 lg:pt-10", wide ? "max-w-3xl" : "max-w-xl")}>
      {eyebrow && <p className="mb-2 text-xs font-medium text-fg-subtle">{eyebrow}</p>}
      <h1 className="text-xl leading-tight font-semibold tracking-tight text-balance">{title}</h1>
      {lede && <div className="mt-2 text-base leading-relaxed text-fg-muted">{lede}</div>}
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/**
 * Back on the left, the one thing to do next on the right. Pinned to the
 * bottom of the screen on phones so it is always under the thumb.
 */
export function StepNav({
  backHref,
  hint,
  children,
}: {
  backHref?: string | null;
  /** Why the primary button is disabled, or a quiet note beside it. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto border-t border-border bg-panel/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:pt-8 md:pb-10 md:backdrop-blur-none">
      {hint && <p className="mb-2 text-xs text-fg-muted md:hidden">{hint}</p>}
      <div className="flex items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-fg-muted outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 md:h-10"
          >
            <ArrowLeftIcon className="size-4" />
            Back
          </Link>
        )}
        <div className="ml-auto flex min-w-0 items-center gap-3">
          {hint && <p className="hidden text-xs text-fg-muted md:block">{hint}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

export const primaryStepButton = "h-11 px-5 text-base md:h-10 max-md:flex-1";
