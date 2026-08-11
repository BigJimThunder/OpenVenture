import { formatRef, type RefKind } from "@/lib/refs";
import { cn } from "@/lib/utils";

/**
 * The monospace identifier a member says out loud ("who's got APP-141?").
 * Fixed-width so the column stays a rule down dense lists.
 */
export function EntityRef({
  kind,
  value,
  className,
  width = "w-[58px]",
}: {
  kind: RefKind;
  value: number;
  className?: string;
  /** Set to "w-auto" inside cards, where the ref is not a column. */
  width?: string;
}) {
  return (
    <span className={cn("shrink-0 font-mono text-2xs text-fg-subtle", width, className)}>
      {formatRef(kind, value)}
    </span>
  );
}

/** The 8px stage/status dot used in headers, rows and cards. */
export function StageDot({ colorToken, className }: { colorToken: string; className?: string }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", className)}
      style={{ background: `var(--${colorToken})` }}
      aria-hidden
    />
  );
}
