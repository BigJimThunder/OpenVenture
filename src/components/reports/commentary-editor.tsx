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
      <div className="rounded-lg border border-dashed border-border p-4 text-center print:hidden">
        <p className="mb-2 text-sm text-fg-muted">
          The GP commentary is the part only you can write — what happened, what you learned,
          what you&apos;re doing next quarter.
        </p>
        <Button size="sm" variant="secondary" onClick={start} disabled={busy}>
          {busy ? "Starting…" : "Write the commentary"}
        </Button>
      </div>
    ) : (
      <p className="text-sm italic text-fg-subtle print:hidden">Commentary not yet written.</p>
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
