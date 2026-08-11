"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { NAV_PAGES } from "./command-palette";

/**
 * Linear-style chords, active anywhere outside a form field or dialog:
 *   g + <key>  navigate (the map comes from NAV_PAGES shortcuts, e.g. "G A")
 *   c          new application
 */

const G_ROUTES: Record<string, string> = Object.fromEntries(
  NAV_PAGES.filter((p) => p.shortcut?.startsWith("G ")).map((p) => [
    p.shortcut!.slice(2).toLowerCase(),
    p.href,
  ])
);

const CHORD_TIMEOUT_MS = 1200;

export function GlobalShortcuts() {
  const router = useRouter();

  React.useEffect(() => {
    let awaitingSecondKey = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function inTypingContext(target: EventTarget | null) {
      const el = target instanceof Element ? target : null;
      return Boolean(
        el?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (inTypingContext(e.target)) return;
      const key = e.key.toLowerCase();

      if (awaitingSecondKey) {
        awaitingSecondKey = false;
        clearTimeout(timer);
        const href = G_ROUTES[key];
        if (href) {
          e.preventDefault();
          router.push(href);
        }
        return;
      }

      if (key === "g") {
        awaitingSecondKey = true;
        timer = setTimeout(() => {
          awaitingSecondKey = false;
        }, CHORD_TIMEOUT_MS);
        return;
      }

      if (key === "c") {
        e.preventDefault();
        router.push("/applications?new=1");
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [router]);

  return null;
}
