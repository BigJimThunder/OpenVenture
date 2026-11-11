"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  addOnboardingTask,
  assignOnboardingTrack,
  createOnboardingTrack,
  deleteOnboardingTask,
  moveOnboardingTask,
  setDefaultOnboardingTrack,
  setOnboardingTrackArchived,
  updateOnboardingTask,
  updateOnboardingTrack,
} from "@/lib/actions/onboarding";
import { ONBOARDING_TASK_KINDS, type OnboardingTaskKind } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { Field } from "@/components/patterns/field";

const KIND_LABEL: Record<OnboardingTaskKind, string> = {
  read: "Read",
  watch: "Watch",
  do: "Do",
  meet: "Meet",
  submit: "Submit",
};

type Task = {
  id: string;
  title: string;
  kind: OnboardingTaskKind;
  resourceUrl: string | null;
  required: boolean;
};

export type TrackRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  assignedCount: number;
  /** Member ids already on the track. */
  assignedMemberIds: string[];
  tasks: Task[];
};

type Result = { ok: true } | { ok: false; error: string };
type Member = { id: string; displayName: string };

/** Admin editor for onboarding tracks: tasks, order, default, who is on them. */
export function TrackManager({ tracks, members }: { tracks: TrackRow[]; members: Member[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [trackDialog, setTrackDialog] = React.useState<TrackRow | "new" | null>(null);
  const [taskDialog, setTaskDialog] = React.useState<{ trackId: string; task: Task | null } | null>(null);
  const [assigning, setAssigning] = React.useState<TrackRow | null>(null);
  const [removing, setRemoving] = React.useState<Task | null>(null);
  const [archiving, setArchiving] = React.useState<TrackRow | null>(null);

  const live = tracks.filter((t) => !t.archived);
  const archived = tracks.filter((t) => t.archived);

  async function run(fn: () => Promise<Result>, success?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (success) toast.success(success);
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-col gap-3">
      {live.map((t) => (
        <div key={t.id} className="rounded-lg border border-border bg-panel shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t.name}</span>
                {t.isDefault && <Badge>Default for new invites</Badge>}
                <span className="tnum text-xs text-fg-subtle">
                  {t.assignedCount} member{t.assignedCount === 1 ? "" : "s"}
                </span>
              </div>
              {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setAssigning(t)}>
                <UserPlusIcon />
                Assign
              </Button>
              {!t.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  disabled={busy}
                  onClick={() =>
                    run(() => setDefaultOnboardingTrack({ trackId: t.id }), `New invites now start on ${t.name}`)
                  }
                >
                  <StarIcon />
                  Make default
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                onClick={() => setTrackDialog(t)}
                aria-label={`Rename ${t.name}`}
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                onClick={() => setArchiving(t)}
                aria-label={`Archive ${t.name}`}
              >
                <ArchiveIcon />
              </Button>
            </div>
          </div>
          <ol className="divide-y divide-border">
            {t.tasks.length === 0 && (
              <li className="px-4 py-3 text-sm text-fg-muted">
                No tasks yet. Add the handful of things a new member should do in their first two weeks.
              </li>
            )}
            {t.tasks.map((task, i) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2">
                <span className="tnum w-4 shrink-0 text-xs text-fg-subtle">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{task.title}</div>
                  <div className="text-xs text-fg-subtle">
                    {KIND_LABEL[task.kind]}
                    {!task.required && " · optional"}
                    {task.resourceUrl && " · has a link"}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    disabled={busy || i === 0}
                    onClick={() => run(() => moveOnboardingTask({ taskId: task.id, direction: "up" }))}
                    aria-label={`Move ${task.title} up`}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    disabled={busy || i === t.tasks.length - 1}
                    onClick={() => run(() => moveOnboardingTask({ taskId: task.id, direction: "down" }))}
                    aria-label={`Move ${task.title} down`}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    onClick={() => setTaskDialog({ trackId: t.id, task })}
                    aria-label={`Edit ${task.title}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    onClick={() => setRemoving(task)}
                    aria-label={`Remove ${task.title}`}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-border px-4 py-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="max-md:h-10"
              onClick={() => setTaskDialog({ trackId: t.id, task: null })}
            >
              <PlusIcon />
              Add task
            </Button>
          </div>
        </div>
      ))}

      <div>
        <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setTrackDialog("new")}>
          <PlusIcon />
          New track
        </Button>
      </div>

      {archived.length > 0 && (
        <details>
          <summary className="cursor-pointer py-1 text-xs font-medium text-fg-muted">
            Archived tracks <span className="tnum text-fg-subtle">· {archived.length}</span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate text-fg-muted">{t.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  disabled={busy}
                  onClick={() =>
                    run(() => setOnboardingTrackArchived({ trackId: t.id, archived: false }), `${t.name} restored`)
                  }
                >
                  <ArchiveRestoreIcon />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {trackDialog && (
        <TrackDialog
          key={trackDialog === "new" ? "new" : trackDialog.id}
          track={trackDialog === "new" ? null : trackDialog}
          onClose={() => setTrackDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {taskDialog && (
        <TaskDialog
          key={taskDialog.task?.id ?? `new-${taskDialog.trackId}`}
          trackId={taskDialog.trackId}
          task={taskDialog.task}
          onClose={() => setTaskDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {assigning && (
        <AssignDialog
          key={assigning.id}
          track={assigning}
          members={members}
          onClose={() => setAssigning(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove “${removing.title}”?`}
          description="The task comes off the track for everyone, and any ticks members made against it are removed with it. This can't be undone."
          confirmLabel="Remove task"
          tone="danger"
          onConfirm={() => run(() => deleteOnboardingTask({ taskId: removing.id }), "Task removed")}
        />
      )}
      {archiving && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setArchiving(null)}
          title={`Archive ${archiving.name}?`}
          description={
            archiving.isDefault
              ? "This is the default track. Once it is archived, new invites won't be put on any track until you make another one the default. Members already on it keep their progress, and you can restore it."
              : "It disappears from this page. Members already on it keep their progress, and you can restore it."
          }
          confirmLabel="Archive track"
          tone="danger"
          onConfirm={() =>
            run(() => setOnboardingTrackArchived({ trackId: archiving.id, archived: true }), `${archiving.name} archived`)
          }
        />
      )}
    </div>
  );
}

function TrackDialog({
  track,
  onClose,
  onSaved,
}: {
  track: TrackRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      name: String(fd.get("name") ?? ""),
      description: String(fd.get("description") ?? "").trim() || null,
    };
    setBusy(true);
    const res = track
      ? await updateOnboardingTrack({ trackId: track.id, ...fields })
      : await createOnboardingTrack(fields);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(track ? "Track saved" : "Track created — add its tasks next");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{track ? "Edit track" : "New onboarding track"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              id="track-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoFocus
              placeholder="New analyst onboarding"
              defaultValue={track?.name ?? ""}
            />
          </Field>
          <Field label="Who it is for">
            <Input
              id="track-desc"
              name="description"
              maxLength={300}
              placeholder="Everyone in their first two weeks"
              defaultValue={track?.description ?? ""}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : track ? "Save" : "Create track"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TaskDialog({
  trackId,
  task,
  onClose,
  onSaved,
}: {
  trackId: string;
  task: Task | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<OnboardingTaskKind>(task?.kind ?? "do");
  const [required, setRequired] = React.useState(task?.required ?? true);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      title: String(fd.get("title") ?? ""),
      kind,
      resourceUrl: String(fd.get("resourceUrl") ?? "").trim() || null,
      required,
    };
    setBusy(true);
    const res = task
      ? await updateOnboardingTask({ taskId: task.id, ...fields })
      : await addOnboardingTask({ trackId, ...fields });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.code === "validation" ? "Check the link — it needs to be a full https:// URL." : res.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "Add a task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Task">
            <Input
              id="task-title"
              name="title"
              required
              maxLength={160}
              autoFocus
              placeholder="Shadow a coffee chat"
              defaultValue={task?.title ?? ""}
            />
          </Field>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Field label="Type">
              {(control) => (
                <Select value={kind} onValueChange={(v) => setKind(v as OnboardingTaskKind)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ONBOARDING_TASK_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Link (optional)">
              <Input
                id="task-url"
                name="resourceUrl"
                type="url"
                maxLength={500}
                placeholder="https://…"
                defaultValue={task?.resourceUrl ?? ""}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={required} onCheckedChange={(c) => setRequired(c === true)} className="mt-0.5" />
            <span>
              Required
              <span className="block text-xs text-fg-muted">
                Onboarding counts as complete once every required task is ticked.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : task ? "Save task" : "Add task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssignDialog({
  track,
  members,
  onClose,
  onSaved,
}: {
  track: TrackRow;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const already = new Set(track.assignedMemberIds);
  const available = members.filter((m) => !already.has(m.id));

  async function submit() {
    setBusy(true);
    const res = await assignOnboardingTrack({ trackId: track.id, memberIds: [...picked] });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.data.assigned} member${res.data.assigned === 1 ? "" : "s"} added to ${track.name}`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign {track.name}</DialogTitle>
          <DialogDescription>
            New invites get the default track on their own. Use this for members who joined before it
            existed, or for an extra track.
          </DialogDescription>
        </DialogHeader>
        {available.length === 0 ? (
          <p className="text-sm text-fg-muted">Every current member is already on this track.</p>
        ) : (
          <>
            <div className="flex max-h-72 flex-col overflow-y-auto rounded-md border border-border p-1">
              {available.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm hover:bg-bg-subtle max-md:min-h-11"
                >
                  <Checkbox
                    checked={picked.has(m.id)}
                    onCheckedChange={(c) => {
                      const next = new Set(picked);
                      if (c) next.add(m.id);
                      else next.delete(m.id);
                      setPicked(next);
                    }}
                  />
                  {m.displayName}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="cursor-pointer self-start text-xs text-accent underline-offset-2 hover:underline"
              onClick={() =>
                setPicked(picked.size === available.length ? new Set() : new Set(available.map((m) => m.id)))
              }
            >
              {picked.size === available.length ? "Clear selection" : `Select all ${available.length}`}
            </button>
          </>
        )}
        <DialogFooter>
          <Button variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="max-sm:h-10" onClick={submit} disabled={busy || picked.size === 0}>
            {busy ? "Assigning…" : picked.size === 0 ? "Assign" : `Assign ${picked.size}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
