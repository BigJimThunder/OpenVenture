"use client";

import * as React from "react";
import { isTypingTarget, overlayOpen } from "@/components/shell/app-shell";

/**
 * Keyboard walk for a page of `ListRow`s: J / ↓ and K / ↑ move focus between
 * rows, Enter opens the focused one (it is a link). Render once per screen
 * that shows the matching `Kbd` hints.
 */
export function ListKeys() {
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || overlayOpen()) return;
      const step =
        e.key === "j" || e.key === "ArrowDown" ? 1 : e.key === "k" || e.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-list-row]"));
      if (rows.length === 0) return;
      const current = rows.indexOf(document.activeElement as HTMLElement);
      const next =
        current === -1
          ? step === 1
            ? 0
            : rows.length - 1
          : Math.max(0, Math.min(rows.length - 1, current + step));
      e.preventDefault();
      rows[next].focus();
      rows[next].scrollIntoView({ block: "nearest" });
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
  return null;
}
