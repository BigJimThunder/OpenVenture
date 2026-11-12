"use client";

import * as React from "react";
import { toast } from "sonner";
import { assignOnboardingTrack } from "@/lib/actions/onboarding";
import { DEFAULT_DUE_DAYS } from "@/lib/onboarding/progress";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type EnrollTrack = { id: string; name: string; assignedMemberIds: string[] };
type Member = { id: string; displayName: string };

/** Put existing members on a track — people who joined before it existed, or an extra track. */
export function EnrollDialog({
  tracks,
  initialTrackId,
  members,
  onClose,
  onSaved,
}: {
  tracks: EnrollTrack[];
  initialTrackId: string;
  members: Member[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [trackId, setTrackId] = React.useState(initialTrackId);
  const [due, setDue] = React.useState(String(DEFAULT_DUE_DAYS));
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const track = tracks.find((t) => t.id === trackId) ?? tracks[0];
  const already = new Set(track.assignedMemberIds);
  const available = members.filter((m) => !already.has(m.id));
  const chosen = available.filter((m) => picked.has(m.id));

  async function submit() {
    setBusy(true);
    const res = await assignOnboardingTrack({
      trackId: track.id,
      memberIds: chosen.map((m) => m.id),
      dueInDays: due === "none" ? null : Number(due),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${res.data.assigned} member${res.data.assigned === 1 ? "" : "s"} enrolled on ${track.name}`);
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Enroll members</DialogTitle>
          <DialogDescription>
            New invites are enrolled on their own. Use this for members who joined before the track existed. It
            does not lock anyone who already uses the app out of it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label>Track</Label>
            <Select value={track.id} onValueChange={setTrackId} disabled={tracks.length === 1}>
              <SelectTrigger className="max-md:h-10" aria-label="Onboarding track">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tracks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Due</Label>
            <Select value={due} onValueChange={setDue}>
              <SelectTrigger className="max-md:h-10" aria-label="Onboarding due">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[7, 14, 21, 30].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    In {d} days
                  </SelectItem>
                ))}
                <SelectItem value="none">No due date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {available.length === 0 ? (
          <p className="text-sm text-fg-muted">Every current member is already on this track.</p>
        ) : (
          <>
            <div className="flex max-h-64 flex-col overflow-y-auto rounded-md border border-border p-1">
              {available.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm hover:bg-bg-subtle max-md:min-h-11"
                >
                  <Checkbox
                    checked={picked.has(m.id)}
                    onCheckedChange={(c) => {
                      const next = new Set(picked);
                      if (c) next.add(m.id);
                      else next.delete(m.id);
                      setPicked(next);
                    }}
                  />
                  {m.displayName}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="cursor-pointer self-start text-xs text-accent underline-offset-2 hover:underline"
              onClick={() =>
                setPicked(chosen.length === available.length ? new Set() : new Set(available.map((m) => m.id)))
              }
            >
              {chosen.length === available.length ? "Clear selection" : `Select all ${available.length}`}
            </button>
          </>
        )}
        <DialogFooter>
          <Button variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button className="max-sm:h-10" onClick={submit} disabled={busy || chosen.length === 0}>
            {busy ? "Enrolling…" : chosen.length === 0 ? "Enroll" : `Enroll ${chosen.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
