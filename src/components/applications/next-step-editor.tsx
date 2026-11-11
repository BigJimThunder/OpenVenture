"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { setNextStep } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";

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
  const canEdit = useCan("contribute");
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
    const value = nextStep ? (
      <span className={cn(overdue && "text-danger")}>
        {nextStep}
        {nextStepDue && (
          <span className={cn("tnum block text-2xs", overdue ? "text-danger" : "text-fg-subtle")}>
            due {format(nextStepDue, "MMM d")}
            {overdue ? " · overdue" : ""}
          </span>
        )}
      </span>
    ) : (
      <span className="text-fg-subtle">{canEdit ? "Set a next step" : "—"}</span>
    );
    return (
      <div className="flex min-h-8 items-start gap-3 max-md:min-h-11 max-md:items-center">
        <span className="w-24 shrink-0 pt-1 text-xs text-fg-muted max-md:pt-0">Next step</span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="-mx-1.5 min-w-0 flex-1 cursor-text rounded-md px-1.5 py-0.5 text-left text-sm transition-colors outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-2"
          >
            {value}
          </button>
        ) : (
          <span className="min-w-0 flex-1 text-sm">{value}</span>
        )}
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
        aria-label="Next step"
        className="max-md:h-10 max-md:text-base"
      />
      <div className="flex items-center gap-2">
        <Input
          name="nextStepDue"
          type="date"
          aria-label="Due date"
          className="tnum max-md:h-10 max-md:text-base"
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
