"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { setNextStep } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function NextStepEditor({
  applicationId,
  nextStep,
  nextStepDue,
  overdue,
}: {
  applicationId: string;
  nextStep: string | null;
  nextStepDue: Date | null;
  overdue: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const step = String(fd.get("nextStep") ?? "").trim();
    const due = String(fd.get("nextStepDue") ?? "");
    const res = await setNextStep({
      applicationId,
      nextStep: step || null,
      nextStepDue: step && due ? new Date(`${due}T12:00:00`) : null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">Next step</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="min-w-0 text-right text-sm hover:underline"
        >
          {nextStep ? (
            <span className={cn(overdue && "text-danger")}>
              {nextStep}
              {nextStepDue && (
                <span className={cn("block text-2xs", overdue ? "text-danger" : "text-fg-subtle")}>
                  due {format(nextStepDue, "MMM d")}
                  {overdue ? " · overdue" : ""}
                </span>
              )}
            </span>
          ) : (
            <span className="text-fg-subtle">Set…</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <Input
        name="nextStep"
        defaultValue={nextStep ?? ""}
        placeholder="e.g. Follow up after demo"
        maxLength={200}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Input
          name="nextStepDue"
          type="date"
          className="tnum"
          defaultValue={nextStepDue ? format(nextStepDue, "yyyy-MM-dd") : ""}
        />
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "…" : "Save"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
