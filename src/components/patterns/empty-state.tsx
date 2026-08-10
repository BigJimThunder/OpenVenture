import { cn } from "@/lib/utils";

/**
 * "Nothing here yet" — explanation + primary CTA.
 * For "no results" (filters active) use a compact inline message instead.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-14 text-center",
        className
      )}
    >
      {icon && <div className="mb-1 text-fg-subtle [&_svg]:size-8 [&_svg]:stroke-[1.25]">{icon}</div>}
      <div className="text-sm font-medium">{title}</div>
      {description && <div className="max-w-sm text-xs text-fg-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
