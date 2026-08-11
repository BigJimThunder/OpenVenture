"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { toast } from "sonner";
import { updateDocContent } from "@/lib/actions/docs";
import { cn } from "@/lib/utils";

export function DocEditor({
  docId,
  initialContent,
  editable,
}: {
  docId: string;
  initialContent: Record<string, unknown> | null;
  editable: boolean;
}) {
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "Write the doc…" }),
    ],
    content: (initialContent as object) ?? "",
    editorProps: {
      attributes: {
        class:
          "prose-surface min-h-96 outline-none text-sm leading-relaxed [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h2]:text-md [&_h2]:font-semibold [&_h2]:mt-4 [&_h3]:text-base [&_h3]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:text-fg-subtle [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:pointer-events-none",
      },
    },
    onUpdate: ({ editor }) => {
      setSaveState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        const res = await updateDocContent({
          docId,
          contentJson: editor.getJSON() as unknown as Record<string, unknown>,
          contentText: editor.getText(),
        });
        if (!res.ok) {
          setSaveState("error");
          toast.error(res.error);
        } else {
          setSaveState("saved");
        }
      }, 800);
    },
  });

  React.useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <div className="rounded-lg border border-border bg-panel p-6">
      <div className="mb-2 flex justify-end">
        <span className={cn("text-2xs", saveState === "error" ? "text-danger" : "text-fg-subtle")}>
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : ""}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
