"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  cancelActionItem,
  createActionItem,
  toggleActionItem,
  updateActionItem,
} from "@/lib/actions/meetings";
import { formatRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MeetingAction = {
  id: string;
  ref: number;
  title: string;
  status: string;
  dueAt: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
};

type Member = { id: string; displayName: string };

const UNASSIGNED = "unassigned";

const dateInputValue = (d: Date | null) => (d ? format(d, "yyyy-MM-dd") : "");
/** Noon local time, so the date survives any timezone the server formats it in. */
const fromDateInput = (v: string) => (v ? new Date(`${v}T12:00:00`) : null);

/** The meeting's action items: check off, capture, edit, remove. */
export function ActionItems({
  meetingId,
  agendaItemId,
  applicationId,
  actions,
  members,
  editable,
  viewerMemberId,
  stacked,
  emptyHint = "Nothing captured yet. Whatever someone agrees to do goes here, with a name on it — it then shows up in their inbox.",
}: {
  meetingId: string;
  /** Set in run mode so a new item is tied to the agenda item on screen. */
  agendaItemId?: string;
  applicationId?: string;
  actions: MeetingAction[];
  members: Member[];
  editable: boolean;
  viewerMemberId: string;
  /** Keep the capture form on two rows even on wide screens (narrow rails). */
  stacked?: boolean;
  emptyHint?: string;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [assignee, setAssignee] = React.useState(viewerMemberId);
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<MeetingAction | null>(null);
  // Captured once per mount: "overdue" doesn't need to tick.
  const [now] = React.useState(() => Date.now());

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const res = await createActionItem({
      meetingId,
      agendaItemId,
      applicationId,
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
      {actions.length === 0 ? (
        <p className="text-sm text-fg-muted">{emptyHint}</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {actions.map((a) => {
            const done = a.status === "done";
            const overdue = !done && a.dueAt != null && a.dueAt.getTime() < now;
            return (
              <li key={a.id} className="flex min-h-10 items-center gap-2.5 rounded-md px-1 py-1 max-md:min-h-12">
                <Checkbox
                  checked={done}
                  disabled={!editable}
                  onCheckedChange={(c) => toggle(a.id, c === true)}
                  aria-label={`Mark “${a.title}” ${done ? "not done" : "done"}`}
                  className="max-md:size-5"
                />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-sm", done && "text-fg-subtle line-through")}>{a.title}</div>
                  <div className="tnum text-xs text-fg-subtle">
                    <span className="font-mono text-[11px]">{formatRef("actionItem", a.ref)}</span>
                    {" · "}
                    {a.assigneeName ?? "Unassigned"}
                    {a.dueAt && (
                      <span className={overdue ? "text-danger" : undefined}>
                        {" · "}due {format(a.dueAt, "MMM d")}
                      </span>
                    )}
                  </div>
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 max-md:size-10"
                    onClick={() => setEditing(a)}
                    aria-label={`Edit “${a.title}”`}
                  >
                    <PencilIcon />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editable && (
        <form onSubmit={add} className={cn("flex flex-col gap-2", !stacked && "sm:flex-row")}>
          <Input
            placeholder="Who will do what…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={300}
            className="max-md:h-10"
            aria-label="New action item"
          />
          <div className="flex gap-2">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger
                className={cn("min-w-0 flex-1 max-md:h-10", !stacked && "sm:w-40 sm:flex-none")}
                aria-label="Assignee"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.id === viewerMemberId ? `${m.displayName} (me)` : m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" variant="secondary" className="shrink-0 max-md:h-10" disabled={busy || !title.trim()}>
              <PlusIcon />
              Add
            </Button>
          </div>
        </form>
      )}

      {editing && (
        <ActionItemDialog
          key={editing.id}
          action={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function ActionItemDialog({
  action,
  members,
  onClose,
  onSaved,
}: {
  action: MeetingAction;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [assignee, setAssignee] = React.useState(action.assigneeId ?? UNASSIGNED);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await updateActionItem({
      actionItemId: action.id,
      title: String(fd.get("title") ?? ""),
      assigneeMemberId: assignee === UNASSIGNED ? null : assignee,
      dueAt: fromDateInput(String(fd.get("dueAt") ?? "")),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onSaved();
    onClose();
  }

  async function remove() {
    setBusy(true);
    const res = await cancelActionItem({ actionItemId: action.id, cancelled: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onSaved();
    onClose();
    toast.success(`${formatRef("actionItem", action.ref)} removed`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const undo = await cancelActionItem({ actionItemId: action.id, cancelled: false });
          if (!undo.ok) toast.error(undo.error);
          else onSaved();
        },
      },
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {formatRef("actionItem", action.ref)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="action-title">What needs doing</Label>
            <Input id="action-title" name="title" required maxLength={300} defaultValue={action.title} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="action-due">Due</Label>
              <Input
                id="action-due"
                name="dueAt"
                type="date"
                className="tnum"
                defaultValue={dateInputValue(action.dueAt)}
              />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="danger-ghost" className="max-sm:h-10" onClick={remove} disabled={busy}>
              Remove
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" className="max-sm:h-10" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
