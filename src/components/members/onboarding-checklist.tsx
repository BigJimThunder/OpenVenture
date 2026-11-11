"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { toggleOnboardingTask } from "@/lib/actions/members";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export type ChecklistTask = {
  id: string;
  title: string;
  done: boolean;
  required: boolean;
  resourceUrl: string | null;
};

/** One member's onboarding tasks as a tick list. Optimistic; rows are thumb-sized on phones. */
export function OnboardingChecklist({
  assignmentId,
  tasks,
  canToggle,
}: {
  assignmentId: string;
  tasks: ChecklistTask[];
  canToggle: boolean;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState<Record<string, boolean>>({});

  async function toggle(taskId: string, done: boolean) {
    setLocal((prev) => ({ ...prev, [taskId]: done }));
    const res = await toggleOnboardingTask({ assignmentId, taskId, done });
    if (!res.ok) {
      setLocal((prev) => ({ ...prev, [taskId]: !done }));
      toast.error(res.error);
      return;
    }
    if (res.data.trackComplete && done) toast.success("Onboarding complete");
    router.refresh();
  }

  if (tasks.length === 0) {
    return <p className="text-sm text-fg-muted">This track has no tasks yet.</p>;
  }

  return (
    <ul className="-mx-1.5 flex flex-col">
      {tasks.map((t) => {
        const done = local[t.id] ?? t.done;
        return (
          <li key={t.id} className="flex items-center gap-1">
            <label
              className={cn(
                "flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-sm max-md:min-h-11",
                canToggle && "cursor-pointer hover:bg-bg-subtle"
              )}
            >
              <Checkbox
                checked={done}
                disabled={!canToggle}
                onCheckedChange={(c) => toggle(t.id, c === true)}
                className="max-md:size-5"
              />
              <span className={cn("min-w-0 flex-1", done && "text-fg-subtle line-through")}>
                {t.title}
                {!t.required && <span className="text-xs text-fg-subtle no-underline"> · optional</span>}
              </span>
            </label>
            {t.resourceUrl && (
              <a
                href={t.resourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open the resource for “${t.title}”`}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-subtle hover:text-fg max-md:size-10"
              >
                <ExternalLinkIcon className="size-4" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
