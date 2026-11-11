import { cn } from "@/lib/utils";

/**
 * The hairline panel every non-chart block sits in (tables, ledgers, key/value
 * lists) — the same frame as ChartFrame, so a page of mixed charts and tables
 * reads as one system. Title left, a quiet note or actions right.
 */
export function Panel({
  title,
  note,
  actions,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn("flex min-w-0 flex-col rounded-lg border border-border bg-panel shadow-xs", className)}
    >
      {(title || note || actions) && (
        <header className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-3.5 py-2">
          {title && <h2 className="text-sm font-semibold">{title}</h2>}
          <div className="flex min-w-0 items-center gap-2">
            {note && <span className="truncate text-xs text-fg-subtle">{note}</span>}
            {actions}
          </div>
        </header>
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
      {footer && (
        <footer className="border-t border-border px-3.5 py-2 text-xs text-fg-subtle">{footer}</footer>
      )}
    </section>
  );
}

/** Small-caps column/section label — table heads, key/value keys. */
export const microLabel = "text-2xs font-medium tracking-wide text-fg-subtle uppercase";

/**
 * Dense table styles for use inside a Panel. Plain class strings rather than
 * components so a table can keep semantic markup and a sticky header (the
 * `ui/table` wrapper scrolls on its own, which defeats `position: sticky`).
 */
export const dataTable = {
  table: "w-full border-separate border-spacing-0 text-sm",
  th: cn(
    microLabel,
    "sticky top-0 z-10 h-8 border-b border-border bg-panel px-3.5 text-left whitespace-nowrap first:rounded-tl-lg last:rounded-tr-lg"
  ),
  td: "h-10 border-b border-border px-3.5 align-middle",
  row: "transition-colors hover:bg-bg-subtle/60 [&:last-child>td]:border-b-0",
  num: "tnum text-right",
} as const;
