import { cn } from "@/lib/utils";

export type BarListItem = {
  key: string;
  label: string;
  /** Magnitude — sets the bar length relative to the largest item. */
  value: number;
  /** Preformatted value shown at the row's right edge ("$1,903", "12"). */
  display: string;
  /** Quiet qualifier after the value ("3 grants"). */
  note?: string;
  /** Optional second, darker bar drawn inside the first (a subset: funded of applied). */
  inner?: number;
};

/**
 * A ranked list of horizontal bars with every value written out — the honest
 * default for "how much of each category". One colour for the whole list
 * (the bars are one series; colour by rank would mean nothing), labels in
 * text ink, and it reflows at any width because it is plain HTML.
 */
export function BarList({
  items,
  color = "var(--cat-1)",
  innerColor,
  max: fixedMax,
  className,
}: {
  items: BarListItem[];
  /** Full-scale value. Defaults to the largest item; set it for a fixed scale (1 for a rate, 5 for a 1–5 score). */
  max?: number;
  color?: string;
  innerColor?: string;
  className?: string;
}) {
  const max = fixedMax ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn("flex flex-col gap-2.5 px-3.5 py-3", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-fg">{item.label}</span>
            <span className="tnum shrink-0 text-fg-muted">
              <span className="font-medium text-fg">{item.display}</span>
              {item.note && <span className="text-fg-subtle"> · {item.note}</span>}
            </span>
          </div>
          <div className="relative mt-1 h-1.5 rounded-full bg-bg-subtle">
            <div
              className="absolute inset-y-0 left-0 min-w-[3px] rounded-full"
              style={{ width: `${(item.value / max) * 100}%`, background: color, opacity: item.inner != null ? 0.35 : 1 }}
            />
            {item.inner != null && item.inner > 0 && (
              <div
                className="absolute inset-y-0 left-0 min-w-[3px] rounded-full"
                style={{ width: `${(item.inner / max) * 100}%`, background: innerColor ?? color }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
