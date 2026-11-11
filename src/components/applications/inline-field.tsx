"use client";

import * as React from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Click-to-edit for a single fact. The value reads as plain text until you
 * click it; Enter (⌘↵ in a textarea) or blur saves, Esc cancels. With
 * `canEdit` false it is just text — no hover state, no pencil.
 */
export function InlineField({
  value,
  onSave,
  canEdit,
  label,
  placeholder = "Add…",
  type = "text",
  multiline = false,
  display,
  inputClassName,
  className,
  maxLength,
}: {
  value: string | null;
  /** Receives the trimmed text, or null when cleared. */
  onSave: (next: string | null) => Promise<SaveResult>;
  canEdit: boolean;
  /** Accessible name, e.g. "Founder". */
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "number" | "url";
  multiline?: boolean;
  /** Custom read-mode rendering (a link, a Money, …). */
  display?: React.ReactNode;
  inputClassName?: string;
  className?: string;
  maxLength?: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [busy, setBusy] = React.useState(false);
  // Esc sets this so the blur that follows doesn't save.
  const cancelled = React.useRef(false);

  function start() {
    setDraft(value ?? "");
    cancelled.current = false;
    setEditing(true);
  }

  async function commit() {
    if (cancelled.current) return;
    const next = draft.trim() || null;
    if (next === (value ?? null)) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const res = await onSave(next);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditing(false);
  }

  function cancel() {
    cancelled.current = true;
    setEditing(false);
  }

  if (!canEdit) {
    return (
      <span className={cn("min-w-0", !value && "text-fg-subtle", multiline && "whitespace-pre-wrap", className)}>
        {value ? (display ?? value) : "—"}
      </span>
    );
  }

  if (editing) {
    if (multiline) {
      return (
        <div className={cn("flex w-full flex-col gap-2", className)}>
          <Textarea
            autoFocus
            rows={5}
            value={draft}
            disabled={busy}
            maxLength={maxLength}
            aria-label={label}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                cancel();
              } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void commit();
              }
            }}
            className={cn("leading-relaxed max-md:text-base", inputClassName)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={cancel} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={commit} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <Input
        autoFocus
        type={type}
        inputMode={type === "number" ? "decimal" : undefined}
        value={draft}
        disabled={busy}
        maxLength={maxLength}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            cancel();
          } else if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        className={cn("h-7 max-md:h-10 max-md:text-base", inputClassName, className)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${label}: ${value ?? "empty"}. Edit`}
      className={cn(
        "group/inline -mx-1.5 flex min-w-0 cursor-text items-start gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 max-md:min-h-10 max-md:items-center",
        multiline && "w-full whitespace-pre-wrap",
        className
      )}
    >
      <span className={cn("min-w-0 flex-1", !multiline && "truncate", !value && "text-fg-subtle")}>
        {value ? (display ?? value) : placeholder}
      </span>
      <PencilIcon className="mt-0.5 size-3 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover/inline:opacity-100 group-focus-visible/inline:opacity-100 max-md:mt-0 max-md:opacity-60" />
    </button>
  );
}
