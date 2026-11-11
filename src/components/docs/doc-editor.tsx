"use client";

import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { updateDocContent } from "@/lib/actions/docs";
import { docToText } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/editor/rich-text";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * A doc: reads like a page, edits in place, saves as you type. Formatting
 * comes from the shared editor (selection bubble, "/" blocks, docked bar on
 * phones); this component owns the autosave and its status line.
 */
export function DocEditor({
  docId,
  initialContent,
  editable,
  bleed,
  placeholder = "Start writing, or type / for a heading or list. Whoever runs the club next year will read this.",
}: {
  docId: string;
  initialContent: Record<string, unknown> | null;
  editable: boolean;
  /**
   * Full-page docs: on phones drop the card and run edge to edge (the parent
   * must have the standard `px-4` gutter). Embedded editors stay a card.
   */
  bleed?: boolean;
  placeholder?: string;
}) {
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<(() => Promise<void>) | null>(null);

  const [doc, setDoc] = React.useState<JSONContent | null>(initialContent as JSONContent | null);

  function onChange(next: JSONContent) {
    setDoc(next);
    setSaveState("saving");
    const save = async () => {
      pending.current = null;
      const res = await updateDocContent({
        docId,
        contentJson: next as Record<string, unknown>,
        contentText: docToText(next),
      });
      if (!res.ok) {
        setSaveState("error");
        toast.error(`Not saved: ${res.error}`);
      } else {
        setSaveState("saved");
      }
    };
    pending.current = save;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  }

  // Leaving inside the debounce window must not lose the last sentence.
  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void pending.current?.();
    };
  }, []);

  return (
    <div
      className={cn(
        "print:border-0 print:shadow-none",
        bleed
          ? "md:rounded-lg md:border md:border-border md:bg-panel md:shadow-xs"
          : "rounded-lg border border-border bg-panel shadow-xs"
      )}
    >
      {editable && (
        <div
          className={cn(
            "sticky top-0 z-10 flex min-h-9 items-center border-b border-border px-4 py-1.5 backdrop-blur print:hidden md:px-8",
            bleed
              ? "-mx-4 bg-bg/95 md:mx-0 md:rounded-t-lg md:bg-panel/95"
              : "rounded-t-lg bg-panel/95"
          )}
        >
          <span className="text-xs text-fg-subtle max-sm:hidden">
            Select text to format · type <kbd className="font-mono text-fg-muted">/</kbd> for blocks
          </span>
          <span
            role="status"
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-xs",
              saveState === "error" ? "text-danger" : "text-fg-subtle"
            )}
          >
            {saveState === "saving" && (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                Saving…
              </>
            )}
            {saveState === "saved" && (
              <>
                <CheckIcon className="size-3.5 text-success" />
                Saved
              </>
            )}
            {saveState === "error" && "Not saved"}
            {saveState === "idle" && "Edits save as you type"}
          </span>
        </div>
      )}
      <div className={cn("print:p-0", bleed ? "py-4 md:px-8 md:py-7" : "p-4 md:p-6")}>
        <RichTextEditor
          value={doc}
          onChange={onChange}
          editable={editable}
          placeholder={placeholder}
          ariaLabel="Document body"
          className="[--rt-min-h:50svh] print:[--rt-min-h:0]"
        />
      </div>
    </div>
  );
}
