"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createDoc, updateDocMeta } from "@/lib/actions/docs";
import { DOC_VISIBILITIES, type DocVisibility } from "@/db/schema";
import { can } from "@/lib/permissions";
import { useViewer } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { VISIBILITY_LABEL } from "./doc-labels";

export type EditableDoc = {
  id: string;
  title: string;
  folder: string | null;
  visibility: DocVisibility;
};

/** Create a doc, or edit an existing doc's title, folder and audience. */
export function DocFormDialog({
  doc,
  folders,
  open,
  onOpenChange,
}: {
  /** Omit to create. */
  doc?: EditableDoc;
  /** Existing folder names, offered as suggestions. */
  folders: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const viewer = useViewer();
  const [busy, setBusy] = React.useState(false);
  const [visibility, setVisibility] = React.useState<DocVisibility>(doc?.visibility ?? "all");

  // A member can only pick an audience they belong to; only partners+ can change it at all.
  const allowed = DOC_VISIBILITIES.filter(
    (v) => v === "all" || (v === "partners" && can(viewer.role, "partnerWork")) || (v === "admins" && can(viewer.role, "manageClub"))
  );
  const canChangeAudience = allowed.length > 1;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "");
    const folder = String(fd.get("folder") ?? "").trim();
    setBusy(true);
    if (doc) {
      const res = await updateDocMeta({ docId: doc.id, title, folder: folder || null, visibility });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Doc details saved");
      onOpenChange(false);
      router.refresh();
      return;
    }
    const res = await createDoc({ title, folder: folder || undefined, visibility });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onOpenChange(false);
    router.push(`/docs/${res.data.slug}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{doc ? "Doc details" : "New doc"}</DialogTitle>
          {doc && (
            <DialogDescription>Renaming keeps the link — anything pointing at this doc still works.</DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-title">Title</Label>
            <Input
              id="doc-title"
              name="title"
              required
              maxLength={200}
              autoFocus={!doc}
              placeholder="How we screen applications"
              defaultValue={doc?.title ?? ""}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="doc-folder">Folder</Label>
            <Input
              id="doc-folder"
              name="folder"
              maxLength={80}
              list="doc-folders"
              placeholder="General"
              defaultValue={doc?.folder ?? ""}
            />
            <datalist id="doc-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <p className="text-xs text-fg-subtle">Type a new name to start a folder. Empty files it under General.</p>
          </div>
          {canChangeAudience && (
            <div className="flex flex-col gap-1.5">
              <Label>Who can see it</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as DocVisibility)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((v) => (
                    <SelectItem key={v} value={v}>
                      {VISIBILITY_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="max-sm:h-10"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : doc ? "Save" : "Create doc"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
