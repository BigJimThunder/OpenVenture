import { cn, formatMoney } from "@/lib/utils";

/** Tabular numerals, right-aligned by default — mandatory for money columns. */
export function Money({
  value,
  cents,
  className,
}: {
  value: number | string | null | undefined;
  cents?: boolean;
  className?: string;
}) {
  if (value == null) return <span className={cn("tnum text-fg-subtle", className)}>—</span>;
  return <span className={cn("tnum", className)}>{formatMoney(value, { cents })}</span>;
}
