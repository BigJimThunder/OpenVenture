"use client";

import * as React from "react";
import { CheckIcon, SparklesIcon } from "lucide-react";
import { fieldChrome } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A textarea that is as tall as its text — no inner scrollbar, no drag handle. */
export function AutoTextarea({
  className,
  value,
  minRows = 1,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value"> & { value: string; minRows?: number }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      className={cn(fieldChrome, "block resize-none overflow-hidden px-3 py-2 leading-relaxed max-md:text-base", className)}
      {...props}
    />
  );
}

export type FieldOrigin = "ai" | "memo" | "application" | undefined;

const ORIGIN_NOTE: Record<Exclude<FieldOrigin, undefined | "ai">, string> = {
  memo: "Carried over from the investment memo. Trim it for this reader.",
  application: "Carried over from the application. Put it in the club's words.",
};

/**
 * Label, provenance and the AI affordance around one written field. An AI
 * draft stays flagged until the member edits it or accepts it as is.
 */
export function FieldShell({
  label,
  htmlFor,
  required,
  origin,
  onAccept,
  onDraft,
  drafting,
  canDraft,
  hasText,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  origin: FieldOrigin;
  onAccept: () => void;
  onDraft?: () => void;
  drafting?: boolean;
  /** AI is configured and on for this club. */
  canDraft: boolean;
  hasText: boolean;
  children: React.ReactNode;
}) {
  // Offer a draft for an empty field, or a fresh one over an unreviewed draft — never over a member's words.
  const offerDraft = canDraft && onDraft && (!hasText || origin === "ai");
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
          {required && !hasText && <span className="ml-1.5 text-xs font-normal text-fg-subtle">needed to finalize</span>}
        </label>
        <div className="flex items-center gap-1.5">
          {origin === "ai" && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full border border-info-border bg-info-bg px-2 py-0.5 text-2xs font-medium text-info">
                <SparklesIcon className="size-3" />
                AI draft
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 max-md:h-10" onClick={onAccept}>
                <CheckIcon />
                Looks right
              </Button>
            </>
          )}
          {offerDraft && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-fg-muted max-md:h-10"
              onClick={onDraft}
              disabled={drafting}
            >
              <SparklesIcon />
              {drafting ? "Drafting…" : origin === "ai" ? "Redraft" : "Draft with AI"}
            </Button>
          )}
        </div>
      </div>
      {children}
      {origin && origin !== "ai" && <p className="text-xs text-fg-subtle">{ORIGIN_NOTE[origin]}</p>}
    </div>
  );
}

/** Shown in place of an empty box: the two or three questions the field answers. */
export function GuidingQuestions({ questions, className }: { questions: string[]; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-0.5 text-xs text-fg-muted", className)}>
      {questions.map((q) => (
        <li key={q} className="flex gap-1.5">
          <span aria-hidden className="text-fg-subtle">
            ·
          </span>
          {q}
        </li>
      ))}
    </ul>
  );
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveIndicator({ state }: { state: SaveState }) {
  return (
    <span className="text-xs text-fg-subtle" aria-live="polite">
      {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved — check your connection" : ""}
    </span>
  );
}

/**
 * Debounced autosave for a report's content. `queue` merges patches;
 * `flush` sends what is pending and resolves when the server has it.
 */
export function useAutosave<P extends Record<string, unknown>>(
  save: (patch: P) => Promise<{ ok: boolean; error?: string }>,
  onError: (message: string) => void
) {
  const [state, setState] = React.useState<SaveState>("idle");
  const pending = React.useRef<P | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef<Promise<void>>(Promise.resolve());
  const saveRef = React.useRef(save);
  const errorRef = React.useRef(onError);
  React.useEffect(() => {
    saveRef.current = save;
    errorRef.current = onError;
  });

  const flush = React.useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = pending.current;
    if (!patch) return inFlight.current;
    pending.current = null;
    setState("saving");
    // Saves run one after another so an older patch can never land on top of a newer one.
    inFlight.current = inFlight.current.then(async () => {
      const res = await saveRef.current(patch);
      if (res.ok) {
        setState(pending.current ? "saving" : "saved");
      } else {
        setState("error");
        errorRef.current(res.error ?? "Couldn't save.");
      }
    });
    return inFlight.current;
  }, []);

  const queue = React.useCallback(
    (patch: P) => {
      pending.current = { ...(pending.current ?? ({} as P)), ...patch };
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 700);
    },
    [flush]
  );

  // Leaving the page mid-debounce still saves.
  React.useEffect(() => () => void flush(), [flush]);

  return { state, queue, flush };
}
