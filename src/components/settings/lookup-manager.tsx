"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, CheckIcon, PencilIcon, PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ActionResult = { ok: true } | { ok: false; error: string };

export type LookupItem = {
  id: string;
  label: string;
  hint?: string | null;
};

/**
 * One list editor for all three lookup tables (criteria, sectors, sources).
 * The server actions differ; the interaction — inline add, inline rename,
 * archive with confirm — is identical.
 */
export function LookupManager({
  items,
  addPlaceholder,
  onCreate,
  onRename,
  onArchive,
}: {
  items: LookupItem[];
  addPlaceholder: string;
  onCreate: (label: string) => Promise<ActionResult>;
  onRename: (id: string, label: string) => Promise<ActionResult>;
  onArchive: (id: string) => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");

  async function run(fn: () => Promise<ActionResult>, successMsg?: string) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    if (successMsg) toast.success(successMsg);
    router.refresh();
    return true;
  }

  async function create() {
    const label = newLabel.trim();
    if (!label) return;
    if (await run(() => onCreate(label))) {
      setNewLabel("");
      setAdding(false);
    }
  }

  async function rename(id: string) {
    const label = editLabel.trim();
    if (!label) return;
    if (await run(() => onRename(id, label))) setEditingId(null);
  }

  return (
    <div className="flex flex-col gap-1">
      {items.length === 0 && <p className="text-sm text-fg-muted">Nothing here yet.</p>}
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-bg-subtle"
        >
          {editingId === item.id ? (
            <>
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    rename(item.id);
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                autoFocus
                className="h-7"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy}
                onClick={() => rename(item.id)}
                aria-label="Save"
              >
                <CheckIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditingId(null)}
                aria-label="Cancel"
              >
                <XIcon />
              </Button>
            </>
          ) : (
            <>
              <span className="min-w-0 truncate">{item.label}</span>
              {item.hint && (
                <span className="shrink-0 text-2xs text-fg-subtle">{item.hint}</span>
              )}
              <span className="ml-auto flex shrink-0 items-center">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditingId(item.id);
                    setEditLabel(item.label);
                  }}
                  aria-label={`Rename ${item.label}`}
                >
                  <PencilIcon />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Archive “${item.label}”? Existing records keep it.`)) {
                      run(() => onArchive(item.id), "Archived");
                    }
                  }}
                  aria-label={`Archive ${item.label}`}
                >
                  <ArchiveIcon />
                </Button>
              </span>
            </>
          )}
        </div>
      ))}
      {adding ? (
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={addPlaceholder}
            autoFocus
            className="h-7"
          />
          <Button size="sm" disabled={busy} onClick={create}>
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="pt-1">
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <PlusIcon />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
