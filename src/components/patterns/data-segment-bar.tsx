import { cn } from "@/lib/utils";

export type Segment = {
  key: string;
  label: string;
  /** Share of the whole, 0..1. Supplied by the caller — this component only draws. */
  fraction: number;
  /** CSS color, always a token: `var(--cat-2)`. */
  color: string;
  /** Preformatted value shown in the legend ("42.50%", "$1,903"). */
  value?: string;
};

/**
 * One part-of-whole bar: ownership, a pool's commitments, an outcome ladder.
 * Segments are separated by a 2px surface gap and identity is never color
 * alone — the legend repeats every label with its value.
 */
export function SegmentBar({
  segments,
  label,
  height = "h-2.5",
  className,
}: {
  segments: Segment[];
  /** Accessible summary of what the whole represents. */
  label: string;
  height?: string;
  className?: string;
}) {
  const visible = segments.filter((s) => s.fraction > 0);
  return (
    <div
      role="img"
      aria-label={`${label}: ${visible.map((s) => `${s.label} ${s.value ?? ""}`).join(", ")}`}
      className={cn("flex w-full gap-0.5 overflow-hidden rounded-full bg-bg-subtle", height, className)}
    >
      {visible.map((s) => (
        <span
          key={s.key}
          title={`${s.label}${s.value ? ` · ${s.value}` : ""}`}
          className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
          style={{ flexGrow: s.fraction, flexBasis: 0, background: s.color }}
        />
      ))}
    </div>
  );
}

export function SegmentLegend({
  segments,
  className,
}: {
  segments: Segment[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted", className)}>
      {segments.map((s) => (
        <li key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ background: s.color }} aria-hidden />
          <span>{s.label}</span>
          {s.value && <span className="tnum font-medium text-fg">{s.value}</span>}
        </li>
      ))}
    </ul>
  );
}
