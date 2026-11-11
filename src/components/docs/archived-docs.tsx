"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestoreIcon } from "lucide-react";
import { toast } from "sonner";
import { setDocArchived } from "@/lib/actions/docs";
import { Button } from "@/components/ui/button";

/** Archived docs, collapsed at the foot of the list. Shown to partners and admins. */
export function ArchivedDocs({ docs }: { docs: { id: string; title: string; folder: string | null }[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function restore(id: string, title: string) {
    setBusyId(id);
    const res = await setDocArchived({ docId: id, archived: false });
    setBusyId(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`“${title}” restored`);
    router.refresh();
  }

  return (
    <details>
      <summary className="cursor-pointer py-1 text-xs font-medium text-fg-muted">
        Archived <span className="tnum text-fg-subtle">· {docs.length}</span>
      </summary>
      <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-panel">
        {docs.map((d) => (
          <li
            key={d.id}
            className="flex items-center justify-between gap-3 border-b border-border px-4 py-2 last:border-0"
          >
            <span className="min-w-0 truncate text-sm text-fg-muted">
              {d.title}
              <span className="text-fg-subtle"> · {d.folder ?? "General"}</span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 max-md:h-10"
              disabled={busyId === d.id}
              onClick={() => restore(d.id, d.title)}
            >
              <ArchiveRestoreIcon />
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
