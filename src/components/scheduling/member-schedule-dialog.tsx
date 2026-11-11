"use client";

import * as React from "react";
import { getMemberSchedule, type MemberScheduleView } from "@/lib/actions/availability";
import { groupBlocks, KIND_LABEL } from "@/lib/scheduling/blocks";
import { formatMinuteRange, WEEKDAY_SHORT } from "@/lib/scheduling/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { WeekGrid } from "./week-grid";

/**
 * An admin's read-only look at one member's week, names included. The server
 * refuses this for anyone who is not an admin (or the member themselves).
 */
export function MemberScheduleDialog({
  memberId,
  memberName,
  window: hours,
  trigger,
}: {
  memberId: string;
  memberName: string;
  window: { dayStartMinute: number; dayEndMinute: number; weekends: boolean };
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<{ view: MemberScheduleView } | { error: string } | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setState(null);
    getMemberSchedule({ memberId }).then((res) => setState(res.ok ? { view: res.data } : { error: res.error }));
  }

  const view = state && "view" in state ? state.view : null;
  const blocks = (view?.blocks ?? []).map((b, i) => ({ ...b, id: String(i) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary" size="sm" className="max-md:h-10">
            View week
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{memberName}&apos;s week</DialogTitle>
          <DialogDescription>
            {view?.term
              ? `${view.term.name}. ${view.confirmedAt ? "Confirmed." : "Not confirmed yet."} Admins see block names; other members see only busy or free.`
              : "Admins see block names; other members see only busy or free."}
          </DialogDescription>
        </DialogHeader>
        {!state && <div className="h-64 animate-pulse rounded-lg bg-bg-subtle" aria-busy />}
        {state && "error" in state && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        {view && blocks.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-8 text-center text-sm text-fg-muted">
            {view.confirmedAt
              ? `${memberName} confirmed an open week: no fixed commitments this term.`
              : `${memberName} hasn't entered anything for this term.`}
          </p>
        )}
        {view && blocks.length > 0 && (
          <>
            <WeekGrid blocks={blocks} window={hours} readOnly />
            <ul className="flex flex-col gap-1 text-sm sm:hidden">
              {groupBlocks(view.blocks).map((g, i) => (
                <li key={i} className="tnum flex flex-wrap gap-x-2">
                  <span className="font-medium">{g.label ?? KIND_LABEL[g.kind]}</span>
                  <span className="text-fg-muted">
                    {g.days.map((d) => WEEKDAY_SHORT[d]).join(" ")} · {formatMinuteRange(g.startMinute, g.endMinute)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
