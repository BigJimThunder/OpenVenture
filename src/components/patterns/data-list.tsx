import Link from "next/link";
import type { Route } from "next";
import { cn, initials } from "@/lib/utils";

/**
 * The triage-list vocabulary (Inbox, My work, the Lab index): a quiet section
 * header and one row per thing. Rows are a single line on desktop and fold to
 * two lines on phones (title, then meta) so nothing truncates to "Aq…".
 * Every row is one tap from its action and at least 44px tall on touch.
 */
export function ListSection({
  title,
  count,
  note,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  /** Right-aligned context, e.g. "blind until reveal". */
  note?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border bg-bg-subtle px-4 md:px-5">
        <h2 className="text-xs font-semibold">{title}</h2>
        {count != null && <span className="tnum text-xs text-fg-subtle">{count}</span>}
        {(note || action) && (
          <span className="ml-auto flex items-center gap-2 text-2xs text-fg-subtle">
            {note}
            {action}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export const listRowClass =
  "group flex min-h-12 items-center gap-3 border-b border-border px-4 py-2 transition-colors md:min-h-10 md:px-5 md:py-1.5";

export function ListRow({
  href,
  leading,
  refLabel,
  title,
  meta,
  trailing,
  className,
}: {
  href?: Route;
  /** 16px glyph: priority, an icon, a checkbox. */
  leading?: React.ReactNode;
  /** Mono identifier (APP-141). Its own column on desktop, inline on phones. */
  refLabel?: string;
  title: React.ReactNode;
  /** Secondary facts. Inline after the title on desktop, second line on phones. */
  meta?: React.ReactNode;
  /** Right edge: amount, age, owner, the action chevron. */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const body = (
    <>
      {leading && <span className="flex w-4 shrink-0 items-center justify-center">{leading}</span>}
      {refLabel && (
        <span className="hidden w-14 shrink-0 font-mono text-2xs text-fg-subtle md:block">
          {refLabel}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 md:flex-row md:items-center md:gap-3">
        <span className="truncate text-sm font-medium">{title}</span>
        {(meta || refLabel) && (
          <span className="flex min-w-0 items-center gap-2.5 overflow-hidden text-xs whitespace-nowrap text-fg-muted">
            {refLabel && <span className="font-mono text-2xs text-fg-subtle md:hidden">{refLabel}</span>}
            {meta}
          </span>
        )}
      </span>
      {trailing && (
        <span className="flex shrink-0 items-center gap-3 text-xs text-fg-muted">{trailing}</span>
      )}
    </>
  );
  if (!href) return <div className={cn(listRowClass, className)}>{body}</div>;
  return (
    <Link
      href={href}
      data-list-row
      className={cn(
        listRowClass,
        "outline-none hover:bg-bg-subtle focus-visible:bg-bg-subtle focus-visible:shadow-[inset_2px_0_0_var(--accent)]",
        className
      )}
    >
      {body}
    </Link>
  );
}

/** Quiet flag inside a row's meta: a breached SLA, an overdue step. */
export function RowFlag({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warning" | "success" | "muted";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0",
        tone === "danger" && "text-danger",
        tone === "warning" && "text-warning",
        tone === "success" && "text-success",
        tone === "muted" && "text-fg-subtle"
      )}
    >
      {children}
    </span>
  );
}

/** 20px owner chip; a dashed ring means "nobody owns this yet". */
export function OwnerAvatar({ name, className }: { name: string | null; className?: string }) {
  if (!name) {
    return (
      <span
        className={cn("size-5 shrink-0 rounded-full border border-dashed border-border-strong", className)}
        title="Unowned"
        aria-label="Unowned"
      />
    );
  }
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-[9px] font-semibold text-fg-muted ring-1 ring-border",
        className
      )}
      title={name}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
