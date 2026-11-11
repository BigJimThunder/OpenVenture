"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { remindSchedules } from "@/lib/actions/availability";
import type { RosterRow } from "@/lib/queries/availability";
import type { Term } from "@/lib/scheduling/terms";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MemberScheduleDialog } from "./member-schedule-dialog";

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/**
 * Admins only: who has entered a schedule for the term, who hasn't, and a
 * reminder for those who haven't. The same email the daily job sends, at most
 * once per member per day however often the button is pressed.
 */
export function TermRoster({
  term,
  rows,
  viewerId,
  window: hours,
  emailConfigured,
}: {
  term: Term;
  rows: RosterRow[];
  viewerId: string;
  window: { dayStartMinute: number; dayEndMinute: number; weekends: boolean };
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const outstanding = rows.filter((r) => !r.confirmedAt);
  const remindable = outstanding.filter((r) => r.memberId !== viewerId);
  const sorted = [...rows].sort((a, b) => Number(Boolean(a.confirmedAt)) - Number(Boolean(b.confirmedAt)) || a.name.localeCompare(b.name));

  async function remind(memberIds: string[] | undefined, key: string) {
    setBusy(key);
    const res = await remindSchedules({ termKey: term.key, memberIds });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const { sent, alreadyReminded } = res.data;
    if (sent === 0) toast(alreadyReminded > 0 ? "Already reminded today. One reminder a day is plenty." : "Nobody to remind.");
    else
      toast.success(
        `Reminded ${sent} ${sent === 1 ? "member" : "members"}${alreadyReminded > 0 ? `; ${alreadyReminded} already reminded today` : ""}${
          emailConfigured ? "" : " (email isn't connected, so it was only logged)"
        }`
      );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tnum text-sm text-fg-muted">
          <span className="font-medium text-fg">
            {rows.length - outstanding.length} of {rows.length}
          </span>{" "}
          have confirmed a schedule for {term.name}.
        </p>
        {remindable.length > 0 && (
          <Button variant="secondary" className="max-md:h-10" disabled={busy !== null} onClick={() => remind(undefined, "all")}>
            <SendIcon />
            {busy === "all" ? "Sending…" : `Remind the ${remindable.length} who haven't`}
          </Button>
        )}
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((r) => (
          <li key={r.memberId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {r.name}
                {r.memberId === viewerId && <span className="font-normal text-fg-muted"> (you)</span>}
              </div>
              <div className={cn("tnum flex items-center gap-1 text-xs", r.confirmedAt ? "text-fg-muted" : "text-warning")}>
                {r.confirmedAt ? (
                  <>
                    <CheckCircle2Icon className="size-3 text-success" />
                    Confirmed {shortDate(r.confirmedAt)}
                    {r.blockCount === 0 && ", open week"}
                  </>
                ) : r.blockCount > 0 ? (
                  `${r.blockCount} blocks entered, not confirmed`
                ) : (
                  "Nothing entered"
                )}
                {!r.confirmedAt && r.lastRemindedAt && (
                  <span className="text-fg-subtle"> · reminded {shortDate(r.lastRemindedAt)}</span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              {(r.blockCount > 0 || r.confirmedAt) && (
                <MemberScheduleDialog memberId={r.memberId} memberName={r.name} window={hours} />
              )}
              {!r.confirmedAt && r.memberId !== viewerId && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  disabled={busy !== null}
                  onClick={() => remind([r.memberId], r.memberId)}
                >
                  {busy === r.memberId ? "Sending…" : "Remind"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
