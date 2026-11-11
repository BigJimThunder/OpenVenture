"use client";

import * as React from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  BoldIcon,
  CheckIcon,
  Heading2Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  QuoteIcon,
} from "lucide-react";
import { toast } from "sonner";
import { updateDocContent } from "@/lib/actions/docs";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

const PROSE =
  "prose-surface min-h-[50svh] outline-none [&_p]:my-2.5 [&_ul]:my-2.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li>p]:my-1 [&_h1]:mt-7 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-1.5 [&_h2]:text-md [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_code]:rounded-sm [&_code]:bg-bg-subtle [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_.is-editor-empty]:before:pointer-events-none [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:text-fg-subtle [&_.is-editor-empty]:before:content-[attr(data-placeholder)] print:min-h-0";

/**
 * A doc: reads like a page, edits in place, saves as you type. The small
 * formatting bar is there for phones, where there are no keyboard shortcuts.
 */
export function DocEditor({
  docId,
  initialContent,
  editable,
  bleed,
  placeholder = "Start writing. Whoever runs the club next year will read this.",
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

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: (initialContent as object) ?? "",
    editorProps: { attributes: { class: PROSE } },
    onUpdate: ({ editor }) => {
      setSaveState("saving");
      const save = async () => {
        pending.current = null;
        const res = await updateDocContent({
          docId,
          contentJson: editor.getJSON() as unknown as Record<string, unknown>,
          contentText: editor.getText(),
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
    },
  });

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
      {editable && editor && (
        <div
          className={cn(
            "sticky top-0 z-10 flex items-center gap-0.5 border-b border-border px-3 py-1.5 backdrop-blur print:hidden",
            bleed
              ? "-mx-4 bg-bg/95 md:mx-0 md:rounded-t-lg md:bg-panel/95"
              : "rounded-t-lg bg-panel/95"
          )}
        >
          <FormatBar editor={editor} />
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
            {saveState === "idle" && <span className="max-sm:hidden">Edits save as you type</span>}
          </span>
        </div>
      )}
      <div className={cn("print:p-0", bleed ? "py-4 md:px-8 md:py-7" : "p-4 md:p-6")}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function FormatBar({ editor }: { editor: Editor }) {
  // Re-render on selection changes so the active states stay truthful.
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    editor.on("transaction", force);
    return () => {
      editor.off("transaction", force);
    };
  }, [editor]);

  const tools = [
    { label: "Heading", icon: Heading2Icon, active: editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bold", icon: BoldIcon, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: ItalicIcon, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Bulleted list", icon: ListIcon, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrderedIcon, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Quote", icon: QuoteIcon, active: editor.isActive("blockquote"), run: () => editor.chain().focus().toggleBlockquote().run() },
  ];

  return (
    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5">
      {tools.map((t) => (
        <button
          key={t.label}
          type="button"
          aria-label={t.label}
          aria-pressed={t.active}
          title={t.label}
          // Keep the text selection (and the phone keyboard) when a tool is tapped.
          onMouseDown={(e) => e.preventDefault()}
          onClick={t.run}
          className={cn(
            "flex size-8 cursor-pointer items-center justify-center rounded-md text-fg-muted outline-none transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 max-md:size-10 [&_svg]:size-4",
            t.active && "bg-bg-subtle text-fg"
          )}
        >
          <t.icon />
        </button>
      ))}
    </div>
  );
}
