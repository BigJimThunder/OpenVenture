"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { createActionItem, toggleActionItem } from "@/lib/actions/meetings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Action = {
  id: string;
  title: string;
  status: string;
  dueAt: Date | null;
  assigneeName: string | null;
};

export function ActionItems({
  meetingId,
  actions,
  members,
}: {
  meetingId: string;
  actions: Action[];
  members: { id: string; displayName: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    const res = await createActionItem({
      meetingId,
      title: title.trim(),
      assigneeMemberId: assignee,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTitle("");
    router.refresh();
  }

  async function toggle(id: string, done: boolean) {
    const res = await toggleActionItem({ actionItemId: id, done });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map((a) => (
        <label
          key={a.id}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-bg-subtle"
        >
          <Checkbox
            checked={a.status === "done"}
            onCheckedChange={(c) => toggle(a.id, c === true)}
          />
          <span className={cn("min-w-0 flex-1 truncate", a.status === "done" && "text-fg-subtle line-through")}>
            {a.title}
          </span>
          <span className="shrink-0 text-2xs text-fg-subtle">
            {a.assigneeName ?? "unassigned"}
            {a.dueAt ? ` · ${format(a.dueAt, "MMM d")}` : ""}
          </span>
        </label>
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="New action item…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-36 shrink-0">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            {members.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="secondary" onClick={add} disabled={busy || !title.trim()}>
          Add
        </Button>
      </div>
    </div>
  );
}
