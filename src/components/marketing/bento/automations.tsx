"use client";

import * as React from "react";
import { BellRing, CalendarClock, ClipboardCheck, Mail, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { styles } from "../kit";

/**
 * The four scheduled jobs, in the order they will next run. `next` is what
 * the footer says when that job is the soonest one still switched on.
 */
const JOBS: { key: string; icon: LucideIcon; name: string; when: string; next: string }[] = [
  {
    key: "votes",
    icon: BellRing,
    name: "Vote reminders",
    when: "The day before a vote closes",
    next: "vote reminder for Lecture Loop, tomorrow 8:00 am",
  },
  {
    key: "deadlines",
    icon: CalendarClock,
    name: "Deadline nudges",
    when: "Once, to the application's owner",
    next: "deadline nudge for PageForge in 2 days",
  },
  {
    key: "digest",
    icon: Mail,
    name: "Monday digest",
    when: "8:00 am, only if something is waiting",
    next: "Monday digest in 3 days",
  },
  {
    key: "checkins",
    icon: ClipboardCheck,
    name: "Grantee check-ins",
    when: "Every quarter",
    next: "grantee check-ins in 6 weeks",
  },
];

/**
 * The club's automation settings, as the app lists them: one switch per job.
 * The footer always names the next thing that will actually be sent.
 */
export function AutomationsVisual() {
  const id = React.useId();
  const [on, setOn] = React.useState<Record<string, boolean>>(() =>
    Object.fromEntries(JOBS.map((j) => [j.key, true]))
  );

  const count = JOBS.filter((j) => on[j.key]).length;
  const upNext = JOBS.find((j) => on[j.key]);

  return (
    <div className="@container flex min-h-56 flex-col overflow-hidden rounded-xl border border-border-strong bg-panel shadow-xs">
      <ul className="divide-y divide-border">
        {JOBS.map((job) => {
          const enabled = on[job.key];
          const isNext = upNext?.key === job.key;
          return (
            <li key={job.key} className="flex min-h-[2.6875rem] items-center gap-3 py-1 pl-3 pr-3.5 max-lg:min-h-13 lg:@max-[19.75rem]:gap-2 lg:@max-[19.75rem]:px-2">
              <label htmlFor={`${id}-${job.key}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    // Below about 316px of card there is room for the icon or the whole schedule line, not both.
                    "relative inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors lg:@max-[19.75rem]:hidden",
                    isNext
                      ? "border-transparent bg-accent-subtle text-accent"
                      : enabled
                        ? "border-border bg-bg-subtle text-fg-muted"
                        : "border-border bg-transparent text-fg-subtle"
                  )}
                >
                  <job.icon className="size-3.5" />
                  {isNext && (
                    <span className={cn(styles.pulse, "absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent ring-2 ring-panel")} />
                  )}
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-sm font-medium leading-tight", enabled ? "text-fg" : "text-fg-muted")}>
                    {job.name}
                  </span>
                  <span
                    id={`${id}-${job.key}-when`}
                    className={cn("mt-0.5 block text-xs leading-snug lg:truncate", enabled ? "text-fg-muted" : "text-fg-subtle")}
                  >
                    {job.when}
                  </span>
                </span>
              </label>
              <Switch
                id={`${id}-${job.key}`}
                checked={enabled}
                onCheckedChange={(v) => setOn((s) => ({ ...s, [job.key]: v }))}
                aria-describedby={`${id}-${job.key}-when`}
              />
            </li>
          );
        })}
      </ul>
      <p
        role="status"
        aria-live="polite"
        className="flex min-h-12 flex-1 items-center border-t border-border bg-bg-subtle/60 px-3 py-1.5 lg:@max-[19.75rem]:px-2 text-xs leading-snug text-fg-muted"
      >
        <span>
          {count === 0 ? (
            <span className="font-medium text-fg">All automations are off</span>
          ) : (
            <>
              <span className="tnum font-medium text-fg">
                {count} of {JOBS.length} on
              </span>
              <span aria-hidden> · </span>
              <span className="tnum">Next: {upNext?.next}</span>
            </>
          )}
        </span>
      </p>
    </div>
  );
}
