import type { Heatmap } from "@/lib/scheduling/engine";
import { formatMinute, formatMinuteRange, WEEKDAY_SHORT, weekdayOf } from "@/lib/scheduling/time";
import { cn } from "@/lib/utils";

/**
 * The group's week at a glance: one cell per half hour, darker where more of
 * the group is busy. Pale columns are where to look.
 */
export function BusyHeatmap({ heatmap, className }: { heatmap: Heatmap; className?: string }) {
  if (heatmap.known === 0 || heatmap.days.length === 0) return null;
  const hourRows = heatmap.rows.filter((m) => m % 60 === 0);
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="flex gap-1.5">
        <div className="relative w-8 shrink-0" aria-hidden>
          {hourRows
            .filter((_, i) => i % 2 === 0)
            .map((m) => (
              <span
                key={m}
                className="tnum absolute right-0 -translate-y-1/2 text-2xs text-fg-subtle"
                style={{ top: `calc(1.25rem + ${((m - heatmap.rows[0]) / heatmap.stepMinutes) * 9}px)` }}
              >
                {formatMinute(m).replace(":00", "").replace(" ", "").toLowerCase()}
              </span>
            ))}
        </div>
        <div className="grid flex-1 gap-px" style={{ gridTemplateColumns: `repeat(${heatmap.days.length}, minmax(0, 1fr))` }}>
          {heatmap.days.map((d) => (
            <div key={d.day} className="flex flex-col">
              <div className="tnum h-5 text-center text-2xs font-medium text-fg-muted">
                {WEEKDAY_SHORT[weekdayOf(d.day)]} {Number(d.day.slice(8))}
              </div>
              <div className="flex flex-col overflow-hidden rounded-sm border border-border bg-panel">
                {d.busy.map((n, i) => (
                  <div
                    key={i}
                    title={`${formatMinuteRange(heatmap.rows[i], heatmap.rows[i] + heatmap.stepMinutes)}: ${n} of ${heatmap.known} busy`}
                    className={cn("h-[9px]", heatmap.rows[i] % 60 === 0 && i > 0 && "border-t border-border/60")}
                  >
                    {n > 0 && <div className="size-full bg-accent" style={{ opacity: 0.12 + 0.88 * (n / heatmap.known) }} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="tnum flex items-center justify-between gap-2 pl-9 text-2xs text-fg-muted">
        <span>Busy, of {heatmap.known}</span>
        <span className="flex items-center gap-1" aria-hidden>
          none
          {[0.12, 0.4, 0.7, 1].map((o) => (
            <span key={o} className="size-2.5 rounded-[2px] bg-accent" style={{ opacity: o }} />
          ))}
          all
        </span>
      </figcaption>
    </figure>
  );
}
