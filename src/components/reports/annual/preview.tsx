"use client";

import * as React from "react";
import { buildPublication, type AnnualContent, type AnnualDerived } from "@/lib/reports/annual";
import { Publication } from "./publication";

const PAGE_WIDTH = 816;
/** Below this the pane is a phone: reflow the report rather than shrink it to a thumbnail. */
const REFLOW_BELOW = 520;

/**
 * The live preview: the real publication, scaled to the width of its pane.
 * It is the same component the reader and the PDF use, so what you see here
 * is what goes out.
 */
export function Preview({ content, derived }: { content: AnnualContent; derived: AnnualDerived }) {
  const pane = React.useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = React.useState<number | null>(null);
  // Typing should not re-layout twelve pages on every keystroke.
  const deferred = React.useDeferredValue(content);
  const pub = React.useMemo(() => buildPublication(deferred, derived), [deferred, derived]);

  React.useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setZoom(width < REFLOW_BELOW ? 1 : Math.min(1, width / PAGE_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pane} className="w-full">
      {zoom !== null && (
        <div style={zoom < 1 ? { zoom, width: PAGE_WIDTH } : undefined}>
          <Publication pub={pub} draft />
        </div>
      )}
    </div>
  );
}
