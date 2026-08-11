"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";
import { updateMemoSection } from "@/lib/actions/memos";
import { cn } from "@/lib/utils";

/**
 * One memo section: Tiptap with debounced autosave (800ms). Content is
 * stored as Tiptap JSON plus a plain-text mirror for search and diffing.
 */
export function SectionEditor({
  sectionId,
  title,
  guidance,
  initialContent,
  editable,
  onWordCount,
}: {
  sectionId: string;
  title: string;
  guidance?: string | null;
  initialContent: Record<string, unknown> | null;
  editable: boolean;
  onWordCount?: (sectionId: string, words: number) => void;
}) {
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: guidance ?? "Write…",
      }),
    ],
    content: (initialContent as object) ?? "",
    editorProps: {
      attributes: {
        class:
          "prose-surface min-h-20 outline-none text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-md [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:text-fg-subtle [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:pointer-events-none",
      },
    },
    onUpdate: ({ editor }) => {
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const text = editor.getText();
        const res = await updateMemoSection({
          sectionId,
          contentJson: editor.getJSON() as unknown as Record<string, unknown>,
          contentText: text,
        });
        if (!res.ok) {
          setSaveState("error");
          toast.error(res.error);
          return;
        }
        setSaveState("saved");
        onWordCount?.(sectionId, (res.data as { wordCount: number }).wordCount);
      }, 800);
    },
  });

  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <section id={`section-${sectionId}`} className="rounded-lg border border-border bg-panel p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-md font-semibold">{title}</h3>
        <span
          className={cn(
            "text-2xs",
            saveState === "error" ? "text-danger" : "text-fg-subtle"
          )}
        >
          {saveState === "saving"
            ? "Saving…"
            : saveState === "saved"
              ? "Saved"
              : saveState === "error"
                ? "Save failed"
                : ""}
        </span>
      </div>
      <EditorContent editor={editor} />
    </section>
  );
}
