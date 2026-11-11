"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { setAttendance, setAttendanceBulk } from "@/lib/actions/meetings";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/db/schema";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ATTENDANCE_LABEL, ATTENDED } from "./meeting-labels";

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "border-success-border bg-success-bg text-success",
  remote: "border-info-border bg-info-bg text-info",
  late: "border-warning-border bg-warning-bg text-warning",
  excused: "border-border-strong bg-bg-subtle text-fg-muted",
  absent: "border-danger-border bg-danger-bg text-danger",
};

/**
 * Attendance in two taps: tap a name, tap a status. The common case is one
 * tap for the whole room — "Mark the rest present" — then fix the exceptions.
 * Optimistic, with rows tall enough to hit on a phone held in one hand.
 */
export function AttendanceGrid({
  meetingId,
  members,
  attendance,
  editable,
}: {
  meetingId: string;
  members: { id: string; displayName: string }[];
  attendance: Record<string, AttendanceStatus>;
  editable: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState(attendance);
  const [prevServer, setPrevServer] = React.useState(attendance);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  if (prevServer !== attendance) {
    setPrevServer(attendance);
    setLocal(attendance);
  }

  async function mark(memberId: string, status: AttendanceStatus) {
    const previous = local[memberId];
    setOpenId(null);
    if (previous === status) return;
    setLocal((prev) => ({ ...prev, [memberId]: status }));
    const res = await setAttendance({ meetingId, memberId, status });
    if (!res.ok) {
      toast.error(res.error);
      setLocal((prev) => {
        const next = { ...prev };
        if (previous) next[memberId] = previous;
        else delete next[memberId];
        return next;
      });
      return;
    }
    router.refresh();
  }

  const unmarked = members.filter((m) => !local[m.id]);

  async function markRestPresent() {
    const ids = unmarked.map((m) => m.id);
    const before = local;
    setBulkBusy(true);
    setLocal((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, "present" as const])) }));
    const res = await setAttendanceBulk({ meetingId, memberIds: ids, status: "present" });
    setBulkBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      setLocal(before);
      return;
    }
    router.refresh();
  }

  const marked = members.length - unmarked.length;
  const attended = members.filter((m) => local[m.id] && ATTENDED.includes(local[m.id])).length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="tnum text-xs text-fg-muted">
          {marked === 0
            ? editable
              ? "Tap a name, then a status."
              : "Attendance wasn't taken."
            : `${attended} attending · ${marked} of ${members.length} marked`}
        </p>
        {editable && unmarked.length > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="max-md:h-10"
            onClick={markRestPresent}
            disabled={bulkBusy}
          >
            <CheckCheckIcon />
            {marked === 0 ? "Mark everyone present" : "Mark the rest present"}
          </Button>
        )}
      </div>

      <ul className="flex flex-col gap-1">
        {members.map((m) => {
          const status = local[m.id];
          const open = openId === m.id;
          return (
            <li key={m.id} className={cn("rounded-lg border border-border bg-panel", open && "border-border-strong shadow-xs")}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : m.id)}
                disabled={!editable}
                aria-expanded={editable ? open : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:min-h-10",
                  editable && "cursor-pointer"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-[9px]">{initials(m.displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="truncate">{m.displayName}</span>
                </span>
                {status ? (
                  <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_STYLE[status])}>
                    {ATTENDANCE_LABEL[status]}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-fg-subtle">{editable ? "Not marked" : "—"}</span>
                )}
              </button>
              {open && (
                <div
                  role="radiogroup"
                  aria-label={`Attendance for ${m.displayName}`}
                  className="grid grid-cols-5 gap-1 px-2 pb-2"
                >
                  {ATTENDANCE_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={status === s}
                      onClick={() => mark(m.id, s)}
                      className={cn(
                        "h-11 cursor-pointer rounded-md border text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 md:h-8",
                        status === s
                          ? STATUS_STYLE[s]
                          : "border-border bg-bg-subtle/60 text-fg-muted hover:border-border-strong hover:text-fg"
                      )}
                    >
                      {ATTENDANCE_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
