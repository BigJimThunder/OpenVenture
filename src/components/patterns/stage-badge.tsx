import { cn } from "@/lib/utils";

/**
 * Stage/sector/tier chip colored by a categorical token name (e.g. "cat-3").
 * Tokens, never hex — the palette stays harmonized and dark mode keeps working.
 */
export function StageBadge({
  name,
  colorToken,
  className,
}: {
  name: string;
  colorToken: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2 py-0.5 text-2xs font-medium whitespace-nowrap",
        className
      )}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(--${colorToken})` }}
        aria-hidden
      />
      {name}
    </span>
  );
}
