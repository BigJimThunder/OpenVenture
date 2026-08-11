"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateMemberRole, offboardMember } from "@/lib/actions/members";
import { MEMBER_ROLES, type MemberRole, type MemberStatus } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MemberAdminControls({
  memberId,
  currentRole,
  status,
}: {
  memberId: string;
  currentRole: MemberRole;
  status: MemberStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function changeRole(role: MemberRole) {
    const res = await updateMemberRole({ memberId, role });
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Role updated");
      router.refresh();
    }
  }

  async function offboard() {
    if (!confirm("Move this member to alumni? Their history stays attributed.")) return;
    setBusy(true);
    const res = await offboardMember({ memberId });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Moved to alumni");
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={currentRole} onValueChange={(v) => changeRole(v as MemberRole)}>
        <SelectTrigger className="h-8 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MEMBER_ROLES.map((r) => (
            <SelectItem key={r} value={r}>
              {r.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {status !== "alumni" && (
        <Button variant="secondary" size="sm" onClick={offboard} disabled={busy}>
          Move to alumni
        </Button>
      )}
    </div>
  );
}
