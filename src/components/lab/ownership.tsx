import type { CapTableRow } from "@/lib/captable/types";
import { cn } from "@/lib/utils";
import { SegmentBar, type Segment } from "@/components/patterns/data-segment-bar";
import { POOL_ID, pct } from "./format";

/** Engine rows → bar segments. Fractions are the engine's own; nothing is recomputed. */
export function ownershipSegments(rows: CapTableRow[], colorOf: (id: string) => string): Segment[] {
  return rows.map((r) => ({
    key: r.stakeholderId,
    label: r.name,
    fraction: r.pct,
    color: colorOf(r.stakeholderId),
    value: pct(r.pct),
  }));
}

/** A labelled ownership bar — stack two of these for a before/after read. */
export function OwnershipBar({
  caption,
  rows,
  colorOf,
  className,
}: {
  caption?: string;
  rows: CapTableRow[];
  colorOf: (id: string) => string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {caption && <span className="w-12 shrink-0 text-xs text-fg-muted">{caption}</span>}
      <SegmentBar
        segments={ownershipSegments(rows, colorOf)}
        label={caption ? `Ownership ${caption.toLowerCase()}` : "Ownership"}
        height="h-3"
      />
    </div>
  );
}

export function HolderName({
  row,
  color,
  badge,
}: {
  row: Pick<CapTableRow, "stakeholderId" | "name" | "kind">;
  color: string;
  badge?: React.ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="size-2 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden />
      <span className="truncate font-medium">{row.name}</span>
      {row.stakeholderId !== POOL_ID && (
        <span className="shrink-0 text-2xs text-fg-subtle capitalize max-sm:hidden">{row.kind}</span>
      )}
      {badge}
    </span>
  );
}
