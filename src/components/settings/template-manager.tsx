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
} from "lucide-react";
import { toast } from "sonner";
import {
  addMemoTemplateSection,
  createMemoTemplate,
  deleteMemoTemplateSection,
  moveMemoTemplateSection,
  setDefaultMemoTemplate,
  setMemoTemplateArchived,
  updateMemoTemplate,
  updateMemoTemplateSection,
} from "@/lib/actions/memos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { Field } from "@/components/patterns/field";

type Section = {
  id: string;
  title: string;
  guidance: string | null;
  required: boolean;
};

export type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  archived: boolean;
  memoCount: number;
  sections: Section[];
};

type Result = { ok: true } | { ok: false; error: string };

/**
 * Memo templates: the section headings and gray guidance prompts a new memo
 * starts with. Changes apply to memos started afterwards — memos already
 * written keep the sections they have.
 */
export function TemplateManager({ templates }: { templates: TemplateRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [templateDialog, setTemplateDialog] = React.useState<TemplateRow | "new" | null>(null);
  const [sectionDialog, setSectionDialog] = React.useState<
    { templateId: string; section: Section | null } | null
  >(null);
  const [removing, setRemoving] = React.useState<Section | null>(null);

  const live = templates.filter((t) => !t.archived);
  const archived = templates.filter((t) => t.archived);

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
      {live.length === 0 && (
        <div className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-6 text-center">
          <p className="text-sm font-medium">No memo template yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            Without one, every new memo starts as a blank page. A template gives each memo the same
            sections — Team, Use of funds, Risks — so they can be compared.
          </p>
          <Button className="mt-4 max-md:h-10" onClick={() => setTemplateDialog("new")}>
            <PlusIcon />
            Create a template
          </Button>
        </div>
      )}

      {live.map((t) => (
        <div key={t.id} className="rounded-lg border border-border bg-panel shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t.name}</span>
                {t.isDefault && <Badge>Default</Badge>}
                <span className="tnum text-xs text-fg-subtle">
                  {t.memoCount === 0 ? "not used yet" : `${t.memoCount} memo${t.memoCount === 1 ? "" : "s"}`}
                </span>
              </div>
              {t.description && <p className="mt-0.5 text-xs text-fg-muted">{t.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              {!t.isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  disabled={busy}
                  onClick={() =>
                    run(() => setDefaultMemoTemplate({ templateId: t.id }), `New memos now start from ${t.name}`)
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
                onClick={() => setTemplateDialog(t)}
                aria-label={`Rename ${t.name}`}
              >
                <PencilIcon />
              </Button>
              {!t.isDefault && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  disabled={busy}
                  onClick={() =>
                    run(() => setMemoTemplateArchived({ templateId: t.id, archived: true }), `${t.name} archived`)
                  }
                  aria-label={`Archive ${t.name}`}
                >
                  <ArchiveIcon />
                </Button>
              )}
            </div>
          </div>

          <ol className="divide-y divide-border">
            {t.sections.length === 0 && (
              <li className="px-4 py-3 text-sm text-fg-muted">
                No sections yet. Add the headings a memo should always cover.
              </li>
            )}
            {t.sections.map((s, i) => (
              <li key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                <span className="tnum mt-0.5 w-4 shrink-0 text-xs text-fg-subtle">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{s.title}</span>
                    {s.required && <Badge variant="neutral">Required</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {s.guidance ?? <span className="text-fg-subtle">No guidance prompt</span>}
                  </p>
                </div>
                <div className="flex shrink-0">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    disabled={busy || i === 0}
                    onClick={() => run(() => moveMemoTemplateSection({ sectionId: s.id, direction: "up" }))}
                    aria-label={`Move ${s.title} up`}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    disabled={busy || i === t.sections.length - 1}
                    onClick={() => run(() => moveMemoTemplateSection({ sectionId: s.id, direction: "down" }))}
                    aria-label={`Move ${s.title} down`}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    onClick={() => setSectionDialog({ templateId: t.id, section: s })}
                    aria-label={`Edit ${s.title}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-9"
                    onClick={() => setRemoving(s)}
                    aria-label={`Remove ${s.title}`}
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
              onClick={() => setSectionDialog({ templateId: t.id, section: null })}
            >
              <PlusIcon />
              Add section
            </Button>
          </div>
        </div>
      ))}

      {live.length > 0 && (
        <div>
          <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setTemplateDialog("new")}>
            <PlusIcon />
            New template
          </Button>
        </div>
      )}

      {archived.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-fg-muted">
            {archived.length} archived template{archived.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {archived.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="min-w-0 truncate text-fg-muted">{t.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    run(() => setMemoTemplateArchived({ templateId: t.id, archived: false }), `${t.name} restored`)
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

      {templateDialog && (
        <TemplateDialog
          key={templateDialog === "new" ? "new" : templateDialog.id}
          template={templateDialog === "new" ? null : templateDialog}
          onClose={() => setTemplateDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {sectionDialog && (
        <SectionDialog
          key={sectionDialog.section?.id ?? `new-${sectionDialog.templateId}`}
          templateId={sectionDialog.templateId}
          section={sectionDialog.section}
          onClose={() => setSectionDialog(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title={`Remove “${removing.title}”?`}
          description="New memos will no longer include this section. Memos already written keep it, with their text — they only lose the guidance prompt."
          confirmLabel="Remove section"
          tone="danger"
          onConfirm={() => run(() => deleteMemoTemplateSection({ sectionId: removing.id }), "Section removed")}
        />
      )}
    </div>
  );
}

function TemplateDialog({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | null;
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
    const res = template
      ? await updateMemoTemplate({ templateId: template.id, ...fields })
      : await createMemoTemplate(fields);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(template ? "Template saved" : "Template created — add its sections next");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New memo template"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              id="tpl-name"
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoFocus
              placeholder="Grant memo"
              defaultValue={template?.name ?? ""}
            />
          </Field>
          <Field label="When to use it">
            <Input
              id="tpl-desc"
              name="description"
              maxLength={300}
              placeholder="Standard memo for grants under $4,000"
              defaultValue={template?.description ?? ""}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : template ? "Save" : "Create template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionDialog({
  templateId,
  section,
  onClose,
  onSaved,
}: {
  templateId: string;
  section: Section | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [required, setRequired] = React.useState(section?.required ?? false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      title: String(fd.get("title") ?? ""),
      guidance: String(fd.get("guidance") ?? "").trim() || null,
      required,
    };
    setBusy(true);
    const res = section
      ? await updateMemoTemplateSection({ sectionId: section.id, ...fields })
      : await addMemoTemplateSection({ templateId, ...fields });
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
          <DialogTitle>{section ? "Edit section" : "Add a section"}</DialogTitle>
          <DialogDescription>
            Applies to memos started from now on. Existing memos are not rewritten.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Heading">
            <Input
              id="sec-title"
              name="title"
              required
              maxLength={120}
              autoFocus
              placeholder="Use of funds"
              defaultValue={section?.title ?? ""}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sec-guidance">Guidance prompt</Label>
            <Textarea
              id="sec-guidance"
              name="guidance"
              rows={3}
              maxLength={600}
              showCount
              placeholder="What exactly does the money buy, and what does it unblock?"
              defaultValue={section?.guidance ?? ""}
            />
            <p className="text-xs text-fg-subtle">
              Shown in gray in the empty section, and given to the AI draft as the brief for it.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              checked={required}
              onCheckedChange={(c) => setRequired(c === true)}
              className="mt-0.5"
            />
            <span>
              Required
              <span className="block text-xs text-fg-muted">
                A memo can&apos;t be circulated while a required section is empty.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : section ? "Save section" : "Add section"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
