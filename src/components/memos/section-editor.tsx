"use client";

import * as React from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { updateMemoSection } from "@/lib/actions/memos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type SaveState = "idle" | "saving" | "saved" | "error";

const PROSE =
  "prose-surface min-h-20 outline-none [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_h1]:text-md [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-3 [&_blockquote]:text-fg-muted [&_.is-editor-empty]:before:content-[attr(data-placeholder)] [&_.is-editor-empty]:before:text-fg-subtle [&_.is-editor-empty]:before:float-left [&_.is-editor-empty]:before:h-0 [&_.is-editor-empty]:before:pointer-events-none";

/**
 * One memo section: Tiptap with debounced autosave (800ms), flushed if the
 * member navigates away mid-debounce. Content is stored as Tiptap JSON plus a
 * plain-text mirror for search and diffing.
 *
 * A section the AI drafted is labelled until a member edits it or explicitly
 * keeps it — either way the next save drops the marker.
 */
export function SectionEditor({
  sectionId,
  title,
  guidance,
  required,
  initialContent,
  aiDraft,
  editable,
  onWordCount,
  onSaveState,
}: {
  sectionId: string;
  title: string;
  guidance?: string | null;
  required?: boolean;
  initialContent: Record<string, unknown> | null;
  aiDraft: boolean;
  editable: boolean;
  onWordCount?: (sectionId: string, words: number) => void;
  onSaveState?: (sectionId: string, state: SaveState) => void;
}) {
  const [isAiDraft, setIsAiDraft] = React.useState(aiDraft);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<(() => Promise<void>) | null>(null);

  const report = React.useCallback(
    (state: SaveState) => onSaveState?.(sectionId, state),
    [onSaveState, sectionId]
  );

  const editor = useEditor({
    editable,
    immediatelyRender: false,
    extensions: [StarterKit, Placeholder.configure({ placeholder: guidance ?? "Write…" })],
    content: (initialContent as object) ?? "",
    editorProps: { attributes: { class: PROSE, "aria-label": title } },
    onUpdate: ({ editor }) => {
      setIsAiDraft(false);
      report("saving");
      const save = async () => {
        pending.current = null;
        const res = await updateMemoSection({
          sectionId,
          contentJson: editor.getJSON() as unknown as Record<string, unknown>,
          contentText: editor.getText(),
        });
        if (!res.ok) {
          report("error");
          toast.error(`“${title}” didn't save: ${res.error}`);
          return;
        }
        report("saved");
        onWordCount?.(sectionId, res.data.wordCount);
      };
      pending.current = save;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, 800);
    },
  });

  // Leaving the page inside the debounce window must not lose the last sentence.
  React.useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void pending.current?.();
    };
  }, []);

  async function keepAsWritten() {
    if (!editor) return;
    const res = await updateMemoSection({
      sectionId,
      contentJson: editor.getJSON() as unknown as Record<string, unknown>,
      contentText: editor.getText(),
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setIsAiDraft(false);
  }

  return (
    <section
      id={`section-${sectionId}`}
      aria-label={title}
      className="scroll-mt-16 rounded-lg border border-border bg-panel p-4 shadow-xs md:p-5"
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-md font-semibold">{title}</h3>
        {required && <Badge variant="outline">Required</Badge>}
      </div>
      {isAiDraft && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-md border border-info-border bg-info-bg px-3 py-2 text-xs text-info">
          <span className="flex items-center gap-1.5 font-medium">
            <SparklesIcon className="size-3.5" />
            AI draft — edit before circulating
          </span>
          {editable && (
            <Button variant="ghost" size="sm" className="h-7 text-info hover:text-info" onClick={keepAsWritten}>
              I&apos;ve checked it — keep as written
            </Button>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </section>
  );
}
