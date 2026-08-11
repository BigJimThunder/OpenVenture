"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { toggleOnboardingTask } from "@/lib/actions/members";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function OnboardingMatrix({
  tasks,
  rows,
  viewerMemberId,
  viewerIsAdmin,
}: {
  tasks: { id: string; title: string }[];
  rows: {
    assignmentId: string;
    memberId: string;
    memberName: string;
    completedAt: string | null;
    done: string[];
  }[];
  viewerMemberId: string;
  viewerIsAdmin: boolean;
}) {
  const router = useRouter();

  async function toggle(assignmentId: string, taskId: string, done: boolean) {
    const res = await toggleOnboardingTask({ assignmentId, taskId, done });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-panel">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              Member
            </th>
            {tasks.map((t) => (
              <th key={t.id} className="px-2 py-2 text-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-block max-w-24 truncate align-bottom text-2xs font-medium text-fg-subtle">
                      {t.title}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t.title}</TooltipContent>
                </Tooltip>
              </th>
            ))}
            <th className="px-3 py-2 text-right text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              Progress
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const canToggle = viewerIsAdmin || r.memberId === viewerMemberId;
            const doneSet = new Set(r.done);
            return (
              <tr key={r.assignmentId} className="border-b border-border last:border-0">
                <td className="sticky left-0 z-10 bg-panel px-3 py-1.5">
                  <Link
                    href={`/members/${r.memberId}`}
                    className="flex items-center gap-2 font-medium hover:text-accent"
                  >
                    <Avatar className="size-5">
                      <AvatarFallback className="text-[8px]">
                        {initials(r.memberName)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="whitespace-nowrap">{r.memberName}</span>
                  </Link>
                </td>
                {tasks.map((t) => {
                  const done = doneSet.has(t.id);
                  return (
                    <td key={t.id} className="px-2 py-1.5 text-center">
                      <button
                        disabled={!canToggle}
                        onClick={() => toggle(r.assignmentId, t.id, !done)}
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded-full border transition-colors",
                          done
                            ? "border-success-border bg-success-bg text-success"
                            : "border-border text-transparent",
                          canToggle && "cursor-pointer hover:border-border-strong"
                        )}
                        aria-label={`${r.memberName}: ${t.title} ${done ? "done" : "not done"}`}
                      >
                        <CheckIcon className="size-3" />
                      </button>
                    </td>
                  );
                })}
                <td className="tnum px-3 py-1.5 text-right text-xs text-fg-muted">
                  {r.completedAt ? (
                    <span className="text-success">Complete</span>
                  ) : (
                    `${r.done.length}/${tasks.length}`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
