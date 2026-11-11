"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { toggleOnboardingTask } from "@/lib/actions/members";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { OnboardingChecklist } from "./onboarding-checklist";

type Task = { id: string; title: string; required: boolean; resourceUrl: string | null };
type Row = {
  assignmentId: string;
  memberId: string;
  memberName: string;
  completedAt: string | null;
  done: string[];
};

/**
 * Who has done what. Fifteen members by a dozen tasks only stays readable if
 * the columns are narrow, so tasks are numbered: the key above the grid maps
 * number to task, the name column stays pinned with each member's progress,
 * and cells are small ticks. On phones the grid gives way to one card per
 * member that opens into their checklist.
 */
export function OnboardingMatrix({
  tasks,
  rows,
  viewerMemberId,
  viewerIsAdmin,
  viewerCanWrite,
}: {
  tasks: Task[];
  rows: Row[];
  viewerMemberId: string;
  viewerIsAdmin: boolean;
  viewerCanWrite: boolean;
}) {
  const router = useRouter();
  // Optimistic overrides keyed `${assignmentId}:${taskId}`.
  const [local, setLocal] = React.useState<Record<string, boolean>>({});
  const [openCard, setOpenCard] = React.useState<string | null>(
    () => rows.find((r) => r.memberId === viewerMemberId && !r.completedAt)?.assignmentId ?? null
  );

  const canToggle = (r: Row) => viewerIsAdmin || (viewerCanWrite && r.memberId === viewerMemberId);

  async function toggle(r: Row, taskId: string, done: boolean) {
    const key = `${r.assignmentId}:${taskId}`;
    setLocal((prev) => ({ ...prev, [key]: done }));
    const res = await toggleOnboardingTask({ assignmentId: r.assignmentId, taskId, done });
    if (!res.ok) {
      setLocal((prev) => ({ ...prev, [key]: !done }));
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  const isDone = (r: Row, taskId: string) => local[`${r.assignmentId}:${taskId}`] ?? r.done.includes(taskId);
  const doneCount = (r: Row) => tasks.filter((t) => isDone(r, t.id)).length;

  return (
    <>
      {/* ——— Desktop grid ——— */}
      <div className="hidden flex-col gap-3 md:flex">
        <ol className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-fg-muted lg:grid-cols-3">
          {tasks.map((t, i) => (
            <li key={t.id} className="flex min-w-0 items-baseline gap-2">
              <span className="tnum w-4 shrink-0 text-right font-medium text-fg">{i + 1}</span>
              <span className="truncate" title={t.title}>
                {t.title}
                {!t.required && <span className="text-fg-subtle"> · optional</span>}
              </span>
            </li>
          ))}
        </ol>

        <div className="overflow-x-auto rounded-lg border border-border bg-panel shadow-xs">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 border-b border-border bg-panel px-4 py-2 text-left text-xs font-medium text-fg-muted"
                >
                  Member
                </th>
                {tasks.map((t, i) => (
                  <th key={t.id} scope="col" className="border-b border-border px-0 py-2 text-center">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="tnum inline-flex w-8 cursor-default justify-center text-xs font-medium text-fg-muted">
                          {i + 1}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{t.title}</TooltipContent>
                    </Tooltip>
                  </th>
                ))}
                <th scope="col" className="w-full border-b border-border" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const n = doneCount(r);
                const complete = tasks.length > 0 && n === tasks.length;
                const mine = r.memberId === viewerMemberId;
                const editable = canToggle(r);
                return (
                  <tr key={r.assignmentId} className="group">
                    <th
                      scope="row"
                      className={cn(
                        "sticky left-0 z-10 border-b border-border bg-panel px-4 py-1.5 text-left font-normal group-last:border-0",
                        mine && "bg-accent-subtle"
                      )}
                    >
                      <Link href={`/members/${r.memberId}`} className="flex w-52 items-center gap-2.5">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[9px]">{initials(r.memberName)}</AvatarFallback>
                        </Avatar>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium hover:underline">
                            {r.memberName}
                            {mine && <span className="font-normal text-fg-subtle"> (you)</span>}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-bg-subtle">
                              <span
                                className={cn("block h-full rounded-full", complete ? "bg-success" : "bg-accent")}
                                style={{ width: `${tasks.length ? (n / tasks.length) * 100 : 0}%` }}
                              />
                            </span>
                            <span className={cn("tnum w-9 text-right text-xs", complete ? "text-success" : "text-fg-muted")}>
                              {n}/{tasks.length}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </th>
                    {tasks.map((t) => {
                      const done = isDone(r, t.id);
                      return (
                        <td
                          key={t.id}
                          className={cn(
                            "border-b border-border p-0 text-center group-last:border-0",
                            mine && "bg-accent-subtle/40"
                          )}
                        >
                          <button
                            type="button"
                            disabled={!editable}
                            onClick={() => toggle(r, t.id, !done)}
                            aria-label={`${r.memberName} — ${t.title}: ${done ? "done" : "not done"}`}
                            aria-pressed={done}
                            className={cn(
                              "inline-flex size-8 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset",
                              editable && "cursor-pointer"
                            )}
                          >
                            <span
                              className={cn(
                                "flex size-[18px] items-center justify-center rounded-[5px] border transition-colors",
                                done
                                  ? "border-success bg-success text-panel"
                                  : cn("border-border-strong/70 text-transparent", editable && "hover:border-fg-subtle")
                              )}
                            >
                              <CheckIcon className="size-3" strokeWidth={3} />
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className={cn("border-b border-border group-last:border-0", mine && "bg-accent-subtle/40")} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ——— Phone: one card per member ——— */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => {
          const n = doneCount(r);
          const complete = tasks.length > 0 && n === tasks.length;
          const open = openCard === r.assignmentId;
          return (
            <li key={r.assignmentId} className="rounded-lg border border-border bg-panel shadow-xs">
              <button
                type="button"
                onClick={() => setOpenCard(open ? null : r.assignmentId)}
                aria-expanded={open}
                className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Avatar className="size-8">
                  <AvatarFallback className="text-[10px]">{initials(r.memberName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.memberName}
                    {r.memberId === viewerMemberId && <span className="font-normal text-fg-subtle"> (you)</span>}
                  </span>
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-bg-subtle">
                    <span
                      className={cn("block h-full rounded-full", complete ? "bg-success" : "bg-accent")}
                      style={{ width: `${tasks.length ? (n / tasks.length) * 100 : 0}%` }}
                    />
                  </span>
                </span>
                <span className={cn("tnum shrink-0 text-xs", complete ? "text-success" : "text-fg-muted")}>
                  {complete ? "Done" : `${n}/${tasks.length}`}
                </span>
                <ChevronDownIcon className={cn("size-4 shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="border-t border-border px-3 py-2">
                  <OnboardingChecklist
                    assignmentId={r.assignmentId}
                    tasks={tasks.map((t) => ({ ...t, done: isDone(r, t.id) }))}
                    canToggle={canToggle(r)}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
