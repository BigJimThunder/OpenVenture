import { cn } from "@/lib/utils";

/**
 * Document-style page header (Grants, Members, Settings…). Scrolls with the
 * page. Stacks on phones so a long title never fights its actions for width.
 * Screen-style pages that own their scroll use `ScreenHeader` instead.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Small line above the title — a breadcrumb or a mono ref. */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 pb-4 pt-5 sm:flex-row sm:items-end sm:justify-between md:px-6 md:pt-6",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs text-fg-subtle">{eyebrow}</div>}
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
