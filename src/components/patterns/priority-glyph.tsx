import type { ApplicationPriority } from "@/db/schema";
import { cn } from "@/lib/utils";

export const PRIORITY_LABELS: Record<ApplicationPriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/** Sort key — urgent first, unset last. */
export const PRIORITY_ORDER: Record<ApplicationPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** How many of the three bars are "lit" for each level. */
const FILLED_BARS: Record<ApplicationPriority, number> = {
  urgent: 3,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const BAR_HEIGHTS = ["h-[5px]", "h-[8px]", "h-[11px]"];

/**
 * Priority as an icon, not a colored word: three rising bars for high/medium/low
 * and a filled square for urgent. Chrome stays monochrome so the one urgent row
 * on screen is the only thing carrying color.
 */
export function PriorityGlyph({
  priority,
  className,
}: {
  priority: ApplicationPriority;
  className?: string;
}) {
  const label = PRIORITY_LABELS[priority];

  if (priority === "urgent") {
    return (
      <span
        className={cn("flex w-3.5 items-center justify-center", className)}
        title={label}
        aria-label={label}
      >
        <span className="flex size-3 items-center justify-center rounded-[3px] bg-cat-6 text-[9px] leading-none font-bold text-bg">
          !
        </span>
      </span>
    );
  }

  const filled = FILLED_BARS[priority];
  return (
    <span
      className={cn("flex w-3.5 items-end gap-[1.5px]", className)}
      title={label}
      aria-label={label}
    >
      {BAR_HEIGHTS.map((h, i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px]",
            h,
            i < filled ? "bg-fg-muted" : "bg-border-strong"
          )}
        />
      ))}
    </span>
  );
}
