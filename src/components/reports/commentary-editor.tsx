"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ensureReportCommentary } from "@/lib/actions/reports";
import { DocEditor } from "@/components/docs/doc-editor";
import { Button } from "@/components/ui/button";

export function CommentaryEditor({
  fiscalYear,
  quarter,
  commentaryDoc,
  canEdit,
}: {
  fiscalYear: number;
  quarter: number;
  commentaryDoc: { id: string; contentJson: string | null } | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    const res = await ensureReportCommentary({ fiscalYear, quarter });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  if (!commentaryDoc) {
    return canEdit ? (
      <div className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 p-5 font-sans print:hidden">
        <div className="text-sm font-semibold">The commentary is the part only you can write</div>
        <p className="mt-1 max-w-prose text-sm text-fg-muted">
          Three short paragraphs do it: what happened this quarter, what the club learned, and
          what you will do differently next quarter. The figures below fill themselves in.
        </p>
        <Button size="sm" className="mt-3 max-md:h-10" onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Write the commentary"}
        </Button>
      </div>
    ) : (
      <p className="font-sans text-sm text-fg-subtle print:hidden">
        The partners have not written this quarter&apos;s commentary yet. The figures below are live.
      </p>
    );
  }

  return (
    <DocEditor
      docId={commentaryDoc.id}
      initialContent={commentaryDoc.contentJson ? JSON.parse(commentaryDoc.contentJson) : null}
      editable={canEdit}
    />
  );
}
