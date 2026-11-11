"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircleIcon, CheckIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { draftMemoFromApplication } from "@/lib/actions/memos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionEditor, type SaveState } from "./section-editor";

type Section = {
  id: string;
  title: string;
  guidance: string | null;
  required: boolean;
  contentJson: Record<string, unknown> | null;
  wordCount: number;
  aiDraft: boolean;
};

export type AiAvailability =
  | { available: true }
  /** `reason` is shown next to the disabled button. */
  | { available: false; reason: string };

/**
 * The live draft: one editor per section under a sticky status bar that
 * carries the three things a writer keeps glancing at — how much is filled
 * in, whether it is saved, and the AI first-draft button.
 */
export function MemoEditor({
  memoId,
  sections,
  editable,
  ai,
}: {
  memoId: string;
  sections: Section[];
  editable: boolean;
  ai: AiAvailability;
}) {
  const router = useRouter();
  const [wordCounts, setWordCounts] = React.useState<Record<string, number>>(() =>
    Object.fromEntries(sections.map((s) => [s.id, s.wordCount]))
  );
  const [saveStates, setSaveStates] = React.useState<Record<string, SaveState>>({});
  // Sections the AI just filled: new content plus a nonce that remounts their editor.
  const [drafted, setDrafted] = React.useState<
    Record<string, { contentJson: Record<string, unknown>; nonce: number }>
  >({});
  const [drafting, setDrafting] = React.useState(false);

  const onWordCount = React.useCallback((sectionId: string, words: number) => {
    setWordCounts((prev) => (prev[sectionId] === words ? prev : { ...prev, [sectionId]: words }));
  }, []);
  const onSaveState = React.useCallback((sectionId: string, state: SaveState) => {
    setSaveStates((prev) => (prev[sectionId] === state ? prev : { ...prev, [sectionId]: state }));
  }, []);

  const filled = sections.filter((s) => (wordCounts[s.id] ?? 0) > 0).length;
  const emptyCount = sections.length - filled;
  const totalWords = Object.values(wordCounts).reduce((a, b) => a + b, 0);
  const states = Object.values(saveStates);
  const overall: SaveState = states.includes("error")
    ? "error"
    : states.includes("saving")
      ? "saving"
      : states.includes("saved")
        ? "saved"
        : "idle";

  async function draft() {
    setDrafting(true);
    const res = await draftMemoFromApplication({ memoId });
    setDrafting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const nonce = Date.now();
    setDrafted((prev) => ({
      ...prev,
      ...Object.fromEntries(res.data.filled.map((f) => [f.id, { contentJson: f.contentJson, nonce }])),
    }));
    setWordCounts((prev) => ({
      ...prev,
      ...Object.fromEntries(res.data.filled.map((f) => [f.id, f.wordCount])),
    }));
    toast.success(
      `Drafted ${res.data.filled.length} section${res.data.filled.length === 1 ? "" : "s"}. Read and edit them before circulating.`
    );
    router.refresh();
  }

  if (sections.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 p-8 text-center text-sm text-fg-muted">
        This memo has no sections, because it was started before the club had a memo template. An
        admin can add one under Settings → Templates; memos started after that get its sections.
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-bg/95 px-4 py-2 backdrop-blur md:mx-0 md:rounded-lg md:border md:bg-panel/95 md:shadow-xs">
        <div className="flex min-w-36 flex-1 items-center gap-2.5">
          <Progress value={(filled / sections.length) * 100} className="max-w-40 flex-1" />
          <span className="tnum shrink-0 text-xs text-fg-muted">
            {filled}/{sections.length} sections · {totalWords.toLocaleString()} words
          </span>
        </div>
        {editable && (
          <span
            role="status"
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-xs",
              overall === "error" ? "text-danger" : "text-fg-subtle"
            )}
          >
            {overall === "saving" && (
              <>
                <Loader2Icon className="size-3.5 animate-spin" />
                Saving…
              </>
            )}
            {overall === "saved" && (
              <>
                <CheckIcon className="size-3.5 text-success" />
                All changes saved
              </>
            )}
            {overall === "error" && (
              <>
                <AlertCircleIcon className="size-3.5" />
                Not saved — keep this tab open and try again
              </>
            )}
            {overall === "idle" && "Edits save as you type"}
          </span>
        )}
        {/* Only offered while there is an empty section for it to fill. */}
        {editable &&
          emptyCount > 0 &&
          (ai.available ? (
            <Button variant="secondary" size="sm" className="max-md:h-9" onClick={draft} disabled={drafting}>
              {drafting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {drafting ? "Drafting — about half a minute…" : "Draft from application"}
            </Button>
          ) : (
            <span className="flex items-center gap-2 text-xs text-fg-subtle">
              <Button variant="secondary" size="sm" disabled>
                <SparklesIcon />
                Draft from application
              </Button>
              <span className="max-w-44 leading-snug">{ai.reason}</span>
            </span>
          ))}
      </div>

      {sections.map((s) => {
        const override = drafted[s.id];
        return (
          <SectionEditor
            key={override ? `${s.id}:${override.nonce}` : s.id}
            sectionId={s.id}
            title={s.title}
            guidance={s.guidance}
            required={s.required}
            initialContent={override?.contentJson ?? s.contentJson}
            aiDraft={override ? true : s.aiDraft}
            editable={editable}
            onWordCount={onWordCount}
            onSaveState={onSaveState}
          />
        );
      })}
    </div>
  );
}
