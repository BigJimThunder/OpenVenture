"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { toggleActionItem } from "@/lib/actions/meetings";
import { formatRef } from "@/lib/refs";
import { useCan } from "@/components/shell/viewer";
import { Checkbox } from "@/components/ui/checkbox";
import { ListRow, RowFlag } from "@/components/patterns/data-list";

/**
 * An action item in the Inbox / My work lists. The checkbox completes it in
 * place (with Undo, since done items leave these lists); the row itself links
 * to the meeting or application it came from.
 */
export function TaskRow({
  item,
  overdue,
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
  overdue: boolean;
}) {
  const router = useRouter();
  const canContribute = useCan("contribute");
  const [busy, setBusy] = React.useState(false);
  const ref = formatRef("actionItem", item.ref);

  const href = item.meetingId
    ? `/meetings/${item.meetingId}`
    : item.applicationId
      ? `/pipeline/${item.applicationId}`
      : undefined;

  async function complete() {
    setBusy(true);
    const res = await toggleActionItem({ actionItemId: item.id, done: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
    toast.success(`${ref} done`, {
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

  return (
    <ListRow
      href={href as Route | undefined}
      refLabel={ref}
      leading={
        // Keeps the checkbox from also following the row link.
        <span
          className="flex items-center max-md:-m-3 max-md:p-3"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Checkbox
            checked={false}
            disabled={busy || !canContribute}
            onCheckedChange={(c) => c === true && complete()}
            aria-label={`Mark ${ref} done`}
          />
        </span>
      }
      title={item.title}
      meta={
        item.description ? <span className="truncate">{item.description}</span> : undefined
      }
      trailing={
        item.dueAt ? (
          <RowFlag tone={overdue ? "danger" : "muted"}>
            {overdue ? "Overdue · " : "Due "}
            {format(item.dueAt, "MMM d")}
          </RowFlag>
        ) : (
          <RowFlag tone="muted">No due date</RowFlag>
        )
      }
    />
  );
}
