"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { addMemoComment, resolveMemoComment } from "@/lib/actions/memos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Comment = {
  id: string;
  sectionId: string | null;
  body: string;
  createdAt: Date;
  resolvedAt: Date | null;
  authorName: string;
};

export function CommentsRail({ memoId, comments }: { memoId: string; comments: Comment[] }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const open = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await addMemoComment({ memoId, body: body.trim() });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBody("");
    router.refresh();
  }

  async function resolve(commentId: string) {
    const res = await resolveMemoComment({ commentId });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Textarea
          rows={2}
          placeholder="Comment for the author…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
        />
        {body.trim() && (
          <Button size="sm" onClick={submit} disabled={busy} className="self-end">
            Comment
          </Button>
        )}
      </div>
      {open.map((c) => (
        <div key={c.id} className="rounded-md border border-border bg-panel p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">{c.authorName}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-fg-subtle">
                {formatDistanceToNow(c.createdAt, { addSuffix: true })}
              </span>
              <button
                onClick={() => resolve(c.id)}
                className="cursor-pointer text-fg-subtle hover:text-success"
                title="Resolve"
              >
                <CheckIcon className="size-3.5" />
              </button>
            </div>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.body}</p>
        </div>
      ))}
      {resolved.length > 0 && (
        <details className="text-xs text-fg-subtle">
          <summary className="cursor-pointer">{resolved.length} resolved</summary>
          <div className="mt-2 flex flex-col gap-2">
            {resolved.map((c) => (
              <div key={c.id} className={cn("rounded-md border border-border p-2.5 opacity-60")}>
                <span className="text-xs font-medium">{c.authorName}</span>
                <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              </div>
            ))}
          </div>
        </details>
      )}
      {comments.length === 0 && (
        <p className="text-xs text-fg-subtle">No comments yet.</p>
      )}
    </div>
  );
}
