"use client";

import * as React from "react";
import { saveAnnualReport } from "@/lib/actions/annual-report";
import { applyAnnualOps, type AnnualContent, type AnnualOp } from "@/lib/reports/annual";

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

const DEBOUNCE_MS = 900;

/** Drop an earlier `set` to the same path when only other `set`s sit between: typing sends the last value once. */
function enqueue(queue: AnnualOp[], op: AnnualOp) {
  if (op.op === "set") {
    const key = op.path.join("\u0000");
    for (let i = queue.length - 1; i >= 0; i--) {
      const earlier = queue[i];
      if (earlier.op !== "set") break;
      if (earlier.path.join("\u0000") === key) {
        queue.splice(i, 1);
        break;
      }
    }
  }
  queue.push(op);
}

/**
 * The builder's working copy. Edits apply to local state immediately and are
 * sent to the server as small path-addressed ops after a pause, so two
 * members writing different essays never overwrite each other.
 */
export function useAnnualDraft(reportId: string, initial: AnnualContent) {
  const [content, setContent] = React.useState(initial);
  const [status, setStatus] = React.useState<SaveStatus>("saved");
  const [error, setError] = React.useState<string | null>(null);
  const queue = React.useRef<AnnualOp[]>([]);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = React.useRef(false);
  const flushRef = React.useRef<() => Promise<void>>(async () => {});

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inflight.current || queue.current.length === 0) return;
    inflight.current = true;
    const ops = queue.current;
    queue.current = [];
    setStatus("saving");
    const res = await saveAnnualReport({ reportId, ops });
    inflight.current = false;
    if (!res.ok) {
      // Keep the edits so "Try again" can resend them.
      queue.current = [...ops, ...queue.current];
      setError(res.error);
      setStatus("error");
      return;
    }
    setError(null);
    if (queue.current.length > 0) {
      setStatus("dirty");
      timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
    } else {
      setStatus("saved");
    }
  }, [reportId]);

  React.useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const apply = React.useCallback((...ops: AnnualOp[]) => {
    setContent((current) => applyAnnualOps(current, ops));
    for (const op of ops) enqueue(queue.current, op);
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
  }, []);

  // Leaving mid-pause: send what is queued, and warn if the tab is closing first.
  React.useEffect(() => {
    const onHide = () => void flushRef.current();
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (queue.current.length > 0 || inflight.current) e.preventDefault();
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flushRef.current();
    };
  }, []);

  /** Swap in content the server rebuilt ("Refresh numbers"). Callers flush first. */
  const reset = React.useCallback((next: AnnualContent) => {
    queue.current = [];
    setContent(next);
    setStatus("saved");
  }, []);

  return { content, apply, status, error, flush, reset };
}

export type AnnualDraft = ReturnType<typeof useAnnualDraft>;
