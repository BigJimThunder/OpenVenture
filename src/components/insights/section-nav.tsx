"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Anchor nav with a scroll spy — the active section tracks what's actually on
 * screen instead of being hardcoded to the first entry.
 */
export function SectionNav({ sections }: { sections: [string, string][] }) {
  const [active, setActive] = React.useState(sections[0]?.[0] ?? "");

  React.useEffect(() => {
    const elements = sections
      .map(([id]) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.intersectionRatio);
          else visible.delete(e.target.id);
        }
        // Highest section currently in view wins — reading order, not ratio.
        for (const [id] of sections) {
          if (visible.has(id)) {
            setActive(id);
            return;
          }
        }
      },
      { rootMargin: "-10% 0px -60% 0px", threshold: [0, 0.1, 0.5] }
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav className="scrollbar-none sticky top-0 z-20 flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-bg px-2 md:px-3">
      {sections.map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={() => setActive(id)}
          className={cn(
            "flex h-10 shrink-0 items-center px-2.5 text-sm transition-colors",
            active === id
              ? "font-medium text-fg shadow-[inset_0_-2px_0_var(--accent)]"
              : "text-fg-muted hover:text-fg"
          )}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
