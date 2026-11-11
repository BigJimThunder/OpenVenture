"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { inviteMember } from "@/lib/actions/members";
import { MEMBER_ROLES, type MemberRole } from "@/db/schema";
import { ROLE_LABEL } from "@/lib/permissions";
import { useCan } from "@/components/shell/viewer";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_HINT } from "./member-labels";

/** Admin-only. Renders nothing for anyone else. */
export function InviteMemberDialog({
  allowedDomains,
  label = "Invite member",
}: {
  allowedDomains: string[];
  label?: string;
}) {
  const router = useRouter();
  const canInvite = useCan("manageMembers");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [role, setRole] = React.useState<MemberRole>("analyst");
  const formRef = React.useRef<HTMLFormElement>(null);

  if (!canInvite) return null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const keepOpen = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "another";
    const name = String(fd.get("displayName") ?? "");
    setBusy(true);
    const res = await inviteMember({
      email: String(fd.get("email") ?? ""),
      displayName: name,
      role,
      cohort: String(fd.get("cohort") ?? "").trim() || undefined,
      classYear: fd.get("classYear") ? Number(fd.get("classYear")) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${name} invited. They sign in with their email — no password.`);
    router.refresh();
    if (keepOpen) {
      // Keep role and cohort: a new cohort is usually invited in one sitting.
      const form = formRef.current;
      if (form) {
        (form.elements.namedItem("displayName") as HTMLInputElement).value = "";
        (form.elements.namedItem("email") as HTMLInputElement).value = "";
        (form.elements.namedItem("displayName") as HTMLInputElement).focus();
      }
    } else {
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="max-md:h-10">
          <UserPlusIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite a member</DialogTitle>
          <DialogDescription>
            They get an email with a sign-in link and are put on the default onboarding track.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" name="displayName" required maxLength={120} autoFocus placeholder="Jordan Lee" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder={`jordan@${allowedDomains[0] ?? "university.edu"}`}
            />
            {allowedDomains.length > 0 && (
              <p className="text-xs text-fg-subtle">
                Must end in {allowedDomains.map((d) => `@${d}`).join(" or ")}.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as MemberRole)}>
              <SelectTrigger>
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
            <p className="text-xs text-fg-subtle">{ROLE_HINT[role]}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-cohort">Cohort</Label>
              <Input id="invite-cohort" name="cohort" maxLength={60} placeholder="Fall 2026" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-class">Class year</Label>
              <Input
                id="invite-class"
                name="classYear"
                type="number"
                inputMode="numeric"
                min={2000}
                max={2100}
                placeholder="2029"
                className="tnum"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" name="intent" value="another" variant="secondary" className="max-sm:h-10" disabled={busy}>
              Invite and add another
            </Button>
            <Button type="submit" name="intent" value="done" className="max-sm:h-10" disabled={busy}>
              {busy ? "Inviting…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
