"use client";

import * as React from "react";
import { SectionEditor } from "./section-editor";
import { Progress } from "@/components/ui/progress";

type Section = {
  id: string;
  title: string;
  guidance: string | null;
  contentJson: Record<string, unknown> | null;
  wordCount: number;
};

/** The live draft: one Tiptap editor per section + a completeness meter. */
export function MemoEditor({
  sections,
  editable,
}: {
  sections: Section[];
  editable: boolean;
}) {
  const [wordCounts, setWordCounts] = React.useState<Record<string, number>>(
    Object.fromEntries(sections.map((s) => [s.id, s.wordCount]))
  );
  const filled = sections.filter((s) => (wordCounts[s.id] ?? 0) > 0).length;

  const onWordCount = React.useCallback((sectionId: string, words: number) => {
    setWordCounts((prev) => (prev[sectionId] === words ? prev : { ...prev, [sectionId]: words }));
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {sections.length > 1 && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-4 py-2">
          <Progress value={(filled / sections.length) * 100} className="flex-1" />
          <span className="tnum shrink-0 text-xs text-fg-muted">
            {filled}/{sections.length} sections
          </span>
        </div>
      )}
      {sections.map((s) => (
        <SectionEditor
          key={s.id}
          sectionId={s.id}
          title={s.title}
          guidance={s.guidance}
          initialContent={s.contentJson}
          editable={editable}
          onWordCount={onWordCount}
        />
      ))}
      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-fg-muted">
          This memo has no sections — its template was empty.
        </div>
      )}
    </div>
  );
}
