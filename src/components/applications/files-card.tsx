"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { DownloadIcon, FileIcon, ImageIcon, PaperclipIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { FILE_KINDS, type FileKind } from "@/db/schema";
import { deleteFile, finishUpload, startUpload, uploadChunk } from "@/lib/actions/files";
import {
  ACCEPT_ATTRIBUTE,
  CHUNK_BYTES,
  FILE_KIND_LABEL,
  fileTypeFor,
  formatBytes,
  MAX_FILE_BYTES,
} from "@/lib/files";
import { can } from "@/lib/permissions";
import type { AttachedFile } from "@/lib/queries/files";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { useViewer } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

/** A Blob slice as base64, without holding the whole file in memory. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/**
 * Pitch decks, budgets and receipts for one application. Files are kept in
 * the club's own database and are only ever served to signed-in members.
 */
export function FilesCard({ applicationId, files }: { applicationId: string; files: AttachedFile[] }) {
  const router = useRouter();
  const viewer = useViewer();
  const canAttach = can(viewer.role, "contribute");
  const canRemoveAny = can(viewer.role, "partnerWork");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [kind, setKind] = React.useState<FileKind>("deck");
  const [upload, setUpload] = React.useState<{ name: string; percent: number } | null>(null);
  const [removing, setRemoving] = React.useState<AttachedFile | null>(null);

  async function attach(picked: File) {
    if (!fileTypeFor(picked.name)) {
      toast.error("That file type can't be attached. Use a PDF, an image, or a PowerPoint, Word, Excel, CSV or text file.");
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      toast.error(`That file is ${formatBytes(picked.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`);
      return;
    }
    if (picked.size === 0) {
      toast.error("That file is empty.");
      return;
    }
    setUpload({ name: picked.name, percent: 0 });
    try {
      const started = await startUpload({ applicationId, filename: picked.name, sizeBytes: picked.size, kind });
      if (!started.ok) throw new Error(started.error);
      const { fileId, chunkCount } = started.data;
      for (let seq = 0; seq < chunkCount; seq++) {
        const data = await toBase64(picked.slice(seq * CHUNK_BYTES, (seq + 1) * CHUNK_BYTES));
        const sent = await uploadChunk({ fileId, seq, data });
        if (!sent.ok) throw new Error(sent.error);
        setUpload({ name: picked.name, percent: Math.round(((seq + 1) / chunkCount) * 100) });
      }
      const finished = await finishUpload({ fileId });
      if (!finished.ok) throw new Error(finished.error);
      toast.success(`Attached ${picked.name}.`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The upload failed. Try again.");
    } finally {
      setUpload(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(target: AttachedFile) {
    const res = await deleteFile({ fileId: target.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success("Removed.");
    router.refresh();
  }

  return (
    <section id="files" className="scroll-mt-4 rounded-lg border border-border bg-panel shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 pt-3.5 pb-2.5">
        <div>
          <h2 className="text-sm font-semibold">Files</h2>
          <p className="mt-0.5 text-xs text-fg-muted">
            The deck, a budget, receipts. Only members of the club can open them.
          </p>
        </div>
        {canAttach && (
          <div className="flex items-center gap-2">
            <NativeSelect
              aria-label="What kind of file"
              value={kind}
              onChange={(e) => setKind(e.target.value as FileKind)}
              disabled={upload !== null}
              className="h-7 w-auto text-xs max-md:h-10 max-md:text-sm"
            >
              {FILE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FILE_KIND_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              aria-label="Choose a file to attach"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) void attach(picked);
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="max-md:h-10"
              disabled={upload !== null}
              onClick={() => inputRef.current?.click()}
            >
              <PaperclipIcon />
              Attach
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 pb-4">
        {upload && (
          <div className="rounded-md border border-border px-3 py-2.5" role="status" aria-live="polite">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">Uploading {upload.name}</span>
              <span className="tnum shrink-0 text-xs text-fg-muted">{upload.percent}%</span>
            </div>
            <Progress value={upload.percent} aria-label={`Uploading ${upload.name}`} className="mt-2" />
          </div>
        )}

        {files.length === 0 && !upload ? (
          <p className="rounded-md border border-dashed border-border-strong/70 px-3 py-5 text-center text-sm text-fg-muted">
            {canAttach
              ? `Nothing attached yet. PDFs, images and Office files up to ${formatBytes(MAX_FILE_BYTES)}.`
              : "Nothing attached yet."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {files.map((f) => {
              const mine = f.uploadedByMemberId === viewer.memberId;
              const Icon = f.mime.startsWith("image/") ? ImageIcon : FileIcon;
              return (
                <li key={f.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/files/${f.id}`}
                      download={f.filename}
                      className="block truncate text-sm font-medium underline-offset-2 outline-none hover:underline focus-visible:underline"
                    >
                      {f.filename}
                    </a>
                    <p className="truncate text-xs text-fg-muted">
                      {FILE_KIND_LABEL[f.kind]} · <span className="tnum">{formatBytes(f.sizeBytes)}</span>
                      {f.uploadedByName ? ` · ${f.uploadedByName}` : ""} · {format(f.createdAt, "MMM d, yyyy")}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" asChild>
                    <a href={`/api/files/${f.id}`} download={f.filename} aria-label={`Download ${f.filename}`}>
                      <DownloadIcon />
                    </a>
                  </Button>
                  {(mine || canRemoveAny) && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${f.filename}`}
                      onClick={() => setRemoving(f)}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.filename ?? "this file"}?`}
        description="The file is deleted from the club's records for everyone. This can't be undone."
        confirmLabel="Remove file"
        tone="danger"
        onConfirm={() => (removing ? remove(removing) : Promise.resolve())}
      />
    </section>
  );
}
