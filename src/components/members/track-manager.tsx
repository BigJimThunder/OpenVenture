"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  addOnboardingTask,
  createOnboardingTrack,
  deleteOnboardingTask,
  moveOnboardingTask,
  setDefaultOnboardingTrack,
  setOnboardingTrackArchived,
  suggestOnboardingResource,
  updateOnboardingTask,
  updateOnboardingTrack,
} from "@/lib/actions/onboarding";
import type { OnboardingTaskKind } from "@/db/schema";
import { DEFAULT_CONFIDENTIALITY_TEXT } from "@/lib/defaults";
import { detectKind, KIND_META, KIND_ORDER, linkHost, videoEmbed } from "@/lib/onboarding/resource";
import { cn } from "@/lib/utils";
import { EnrolDialog } from "@/components/onboarding/enrol-dialog";
import { ItemStep } from "@/components/onboarding/start-steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { Field } from "@/components/patterns/field";

type Task = {
  id: string;
  title: string;
  kind: OnboardingTaskKind;
  description: string | null;
  resourceUrl: string | null;
  docId: string | null;
  required: boolean;
  estimatedMinutes: number | null;
};

type DocOption = { id: string; title: string };

/** What a task row says under its title. */
function taskMeta(task: Task, docs: DocOption[]): string {
  const source = task.docId
    ? `doc: ${docs.find((d) => d.id === task.docId)?.title ?? "no longer available"}`
    : task.resourceUrl
      ? (videoEmbed(task.resourceUrl)?.provider ?? linkHost(task.resourceUrl))
      : null;
  return [
    KIND_META[task.kind].label,
    task.required ? "required" : "optional",
    task.estimatedMinutes ? `${task.estimatedMinutes} min` : null,
    source,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
export function TrackManager({
  tracks,
  members,
  docs,
}: {
  tracks: TrackRow[];
  members: Member[];
  /** Docs every member can open — the only ones a track may link to. */
  docs: DocOption[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [trackDialog, setTrackDialog] = React.useState<TrackRow | "new" | null>(null);
  const [taskDialog, setTaskDialog] = React.useState<{ trackId: string; task: Task | null } | null>(null);
  const [assigning, setAssigning] = React.useState<TrackRow | null>(null);
  const [previewing, setPreviewing] = React.useState<TrackRow | null>(null);
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
              <Button
                variant="secondary"
                size="sm"
                className="max-md:h-10"
                disabled={t.tasks.length === 0}
                onClick={() => setPreviewing(t)}
              >
                <EyeIcon />
                Preview
              </Button>
              <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setAssigning(t)}>
                <UserPlusIcon />
                Enrol
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
                Nothing here yet. Paste a link to a video or an article, or add the confidentiality
                acknowledgement. Required items come before the member gets into the app.
              </li>
            )}
            {t.tasks.map((task, i) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2">
                <span className="tnum w-4 shrink-0 text-xs text-fg-subtle">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{task.title}</div>
                  <div className="tnum truncate text-xs text-fg-subtle">{taskMeta(task, docs)}</div>
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
              Add an item
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
          docs={docs}
          onClose={() => setTaskDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {assigning && (
        <EnrolDialog
          key={assigning.id}
          tracks={[{ id: assigning.id, name: assigning.name, assignedMemberIds: assigning.assignedMemberIds }]}
          initialTrackId={assigning.id}
          members={members}
          onClose={() => setAssigning(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {previewing && <PreviewDialog key={previewing.id} track={previewing} onClose={() => setPreviewing(null)} />}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove “${removing.title}”?`}
          description="The item comes off the track for everyone, and any ticks members made against it are removed with it. This can't be undone."
          confirmLabel="Remove item"
          tone="danger"
          onConfirm={() => run(() => deleteOnboardingTask({ taskId: removing.id }), "Item removed")}
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

/**
 * Add or edit one item. Built so that the common case — "everyone has to watch
 * this" — is: paste the link, glance at the title, press Add.
 */
function TaskDialog({
  trackId,
  task,
  docs,
  onClose,
  onSaved,
}: {
  trackId: string;
  task: Task | null;
  docs: DocOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<OnboardingTaskKind>(task?.kind ?? "read");
  const [url, setUrl] = React.useState(task?.resourceUrl ?? "");
  const [docId, setDocId] = React.useState<string | null>(task?.docId ?? null);
  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [minutes, setMinutes] = React.useState(task?.estimatedMinutes ? String(task.estimatedMinutes) : "");
  const [required, setRequired] = React.useState(task?.required ?? true);
  const [looking, setLooking] = React.useState(false);

  const detected = url.trim() ? detectKind(url) : null;
  const usesLink = kind === "read" || kind === "watch" || kind === "do" || kind === "meet";
  const usesDoc = kind === "read" && docs.length > 0;

  // A pasted link picks the type and offers a title; nothing the admin already typed is overwritten.
  async function onLink(next: string) {
    setUrl(next);
    const found = detectKind(next);
    if (!found) return;
    if (kind === "read" || kind === "watch") setKind(found.kind);
    setDocId(null);
    if (title.trim()) return;
    setLooking(true);
    const res = await suggestOnboardingResource({ url: next.trim() });
    setLooking(false);
    if (res.ok && res.data.title) setTitle((current) => current || res.data.title || "");
  }

  function pickKind(next: OnboardingTaskKind) {
    setKind(next);
    if (next === "submit") {
      if (!description.trim()) setDescription(DEFAULT_CONFIDENTIALITY_TEXT);
      if (!title.trim()) setTitle("Blind votes and confidentiality");
    }
    if (next !== "read") setDocId(null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fields = {
      title,
      kind,
      description: description.trim() || null,
      resourceUrl: usesLink && !docId ? url.trim() || null : null,
      docId: kind === "read" ? docId : null,
      required,
      estimatedMinutes: minutes ? Number(minutes) : null,
    };
    setBusy(true);
    const res = task
      ? await updateOnboardingTask({ taskId: task.id, ...fields })
      : await addOnboardingTask({ trackId, ...fields });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.code === "validation" ? "Check the link. It needs to be a full https:// address." : res.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{task ? "Edit item" : "Add to the track"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Type" hint={KIND_META[kind].hint}>
            {(field) => (
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type" aria-describedby={field["aria-describedby"]}>
                {KIND_ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => pickKind(k)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-10",
                      kind === k
                        ? "border-accent bg-accent-subtle font-medium text-accent"
                        : "border-border text-fg-muted hover:border-border-strong hover:text-fg"
                    )}
                  >
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {usesLink && !docId && (
            <Field
              label="Link"
              optional={kind === "do" || kind === "meet"}
              hint={
                detected && (kind === "read" || kind === "watch")
                  ? detected.kind === "watch"
                    ? `${detected.provider} video. It plays inside the flow.`
                    : kind === "watch"
                      ? "We can't embed this one, so it opens in a new tab."
                      : `Article on ${linkHost(url)}. It opens in a new tab and the member confirms they read it.`
                  : undefined
              }
            >
              <Input
                type="url"
                inputMode="url"
                maxLength={500}
                autoFocus={!task}
                placeholder="Paste a YouTube, Vimeo, Loom or article link"
                value={url}
                onChange={(e) => onLink(e.target.value)}
                className="max-md:h-10"
              />
            </Field>
          )}

          {usesDoc && (
            <Field
              label={docId ? "Club doc" : "Or one of the club's docs"}
              hint={docId ? "The doc is shown inside the flow, and the member confirms at the end of it." : undefined}
            >
              {(field) => (
                <Select value={docId ?? "none"} onValueChange={(v) => setDocId(v === "none" ? null : v)}>
                  <SelectTrigger className="max-md:h-10" {...field}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Use the link above</SelectItem>
                    {docs.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          )}

          <Field label="Title">
            <Input
              required
              maxLength={160}
              placeholder={looking ? "Looking up the title…" : "How we decide: the pipeline in five minutes"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="max-md:h-10"
            />
          </Field>

          <Field label={kind === "submit" ? "What they agree to" : "Note to the member"} optional={kind !== "submit"}>
            <Textarea
              rows={kind === "submit" ? 6 : 2}
              maxLength={4000}
              required={kind === "submit"}
              placeholder={
                kind === "submit"
                  ? "The policy, in plain words."
                  : "Why it matters, or what to look for."
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3">
            <label className="flex min-h-10 cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox checked={required} onCheckedChange={(c) => setRequired(c === true)} className="mt-0.5" />
              <span>
                Required
                <span className="block text-xs text-fg-muted">
                  {required && (kind === "do" || kind === "meet")
                    ? "Required items come before the member gets into the app. If this needs the app, make it optional."
                    : "Members can't use the rest of the app until every required item is done."}
                </span>
              </span>
            </label>
            <Field label="Minutes">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={600}
                placeholder="5"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className="tnum max-md:h-10"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : task ? "Save" : "Add to track"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Step through the required items exactly as a new member meets them. Nothing is saved. */
function PreviewDialog({ track, onClose }: { track: TrackRow; onClose: () => void }) {
  const required = track.tasks.filter((t) => t.required);
  const optional = track.tasks.length - required.length;
  const [index, setIndex] = React.useState(0);
  const task = required[index];
  const minutes = required.reduce((n, t) => n + (t.estimatedMinutes ?? 0), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>What a new member sees</DialogTitle>
        </DialogHeader>
        {!task ? (
          <p className="text-sm text-fg-muted">
            {required.length === 0
              ? `No required items, so a new member confirms their details and goes straight into the app.${optional > 0 ? ` The ${optional} optional item${optional === 1 ? "" : "s"} are offered on a last “Also worth doing” screen.` : ""}`
              : `That's the end of it. After the last required item${optional > 0 ? ` they are offered the ${optional} optional item${optional === 1 ? "" : "s"}, then` : ""} they land in the app.`}
          </p>
        ) : (
          <div className="flex flex-col">
            <p className="tnum text-xs font-medium text-fg-subtle">
              After their details · item {index + 1} of {required.length}
              {minutes > 0 && ` · about ${minutes + 1} min in all`}
            </p>
            <p className="tnum mt-3 text-xs font-medium text-fg-subtle">
              {KIND_META[task.kind].label}
              {task.estimatedMinutes ? ` · ${task.estimatedMinutes} min` : ""} · Required
            </p>
            <h3 className="mt-1 mb-4 text-lg leading-tight font-semibold tracking-tight">{task.title}</h3>
            <ItemStep
              key={task.id}
              backKey=""
              nextKey=""
              item={{
                id: task.id,
                assignmentId: "",
                title: task.title,
                description: task.description,
                kind: task.kind,
                resourceUrl: task.resourceUrl,
                done: false,
              }}
              reader={
                task.docId ? (
                  <p className="text-sm text-fg-muted">The doc is shown here in full, and they confirm at the end of it.</p>
                ) : undefined
              }
              onPreviewContinue={() => setIndex((i) => i + 1)}
            />
          </div>
        )}
        {!task && (
          <DialogFooter>
            {required.length > 0 && (
              <Button variant="secondary" className="max-sm:h-10" onClick={() => setIndex(0)}>
                Start again
              </Button>
            )}
            <Button className="max-sm:h-10" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
