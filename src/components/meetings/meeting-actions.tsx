"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BanIcon, MoreHorizontalIcon, PencilIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteMeeting, setMeetingCancelled } from "@/lib/actions/meetings";
import type { MeetingStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { MeetingFormDialog, type EditableMeeting } from "./meeting-form-dialog";

/** Edit / cancel / restore / delete for one meeting. Contributors only. */
export function MeetingActions({
  meeting,
  status,
  hasRecord,
}: {
  meeting: EditableMeeting;
  status: MeetingStatus;
  /** Attendance or a recap exists — the meeting is part of the record and can't be deleted. */
  hasRecord: boolean;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"cancel" | "delete" | null>(null);
  const canDelete = !hasRecord && (status === "scheduled" || status === "cancelled");

  async function setCancelled(cancelled: boolean) {
    const res = await setMeetingCancelled({ meetingId: meeting.id, cancelled });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(cancelled ? "Meeting cancelled" : "Meeting restored");
    router.refresh();
  }

  async function remove() {
    const res = await deleteMeeting({ meetingId: meeting.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success("Meeting deleted");
    router.push("/meetings");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="max-md:size-10" aria-label="Meeting actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <PencilIcon />
            Edit details
          </DropdownMenuItem>
          {status === "cancelled" ? (
            <DropdownMenuItem onSelect={() => setCancelled(false)}>
              <RotateCcwIcon />
              Restore meeting
            </DropdownMenuItem>
          ) : (
            status !== "completed" && (
              <DropdownMenuItem onSelect={() => setConfirm("cancel")}>
                <BanIcon />
                Cancel meeting
              </DropdownMenuItem>
            )
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-danger focus:text-danger" onSelect={() => setConfirm("delete")}>
                <Trash2Icon />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {editOpen && <MeetingFormDialog meeting={meeting} open onOpenChange={setEditOpen} />}

      <ConfirmDialog
        open={confirm === "cancel"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel this meeting?"
        description="It stays in the list, marked cancelled, with its agenda intact — you can restore it later. It drops off members' inboxes and the calendar feed."
        confirmLabel="Cancel meeting"
        tone="danger"
        onConfirm={() => setCancelled(true)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this meeting?"
        description="The meeting and its agenda are removed for good. Action items captured in it are kept. Use this for a meeting created by mistake — otherwise cancel it."
        confirmLabel="Delete meeting"
        tone="danger"
        onConfirm={remove}
      />
    </>
  );
}
