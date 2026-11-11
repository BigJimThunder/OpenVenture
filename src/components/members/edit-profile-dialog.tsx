"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfile } from "@/lib/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/components/patterns/field";

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
        <Button variant="secondary" className="max-md:h-10">
          <PencilIcon />
          Edit profile
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>Role and status are managed by admins.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name">
            <Input
              id="profile-name"
              name="displayName"
              required
              defaultValue={profile.displayName}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cohort">
              <Input
                id="profile-cohort"
                name="cohort"
                defaultValue={profile.cohort ?? ""}
                placeholder="Fall 2026"
              />
            </Field>
            <Field label="Class year">
              <Input
                id="profile-classYear"
                name="classYear"
                type="number"
                defaultValue={profile.classYear ?? ""}
                placeholder="2029"
                className="tnum"
              />
            </Field>
          </div>
          <Field label="LinkedIn">
            <Input
              id="profile-linkedin"
              name="linkedinUrl"
              type="url"
              defaultValue={profile.linkedinUrl ?? ""}
              placeholder="https://linkedin.com/in/…"
            />
          </Field>
          <Field label="Bio">
            <Textarea
              id="profile-bio"
              name="bio"
              rows={3}
              maxLength={1000}
              defaultValue={profile.bio ?? ""}
              placeholder="What you work on, what you want to see more of…"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
