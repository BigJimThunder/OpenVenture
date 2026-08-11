"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
  CheckIcon,
  UsersIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  startMeeting,
  setAgendaItemStatus,
  endMeeting,
  createActionItem,
} from "@/lib/actions/meetings";
import type { AgendaItemKind, AgendaItemStatus, AttendanceStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AttendanceGrid } from "./attendance-grid";

type Item = {
  id: string;
  title: string;
  kind: AgendaItemKind;
  status: AgendaItemStatus;
  durationMinutes: number | null;
  notes: string | null;
  applicationId: string | null;
  voteRoundId: string | null;
  memoIdForVote: string | null;
};

export function RunMode({
  meeting,
  items,
  members,
  attendance,
}: {
  meeting: { id: string; title: string; status: string; durationMinutes: number };
  items: Item[];
  members: { id: string; displayName: string }[];
  attendance: Record<string, AttendanceStatus>;
}) {
  const router = useRouter();
  const firstPending = Math.max(0, items.findIndex((i) => i.status !== "done"));
  const [idx, setIdx] = React.useState(firstPending);
  const [notes, setNotes] = React.useState(items[idx]?.notes ?? "");
  const [attendanceOpen, setAttendanceOpen] = React.useState(false);
  const [actionTitle, setActionTitle] = React.useState("");
  const [actionAssignee, setActionAssignee] = React.useState<string | undefined>();
  const [startedAt] = React.useState(() => Date.now());
  const [now, setNow] = React.useState(() => Date.now());
  const [busy, setBusy] = React.useState(false);

  const current = items[idx];

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (meeting.status === "scheduled") {
      void startMeeting({ meetingId: meeting.id });
    }
    if (current && current.status === "pending") {
      void setAgendaItemStatus({ agendaItemId: current.id, status: "in_progress" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elapsedMin = Math.floor((now - startedAt) / 60000);
  const elapsedSec = Math.floor(((now - startedAt) % 60000) / 1000);
  const overTime = elapsedMin >= meeting.durationMinutes;

  async function saveNotesAndMark(status: "done" | "deferred") {
    if (!current) return;
    await setAgendaItemStatus({
      agendaItemId: current.id,
      status,
      notes: notes || undefined,
    });
  }

  async function go(delta: number) {
    if (current) {
      await saveNotesAndMark("done");
    }
    const next = Math.min(Math.max(0, idx + delta), items.length - 1);
    setIdx(next);
    setNotes(items[next]?.notes ?? "");
    if (items[next] && items[next].status === "pending") {
      void setAgendaItemStatus({ agendaItemId: items[next].id, status: "in_progress" });
    }
    router.refresh();
  }

  async function addAction() {
    if (!actionTitle.trim()) return;
    const res = await createActionItem({
      meetingId: meeting.id,
      agendaItemId: current?.id,
      applicationId: current?.applicationId ?? undefined,
      title: actionTitle.trim(),
      assigneeMemberId: actionAssignee,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Action item added");
    setActionTitle("");
  }

  async function finish() {
    if (!confirm("End the meeting and send the recap email to all members?")) return;
    setBusy(true);
    if (current) await saveNotesAndMark("done");
    const res = await endMeeting({ meetingId: meeting.id, sendRecap: true });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Meeting wrapped — recap sent");
    router.push(`/meetings/${meeting.id}`);
    router.refresh();
  }

  return (
    <div className="flex h-svh flex-col bg-bg">
      {/* Top bar */}
      <header className="flex h-13 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link href={`/meetings/${meeting.id}`} className="text-fg-subtle hover:text-fg">
            <XIcon className="size-4" />
          </Link>
          <span className="text-sm font-semibold">{meeting.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "tnum text-sm font-medium",
              overTime ? "text-danger" : "text-fg-muted"
            )}
          >
            {elapsedMin}:{String(elapsedSec).padStart(2, "0")}
            <span className="text-fg-subtle"> / {meeting.durationMinutes}:00</span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => setAttendanceOpen(true)}>
            <UsersIcon />
            Attendance
          </Button>
          <Button size="sm" variant="danger" onClick={finish} disabled={busy}>
            End meeting
          </Button>
        </div>
      </header>

      {/* Current item */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6">
        {current ? (
          <>
            <div className="text-center">
              <div className="tnum mb-2 text-2xs uppercase tracking-wide text-fg-subtle">
                Item {idx + 1} of {items.length}
                {current.durationMinutes ? ` · ${current.durationMinutes} min allotted` : ""}
              </div>
              <h1 className="max-w-2xl text-xl font-semibold tracking-tight">{current.title}</h1>
              <div className="mt-2 flex items-center justify-center gap-2">
                {current.applicationId && (
                  <Link
                    href={`/pipeline/${current.applicationId}`}
                    target="_blank"
                    className="flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Open application <ExternalLinkIcon className="size-3" />
                  </Link>
                )}
                {current.voteRoundId && (
                  <span className="text-xs text-fg-muted">🗳 blind vote linked — open from the memo</span>
                )}
              </div>
            </div>

            <Textarea
              className="max-w-2xl"
              rows={5}
              placeholder="Notes for this item — captured into the recap…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div className="flex w-full max-w-2xl items-center gap-2">
              <Input
                placeholder="Quick action item…"
                value={actionTitle}
                onChange={(e) => setActionTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addAction()}
              />
              <Select value={actionAssignee} onValueChange={setActionAssignee}>
                <SelectTrigger className="w-36 shrink-0">
                  <SelectValue placeholder="Assignee" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="secondary" size="sm" onClick={addAction} disabled={!actionTitle.trim()}>
                Add
              </Button>
            </div>
          </>
        ) : (
          <p className="text-fg-muted">No agenda items — add some from the meeting page.</p>
        )}
      </main>

      {/* Nav */}
      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-border px-6">
        <Button variant="secondary" onClick={() => go(-1)} disabled={idx === 0}>
          <ChevronLeftIcon />
          Previous
        </Button>
        <div className="flex gap-1.5">
          {items.map((it, i) => (
            <span
              key={it.id}
              className={cn(
                "size-1.5 rounded-full",
                i === idx ? "bg-accent" : it.status === "done" ? "bg-success" : "bg-border-strong"
              )}
            />
          ))}
        </div>
        {idx < items.length - 1 ? (
          <Button onClick={() => go(1)}>
            Next
            <ChevronRightIcon />
          </Button>
        ) : (
          <Button onClick={finish} disabled={busy}>
            <CheckIcon />
            Wrap up
          </Button>
        )}
      </footer>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Attendance</DialogTitle>
          </DialogHeader>
          <AttendanceGrid
            meetingId={meeting.id}
            members={members}
            attendance={attendance}
            editable
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
