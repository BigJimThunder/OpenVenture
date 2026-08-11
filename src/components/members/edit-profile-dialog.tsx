"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
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
  DialogTrigger,
} from "@/components/ui/dialog";

export function EditProfileDialog({
  profile,
}: {
  profile: {
    displayName: string;
    cohort: string | null;
    classYear: number | null;
    bio: string | null;
    linkedinUrl: string | null;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await updateMyProfile({
      displayName: String(fd.get("displayName") ?? ""),
      cohort: String(fd.get("cohort") ?? "").trim() || null,
      classYear: fd.get("classYear") ? Number(fd.get("classYear")) : null,
      bio: String(fd.get("bio") ?? "").trim() || null,
      linkedinUrl: String(fd.get("linkedinUrl") ?? "").trim() || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Profile updated");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <PencilIcon />
          Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>Role and status are managed by admins.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input
              id="profile-name"
              name="displayName"
              required
              defaultValue={profile.displayName}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-cohort">Cohort</Label>
              <Input
                id="profile-cohort"
                name="cohort"
                defaultValue={profile.cohort ?? ""}
                placeholder="Fall 2026"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-classYear">Class year</Label>
              <Input
                id="profile-classYear"
                name="classYear"
                type="number"
                defaultValue={profile.classYear ?? ""}
                placeholder="2029"
                className="tnum"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-linkedin">LinkedIn</Label>
            <Input
              id="profile-linkedin"
              name="linkedinUrl"
              type="url"
              defaultValue={profile.linkedinUrl ?? ""}
              placeholder="https://linkedin.com/in/…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              name="bio"
              rows={3}
              maxLength={1000}
              defaultValue={profile.bio ?? ""}
              placeholder="What you work on, what you want to see more of…"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
