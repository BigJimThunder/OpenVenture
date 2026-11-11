"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GraduationCapIcon, MoreHorizontalIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { offboardMember, updateMemberDetails, updateMemberRole } from "@/lib/actions/members";
import { MEMBER_ROLES, type MemberRole, type MemberStatus } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ROLE_HINT } from "./member-labels";

type Target = {
  id: string;
  displayName: string;
  role: MemberRole;
  status: MemberStatus;
  title: string | null;
  cohort: string | null;
  classYear: number | null;
};

/** What an admin can do to someone else's membership. Rendered only for admins. */
export function MemberAdminControls({ member }: { member: Target }) {
  const router = useRouter();
  const [role, setRole] = React.useState(member.role);
  const [pendingRole, setPendingRole] = React.useState<MemberRole | null>(null);
  const [dialog, setDialog] = React.useState<"details" | "offboard" | null>(null);

  async function changeRole(next: MemberRole) {
    const res = await updateMemberRole({ memberId: member.id, role: next });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setRole(next);
    toast.success(`${member.displayName} is now ${ROLE_LABEL[next].toLowerCase()}`);
    router.refresh();
  }

  async function offboard() {
    const res = await offboardMember({ memberId: member.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`${member.displayName} moved to alumni`);
    router.refresh();
  }

  if (member.status === "alumni" || member.status === "removed") return null;

  return (
    <>
      <Select value={role} onValueChange={(v) => v !== role && setPendingRole(v as MemberRole)}>
        <SelectTrigger className="w-36 max-md:h-10" aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMBER_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {ROLE_LABEL[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="icon" className="max-md:size-10" aria-label="Member actions">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          <DropdownMenuItem onSelect={() => setDialog("details")}>
            <PencilIcon />
            Edit roster details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("offboard")}>
            <GraduationCapIcon />
            Move to alumni
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {pendingRole && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPendingRole(null)}
          title={`Make ${member.displayName} ${ROLE_LABEL[pendingRole].toLowerCase()}?`}
          description={`${ROLE_HINT[pendingRole]} The change applies the next time they load a page.`}
          confirmLabel={`Make ${ROLE_LABEL[pendingRole].toLowerCase()}`}
          tone={pendingRole === "admin" ? "danger" : "default"}
          onConfirm={() => changeRole(pendingRole)}
        />
      )}
      <ConfirmDialog
        open={dialog === "offboard"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Move ${member.displayName} to alumni?`}
        description="They lose access straight away. Everything they wrote, scored and voted on stays attributed to them. Reassign their open applications first — those don't move on their own."
        confirmLabel="Move to alumni"
        tone="danger"
        onConfirm={offboard}
      />
      {dialog === "details" && <DetailsDialog member={member} onClose={() => setDialog(null)} />}
    </>
  );
}

function DetailsDialog({ member, onClose }: { member: Target; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await updateMemberDetails({
      memberId: member.id,
      displayName: String(fd.get("displayName") ?? ""),
      title: String(fd.get("title") ?? "").trim() || null,
      cohort: String(fd.get("cohort") ?? "").trim() || null,
      classYear: fd.get("classYear") ? Number(fd.get("classYear")) : null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Roster details saved");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Roster details</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="details-name">Name</Label>
            <Input id="details-name" name="displayName" required maxLength={120} defaultValue={member.displayName} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="details-title">Club title</Label>
            <Input
              id="details-title"
              name="title"
              maxLength={80}
              placeholder="President, Treasurer, Head of Sourcing…"
              defaultValue={member.title ?? ""}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="details-cohort">Cohort</Label>
              <Input id="details-cohort" name="cohort" maxLength={60} placeholder="Fall 2026" defaultValue={member.cohort ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="details-class">Class year</Label>
              <Input
                id="details-class"
                name="classYear"
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                className="tnum"
                defaultValue={member.classYear ?? ""}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
