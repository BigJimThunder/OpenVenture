"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { toggleActionItem } from "@/lib/actions/meetings";
import { formatRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * A live action-item row for the Inbox and My Work lists. The checkbox
 * completes it in place (with an Undo toast, since done items leave these
 * lists); the rest of the row links to where it was created — the meeting
 * or application — so its context is one click away.
 */
export function ActionItemRow({
  item,
  overdue,
  trailing,
}: {
  item: {
    id: string;
    ref: number;
    title: string;
    description: string | null;
    dueAt: Date | null;
    meetingId: string | null;
    applicationId: string | null;
  };
  overdue?: boolean;
  trailing?: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const href = item.meetingId
    ? `/meetings/${item.meetingId}`
    : item.applicationId
      ? `/pipeline/${item.applicationId}`
      : undefined;

  async function toggle(done: boolean) {
    setBusy(true);
    const res = await toggleActionItem({ actionItemId: item.id, done });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
    if (done) {
      toast.success(`${formatRef("actionItem", item.ref)} done`, {
        action: {
          label: "Undo",
          onClick: async () => {
            const undo = await toggleActionItem({ actionItemId: item.id, done: false });
            if (!undo.ok) toast.error(undo.error);
            else router.refresh();
          },
        },
      });
    }
  }

  const rowClass = "flex h-9 items-center gap-2.5 border-b border-border px-4 transition-colors";
  const body = (
    <>
      {/* preventDefault keeps the checkbox from also following the row link */}
      <span
        className="flex shrink-0 items-center"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <Checkbox
          checked={false}
          disabled={busy}
          onCheckedChange={(c) => c === true && toggle(true)}
          aria-label={`Mark ${formatRef("actionItem", item.ref)} done`}
        />
      </span>
      <span className="w-14 shrink-0 font-mono text-[11.5px] text-fg-subtle">
        {formatRef("actionItem", item.ref)}
      </span>
      <span className="truncate text-sm" title={item.description ?? undefined}>
        {item.title}
      </span>
      {item.dueAt && (
        <span
          className={cn(
            "ml-auto shrink-0 text-[11.5px]",
            overdue ? "text-danger" : "text-fg-muted"
          )}
        >
          {format(item.dueAt, "MMM d")}
        </span>
      )}
      {trailing && <span className={cn("shrink-0", !item.dueAt && "ml-auto")}>{trailing}</span>}
    </>
  );

  if (!href) return <div className={rowClass}>{body}</div>;
  return (
    <Link href={href} className={cn(rowClass, "hover:bg-bg-subtle")}>
      {body}
    </Link>
  );
}
