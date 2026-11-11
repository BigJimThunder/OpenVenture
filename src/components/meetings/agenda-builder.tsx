"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
import {
  addAgendaItem,
  moveAgendaItem,
  removeAgendaItem,
  updateAgendaItem,
} from "@/lib/actions/meetings";
import { AGENDA_ITEM_KINDS, type AgendaItemKind, type AgendaItemStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { AGENDA_KIND_LABEL } from "./meeting-labels";
import { Field } from "@/components/patterns/field";

type Item = {
  id: string;
  title: string;
  kind: AgendaItemKind;
  status: AgendaItemStatus;
  durationMinutes: number | null;
  presenterMemberId: string | null;
  presenterName: string | null;
  applicationId: string | null;
  voteRoundId: string | null;
  notes: string | null;
};

type Suggestions = {
  applications: { applicationId: string; companyName: string; stageName: string }[];
  voteRounds: { id: string; title: string; memoId: string | null }[];
  overdueActions: { id: string; title: string; assigneeName: string | null }[];
};

const STATUS_BADGE: Partial<Record<AgendaItemStatus, { label: string; variant: "success" | "warning" | "neutral" }>> = {
  done: { label: "Done", variant: "success" },
  in_progress: { label: "Now", variant: "warning" },
  deferred: { label: "Deferred", variant: "neutral" },
};

const NO_PRESENTER = "none";

export function AgendaBuilder({
  meetingId,
  meetingMinutes,
  items,
  suggestions,
  editable,
  members,
}: {
  meetingId: string;
  meetingMinutes: number;
  items: Item[];
  suggestions: Suggestions;
  editable: boolean;
  members: { id: string; displayName: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<Item | null>(null);
  const [removing, setRemoving] = React.useState<Item | null>(null);

  async function add(input: {
    title: string;
    kind?: AgendaItemKind;
    applicationId?: string;
    voteRoundId?: string;
  }) {
    setBusy(true);
    const res = await addAgendaItem({ meetingId, kind: "other", ...input });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTitle("");
    router.refresh();
  }

  async function move(item: Item, direction: "up" | "down") {
    setBusy(true);
    const res = await moveAgendaItem({ agendaItemId: item.id, direction });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function remove(item: Item) {
    const res = await removeAgendaItem({ agendaItemId: item.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    router.refresh();
  }

  const planned = items.reduce((sum, i) => sum + (i.durationMinutes ?? 0), 0);
  const untimed = items.filter((i) => !i.durationMinutes).length;
  const hasSuggestions =
    suggestions.applications.length > 0 ||
    suggestions.voteRounds.length > 0 ||
    suggestions.overdueActions.length > 0;
  const chip =
    "min-h-9 cursor-pointer rounded-full border border-border bg-panel px-3 py-1 text-left text-xs transition-colors hover:border-border-strong hover:bg-bg-subtle disabled:opacity-50 max-md:min-h-10";

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-5 text-sm text-fg-muted">
          {editable
            ? "No agenda yet. Add what the meeting needs to cover — the suggestions below come from the pipeline. Run mode walks through these one at a time."
            : "This meeting had no agenda."}
        </p>
      ) : (
        <>
          <ol className="flex flex-col gap-1.5">
            {items.map((item, idx) => {
              const badge = STATUS_BADGE[item.status];
              return (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-start gap-2.5 rounded-lg border border-border bg-panel px-3 py-2.5",
                    item.status === "done" && "bg-bg-subtle/50"
                  )}
                >
                  <span className="tnum mt-0.5 w-4 shrink-0 text-xs text-fg-subtle">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn("text-sm font-medium", item.status === "done" && "text-fg-muted")}>
                        {item.applicationId ? (
                          <Link href={`/pipeline/${item.applicationId}`} className="hover:underline">
                            {item.title}
                          </Link>
                        ) : (
                          item.title
                        )}
                      </span>
                      {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                    </div>
                    <div className="tnum mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                      <span>{AGENDA_KIND_LABEL[item.kind]}</span>
                      {item.durationMinutes && <span>· {item.durationMinutes} min</span>}
                      {item.presenterName && <span>· {item.presenterName}</span>}
                    </div>
                    {item.notes && (
                      <p className="mt-1.5 border-l-2 border-border pl-2.5 text-xs whitespace-pre-line text-fg-muted">
                        {item.notes}
                      </p>
                    )}
                  </div>
                  {editable && (
                    <>
                      <div className="-mr-1 hidden shrink-0 md:flex">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy || idx === 0}
                          onClick={() => move(item, "up")}
                          aria-label={`Move ${item.title} up`}
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy || idx === items.length - 1}
                          onClick={() => move(item, "down")}
                          aria-label={`Move ${item.title} down`}
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setEditing(item)}
                          aria-label={`Edit ${item.title}`}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setRemoving(item)}
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                      {/* Phones: four icons would squeeze the title, so they fold into one menu. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-my-1 -mr-1.5 size-10 shrink-0 md:hidden"
                            aria-label={`Actions for ${item.title}`}
                          >
                            <MoreHorizontalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-44">
                          <DropdownMenuItem onSelect={() => setEditing(item)}>
                            <PencilIcon />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem disabled={idx === 0} onSelect={() => move(item, "up")}>
                            <ArrowUpIcon />
                            Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={idx === items.length - 1}
                            onSelect={() => move(item, "down")}
                          >
                            <ArrowDownIcon />
                            Move down
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-danger focus:text-danger"
                            onSelect={() => setRemoving(item)}
                          >
                            <Trash2Icon />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          {planned > 0 && (
            <p className={cn("tnum text-xs", planned > meetingMinutes ? "text-warning" : "text-fg-subtle")}>
              {planned} of {meetingMinutes} minutes planned
              {untimed > 0 && ` · ${untimed} item${untimed === 1 ? "" : "s"} without a time`}
              {planned > meetingMinutes && " — over the meeting's length"}
            </p>
          )}
        </>
      )}

      {editable && (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim()) add({ title: title.trim() });
            }}
          >
            <Input
              placeholder="Add an agenda item…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={300}
              className="max-md:h-10"
              aria-label="New agenda item"
            />
            <Button type="submit" variant="secondary" className="max-md:h-10" disabled={busy || !title.trim()}>
              <PlusIcon />
              Add
            </Button>
          </form>

          {hasSuggestions && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-fg-muted">Suggested from the pipeline</div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.applications.map((s) => (
                  <button
                    key={s.applicationId}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      add({
                        title: `${s.companyName} — ${s.stageName.toLowerCase()} review`,
                        kind: "application_review",
                        applicationId: s.applicationId,
                      })
                    }
                    className={chip}
                  >
                    <span className="font-medium">{s.companyName}</span>
                    <span className="text-fg-muted"> · in {s.stageName}</span>
                  </button>
                ))}
                {suggestions.voteRounds.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() => add({ title: s.title, kind: "ic_vote", voteRoundId: s.id })}
                    className={chip}
                  >
                    <span className="font-medium">{s.title}</span>
                    <span className="text-fg-muted"> · open vote</span>
                  </button>
                ))}
                {suggestions.overdueActions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      add({
                        title: `Overdue: ${s.title}${s.assigneeName ? ` (${s.assigneeName})` : ""}`,
                        kind: "admin",
                      })
                    }
                    className={chip}
                  >
                    <span className="font-medium">{s.title}</span>
                    <span className="text-warning"> · overdue</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {editing && (
        <AgendaItemDialog
          key={editing.id}
          item={editing}
          members={members}
          onClose={() => setEditing(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove “${removing.title}”?`}
          description={
            removing.notes
              ? "This item has notes, and they go with it. Action items captured under it are kept."
              : "It comes off the agenda. Action items captured under it are kept."
          }
          confirmLabel="Remove item"
          tone="danger"
          onConfirm={() => remove(removing)}
        />
      )}
    </div>
  );
}

function AgendaItemDialog({
  item,
  members,
  onClose,
  onSaved,
}: {
  item: Item;
  members: { id: string; displayName: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<AgendaItemKind>(item.kind);
  const [presenter, setPresenter] = React.useState(item.presenterMemberId ?? NO_PRESENTER);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const minutes = String(fd.get("durationMinutes") ?? "").trim();
    setBusy(true);
    const res = await updateAgendaItem({
      agendaItemId: item.id,
      title: String(fd.get("title") ?? ""),
      kind,
      durationMinutes: minutes ? Number(minutes) : null,
      presenterMemberId: presenter === NO_PRESENTER ? null : presenter,
      notes: String(fd.get("notes") ?? "").trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit agenda item</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Title">
            <Input id="agenda-title" name="title" required maxLength={300} defaultValue={item.title} />
          </Field>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field label="Type">
              {(control) => (
                <Select value={kind} onValueChange={(v) => setKind(v as AgendaItemKind)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENDA_ITEM_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {AGENDA_KIND_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <Field label="Minutes">
              <Input
                id="agenda-minutes"
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min={1}
                max={240}
                placeholder="—"
                className="tnum"
                defaultValue={item.durationMinutes ?? ""}
              />
            </Field>
          </div>
          <Field label="Presenter">
            {(control) => (
              <Select value={presenter} onValueChange={setPresenter}>
                <SelectTrigger {...control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRESENTER}>No one in particular</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label="Notes">
            <Textarea
              id="agenda-notes"
              name="notes"
              rows={4}
              maxLength={10000}
              placeholder="What was said or decided. Goes into the recap email."
              defaultValue={item.notes ?? ""}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : "Save item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
