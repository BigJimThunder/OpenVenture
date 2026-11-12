import { cn } from "@/lib/utils";

/**
 * One headline number. `tone` colors the value only when the number itself
 * is the warning (an overdrawn pool, a breached SLA count).
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-panel p-4 shadow-xs", className)}>
      <div className="text-xs text-fg-muted">{label}</div>
      <div
        className={cn(
          "tnum mt-1.5 text-xl font-semibold tracking-tight",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger"
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-fg-subtle">{hint}</div>}
    </div>
  );
}
