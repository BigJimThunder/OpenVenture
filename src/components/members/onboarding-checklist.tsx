"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLinkIcon } from "lucide-react";
import { toast } from "sonner";
import { toggleOnboardingTask } from "@/lib/actions/members";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";

export function OnboardingChecklist({
  assignmentId,
  tasks,
  canToggle,
}: {
  assignmentId: string;
  tasks: { id: string; title: string; done: boolean; docId: string | null; resourceUrl: string | null }[];
  canToggle: boolean;
}) {
  const router = useRouter();

  async function toggle(taskId: string, done: boolean) {
    const res = await toggleOnboardingTask({ assignmentId, taskId, done });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if ((res.data as { trackComplete: boolean }).trackComplete && done) {
      toast.success("Onboarding complete 🎉");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {tasks.map((t) => (
        <label
          key={t.id}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-1 py-1 text-sm",
            canToggle && "cursor-pointer hover:bg-bg-subtle"
          )}
        >
          <Checkbox
            checked={t.done}
            disabled={!canToggle}
            onCheckedChange={(c) => toggle(t.id, c === true)}
          />
          <span className={cn("flex-1", t.done && "text-fg-subtle line-through")}>{t.title}</span>
          {t.docId && (
            <Link href={`/docs`} className="text-fg-subtle hover:text-accent">
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          )}
          {t.resourceUrl && !t.docId && (
            <a href={t.resourceUrl} target="_blank" rel="noreferrer" className="text-fg-subtle hover:text-accent">
              <ExternalLinkIcon className="size-3.5" />
            </a>
          )}
        </label>
      ))}
    </div>
  );
}
