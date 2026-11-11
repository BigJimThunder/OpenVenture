"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { CheckIcon, MessageSquareIcon } from "lucide-react";
import { toast } from "sonner";
import { addMemoComment, resolveMemoComment } from "@/lib/actions/memos";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Comment = {
  id: string;
  sectionId: string | null;
  body: string;
  createdAt: Date;
  resolvedAt: Date | null;
  authorName: string;
};

/** The comment thread for a memo. A rail on wide screens; inside `CommentsSheet` on phones. */
export function CommentsRail({ memoId, comments }: { memoId: string; comments: Comment[] }) {
  const router = useRouter();
  const canComment = useCan("contribute");
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const open = comments.filter((c) => !c.resolvedAt);
  const resolved = comments.filter((c) => c.resolvedAt);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!body.trim() || busy) return;
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
      {canComment && (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Textarea
            rows={2}
            placeholder="A question or a push-back for the author…"
            value={body}
            maxLength={5000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && submit()}
            aria-label="New comment"
          />
          {body.trim() && (
            <Button type="submit" size="sm" disabled={busy} className="self-end max-md:h-10">
              {busy ? "Posting…" : "Comment"}
            </Button>
          )}
        </form>
      )}

      {comments.length === 0 && (
        <p className="text-sm text-fg-muted">
          No comments yet. This is where the club argues with the memo before the vote — ask what
          you&apos;d want answered before you could say yes.
        </p>
      )}

      {open.map((c) => (
        <article key={c.id} className="rounded-lg border border-border bg-panel p-3 shadow-xs">
          <header className="flex items-center justify-between gap-2">
            <div className="min-w-0 text-xs">
              <span className="font-medium">{c.authorName}</span>
              <span className="text-fg-subtle"> · {formatDistanceToNow(c.createdAt, { addSuffix: true })}</span>
            </div>
            {canComment && (
              <Button
                variant="ghost"
                size="sm"
                className="-my-1 -mr-1.5 h-7 shrink-0 text-xs max-md:h-9"
                onClick={() => resolve(c.id)}
              >
                <CheckIcon />
                Resolve
              </Button>
            )}
          </header>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap">{c.body}</p>
        </article>
      ))}

      {resolved.length > 0 && (
        <details className="text-xs text-fg-muted">
          <summary className="cursor-pointer py-1">{resolved.length} resolved</summary>
          <div className="mt-2 flex flex-col gap-2">
            {resolved.map((c) => (
              <div key={c.id} className="rounded-lg border border-border p-3 text-fg-muted">
                <span className="text-xs font-medium">{c.authorName}</span>
                <p className="mt-1 text-sm whitespace-pre-wrap">{c.body}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Phones and tablets: the same thread behind a button, as a bottom sheet. */
export function CommentsSheet({ memoId, comments }: { memoId: string; comments: Comment[] }) {
  const openCount = comments.filter((c) => !c.resolvedAt).length;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" className="max-md:h-10 lg:hidden">
          <MessageSquareIcon />
          <span className="tnum">{openCount === 0 ? "Comments" : `${openCount} comment${openCount === 1 ? "" : "s"}`}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Comments</DialogTitle>
          <DialogDescription>Visible to every member. Resolve one when it has been answered.</DialogDescription>
        </DialogHeader>
        <CommentsRail memoId={memoId} comments={comments} />
      </DialogContent>
    </Dialog>
  );
}
