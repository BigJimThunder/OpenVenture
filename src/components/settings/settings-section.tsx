import { cn } from "@/lib/utils";

/**
 * One anchored block of /settings. `scroll-mt` keeps the heading clear of the
 * sticky chip row on phones when you arrive via /settings#id.
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-16 md:scroll-mt-6">
      <div className="mb-3">
        <h2 id={`${id}-heading`} className="text-md font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 max-w-xl text-sm text-fg-muted">{description}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** A titled card inside a section. */
export function SettingsCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-panel shadow-xs", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="mt-1 max-w-xl text-xs text-fg-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Coloured dot + sentence for "is this wired up?" rows. */
export function StatusLine({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", ok ? "bg-success" : "bg-warning")}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
