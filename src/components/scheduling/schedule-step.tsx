"use client";

import * as React from "react";
import { getMyScheduleData, type MyScheduleData } from "@/lib/actions/availability";
import type { Term } from "@/lib/scheduling/terms";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "./schedule-editor";

/**
 * The schedule editor as a drop-in step for another flow (new-member
 * onboarding). It loads the signed-in member's own data, so the host only
 * decides where it sits and what happens next.
 *
 *   <ScheduleStep onDone={() => goToNextStep()} />
 *
 * `onDone` fires when the member confirms their week, and again if they press
 * Continue on a week they had already confirmed. When the club has no term
 * set up there is nothing to enter: the step says so and offers `onDone`
 * straight away, so it can never block a flow.
 */
export function ScheduleStep({
  termKey,
  onDone,
}: {
  /** Defaults to the club's current term. */
  termKey?: string;
  onDone?: () => void;
}) {
  const [state, setState] = React.useState<{ data: MyScheduleData } | { error: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getMyScheduleData({ termKey }).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { data: res.data } : { error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [termKey]);

  if (!state) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if ("error" in state || !state.data.term) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-bg-subtle/60 p-4">
        <p className="text-sm text-fg-muted">
          {"error" in state
            ? `We couldn't load your schedule. ${state.error}`
            : "The club hasn't set up its academic terms yet, so there is no schedule to enter. You'll get an email when there is."}
        </p>
        {onDone && (
          <Button variant="secondary" className="max-md:h-10" onClick={onDone}>
            Skip for now
          </Button>
        )}
      </div>
    );
  }
  return <ScheduleEditor compact data={{ ...state.data, term: state.data.term as Term }} onConfirmed={onDone} />;
}
