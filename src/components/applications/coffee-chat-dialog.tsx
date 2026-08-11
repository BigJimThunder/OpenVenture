"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CoffeeIcon } from "lucide-react";
import { toast } from "sonner";
import { createCoffeeChat } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

export function CoffeeChatDialog({
  applicationId,
  members,
  viewerMemberId,
}: {
  applicationId: string;
  members: { id: string; displayName: string }[];
  viewerMemberId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [attendees, setAttendees] = React.useState<Set<string>>(
    () => new Set([viewerMemberId])
  );

  function toggle(id: string) {
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (attendees.size === 0) {
      toast.error("Pick at least one attendee");
      return;
    }
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const scheduledAt = String(fd.get("scheduledAt") ?? "");
    const res = await createCoffeeChat({
      applicationId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      location: String(fd.get("location") ?? "") || undefined,
      attendeeMemberIds: [...attendees],
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    setAttendees(new Set([viewerMemberId]));
    toast.success("Coffee chat scheduled");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <CoffeeIcon />
          Schedule coffee chat
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Schedule a coffee chat</DialogTitle>
          <DialogDescription>
            Each attendee records their own advance/decline verdict afterwards.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scheduledAt">When</Label>
              <Input id="scheduledAt" name="scheduledAt" type="datetime-local" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Where</Label>
              <Input id="location" name="location" placeholder="Campus café" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Attendees</Label>
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm transition-colors hover:bg-bg-subtle"
                >
                  <Checkbox
                    checked={attendees.has(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                  />
                  {m.displayName}
                  {m.id === viewerMemberId && (
                    <span className="text-2xs text-fg-subtle">(you)</span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Scheduling…" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
