import { cn } from "@/lib/utils";

/**
 * "Nothing here yet." A new club sees these on day one, so each one should
 * teach the workflow: say what belongs here, how it gets here, and offer the
 * first action. `steps` renders a short numbered how-it-works list.
 * For "no results" (filters active) use a compact inline message instead.
 */
export function EmptyState({
  icon,
  title,
  description,
  steps,
  action,
  secondaryAction,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  steps?: string[];
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong/70 bg-bg-subtle/40 px-6 py-12 text-center",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-panel text-fg-muted shadow-xs [&_svg]:size-5 [&_svg]:stroke-[1.5]">
          {icon}
        </div>
      )}
      <div className="text-base font-semibold">{title}</div>
      {description && <div className="mt-1 max-w-md text-sm text-fg-muted">{description}</div>}
      {steps && steps.length > 0 && (
        <ol className="mt-4 flex max-w-md flex-col gap-2 text-left text-sm text-fg-muted">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="tnum mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full bg-panel text-2xs font-medium text-fg-muted ring-1 ring-border">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
