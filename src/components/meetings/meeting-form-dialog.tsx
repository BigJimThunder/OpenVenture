"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createMeeting, updateMeeting } from "@/lib/actions/meetings";
import { MEETING_KINDS, type MeetingKind } from "@/db/schema";
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
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEETING_KIND_LABEL, toLocalInputValue } from "./meeting-labels";

export type EditableMeeting = {
  id: string;
  title: string;
  kind: MeetingKind;
  scheduledAt: Date;
  durationMinutes: number;
  location: string | null;
  videoUrl: string | null;
};

/** Next whole hour, a week out is a guess nobody wants; tomorrow evening is closer. */
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return d;
}

/** One form for scheduling a meeting and for editing it. */
export function MeetingFormDialog({
  meeting,
  open,
  onOpenChange,
}: {
  /** Omit to schedule a new meeting. */
  meeting?: EditableMeeting;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<MeetingKind>(meeting?.kind ?? "general");
  // Computed on the client only, so the server render and the browser's timezone can't disagree.
  const [start] = React.useState(() => toLocalInputValue(meeting?.scheduledAt ?? defaultStart()));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      title: String(fd.get("title") ?? ""),
      kind,
      scheduledAt: new Date(String(fd.get("scheduledAt"))),
      durationMinutes: Number(fd.get("durationMinutes") ?? 60),
    };
    const location = String(fd.get("location") ?? "").trim();
    const videoUrl = String(fd.get("videoUrl") ?? "").trim();
    setBusy(true);
    if (meeting) {
      const res = await updateMeeting({
        meetingId: meeting.id,
        ...fields,
        location: location || null,
        videoUrl: videoUrl || null,
      });
      setBusy(false);
      if (!res.ok) {
        toast.error(res.code === "validation" ? "Check the video link — it needs to be a full https:// URL." : res.error);
        return;
      }
      toast.success("Meeting saved");
      onOpenChange(false);
      router.refresh();
      return;
    }
    const res = await createMeeting({ ...fields, location: location || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onOpenChange(false);
    router.push(`/meetings/${res.data.meetingId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{meeting ? "Edit meeting" : "Schedule a meeting"}</DialogTitle>
          {!meeting && (
            <DialogDescription>
              Next you&apos;ll build the agenda. It appears on everyone&apos;s inbox and in the calendar feed.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-title">Title</Label>
            <Input
              id="meeting-title"
              name="title"
              required
              maxLength={200}
              autoFocus={!meeting}
              placeholder="Weekly general meeting"
              defaultValue={meeting?.title ?? ""}
            />
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as MeetingKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEETING_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {MEETING_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-minutes">Minutes</Label>
              <Input
                id="meeting-minutes"
                name="durationMinutes"
                type="number"
                inputMode="numeric"
                min={5}
                max={480}
                step={5}
                required
                className="tnum"
                defaultValue={meeting?.durationMinutes ?? 60}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-when">When</Label>
            <Input
              id="meeting-when"
              name="scheduledAt"
              type="datetime-local"
              required
              className="tnum"
              defaultValue={start}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meeting-location">Location</Label>
            <Input
              id="meeting-location"
              name="location"
              maxLength={200}
              placeholder="Huntsman Hall 240"
              defaultValue={meeting?.location ?? ""}
            />
          </div>
          {meeting && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meeting-video">Video link</Label>
              <Input
                id="meeting-video"
                name="videoUrl"
                type="url"
                maxLength={500}
                placeholder="https://…"
                defaultValue={meeting.videoUrl ?? ""}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              className="max-sm:h-10"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : meeting ? "Save meeting" : "Schedule meeting"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
