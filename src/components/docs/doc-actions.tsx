"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon, PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { setDocArchived, togglePinDoc } from "@/lib/actions/docs";
import { useCan, useViewer } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { DocFormDialog, type EditableDoc } from "./doc-form-dialog";

/** The "…" menu on a doc: details, pin, print, archive — each only if the viewer may. */
export function DocActions({
  doc,
  pinned,
  createdByMemberId,
  folders,
}: {
  doc: EditableDoc;
  pinned: boolean;
  createdByMemberId: string | null;
  folders: string[];
}) {
  const router = useRouter();
  const viewer = useViewer();
  const canWrite = useCan("contribute");
  const isPartner = useCan("partnerWork");
  const canArchive = canWrite && (isPartner || createdByMemberId === viewer.memberId);
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  async function togglePin() {
    const res = await togglePinDoc({ docId: doc.id, pinned: !pinned });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function archive() {
    const res = await setDocArchived({ docId: doc.id, archived: true });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    router.push("/docs");
    router.refresh();
    toast.success(`“${doc.title}” archived`, {
      action: {
        label: "Undo",
        onClick: async () => {
          const undo = await setDocArchived({ docId: doc.id, archived: false });
          if (!undo.ok) toast.error(undo.error);
          else router.refresh();
        },
      },
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="max-md:size-10" aria-label="Doc actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {canWrite && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <PencilIcon />
              Rename or move
            </DropdownMenuItem>
          )}
          {isPartner && (
            <DropdownMenuItem onSelect={togglePin}>
              {pinned ? <PinOffIcon /> : <PinIcon />}
              {pinned ? "Unpin" : "Pin to the top"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => window.print()}>
            <PrinterIcon />
            Print or save as PDF
          </DropdownMenuItem>
          {canArchive && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setArchiveOpen(true)}>
                <ArchiveIcon />
                Archive
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && <DocFormDialog doc={doc} folders={folders} open onOpenChange={setEditOpen} />}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={`Archive “${doc.title}”?`}
        description="It disappears from the docs list for everyone. Nothing is deleted, and you can undo straight away."
        confirmLabel="Archive doc"
        tone="danger"
        onConfirm={archive}
      />
    </>
  );
}
