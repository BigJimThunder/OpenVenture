"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SettingsNavItem = { id: string; label: string };

/**
 * Section navigation for /settings: a sticky column on desktop, a row of
 * horizontally scrollable chips on phones. Highlights the section in view.
 * Other screens deep-link here (/settings#money), so ids are a contract.
 */
export function SettingsNav({ items }: { items: SettingsNavItem[] }) {
  const [active, setActive] = React.useState(items[0]?.id);
  const chipRefs = React.useRef(new Map<string, HTMLAnchorElement>());

  React.useEffect(() => {
    const root = document.getElementById("main");
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => !!el);
    // The band a section must cross to count as "current": the top third of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { root, rootMargin: "-15% 0px -65% 0px" }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [items]);

  React.useEffect(() => {
    if (active) chipRefs.current.get(active)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        // Phones: chips pinned under the page header.
        "sticky top-0 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-border bg-bg/95 px-4 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        // Desktop: a quiet column.
        "md:top-6 md:mx-0 md:flex-col md:gap-0.5 md:self-start md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
      )}
    >
      {items.map((item) => {
        const current = item.id === active;
        return (
          <a
            key={item.id}
            href={`#${item.id}`}
            ref={(el) => {
              if (el) chipRefs.current.set(item.id, el);
              else chipRefs.current.delete(item.id);
            }}
            aria-current={current ? "true" : undefined}
            onClick={() => setActive(item.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              "md:rounded-md md:border-transparent md:px-2.5 md:py-1.5",
              current
                ? "border-border-strong bg-panel font-medium text-fg shadow-xs md:border-transparent md:bg-bg-subtle md:shadow-none"
                : "border-border text-fg-muted hover:text-fg md:hover:bg-bg-subtle/60"
            )}
          >
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}
