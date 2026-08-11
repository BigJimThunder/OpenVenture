"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setAttendance } from "@/lib/actions/meetings";
import type { AttendanceStatus } from "@/db/schema";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

/**
 * Two-tap attendance: tap a name to cycle present → remote → absent →
 * excused → present. Optimistic; the whole roster fits on one card.
 */
const CYCLE: AttendanceStatus[] = ["present", "remote", "absent", "excused"];

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  present: "border-success-border bg-success-bg text-success",
  remote: "border-info-border bg-info-bg text-info",
  late: "border-warning-border bg-warning-bg text-warning",
  excused: "border-border bg-bg-subtle text-fg-muted",
  absent: "border-danger-border bg-danger-bg text-danger",
};

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
  if (prevServer !== attendance) {
    setPrevServer(attendance);
    setLocal(attendance);
  }

  async function tap(memberId: string) {
    if (!editable) return;
    const current = local[memberId];
    const next = current
      ? CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]
      : "present";
    setLocal((prev) => ({ ...prev, [memberId]: next }));
    const res = await setAttendance({ meetingId, memberId, status: next });
    if (!res.ok) {
      toast.error(res.error);
      setLocal((prev) => ({ ...prev, [memberId]: current }));
    } else {
      router.refresh();
    }
  }

  const marked = Object.keys(local).length;
  const present = Object.values(local).filter((s) =>
    ["present", "remote", "late"].includes(s)
  ).length;

  return (
    <div className="flex flex-col gap-2">
      <p className="tnum text-xs text-fg-muted">
        {marked > 0 ? `${present} attending · ${marked}/${members.length} marked` : "Tap to mark"}
      </p>
      <div className="flex flex-col gap-1">
        {members.map((m) => {
          const status = local[m.id];
          return (
            <button
              key={m.id}
              onClick={() => tap(m.id)}
              disabled={!editable}
              className={cn(
                "flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors",
                status ? STATUS_STYLE[status] : "border-border bg-panel text-fg",
                editable && "cursor-pointer"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar className="size-5">
                  <AvatarFallback className="text-[8px]">{initials(m.displayName)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{m.displayName}</span>
              </span>
              <span className="shrink-0 text-2xs capitalize">{status ?? "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
