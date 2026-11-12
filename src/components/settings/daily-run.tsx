"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DailyRunStatus = {
  /** ISO timestamp of the last run's start, or null if it has never run. */
  lastStartedAt: string | null;
  ok: boolean | null;
  emails: number;
  failures: number;
  trigger: "schedule" | "admin" | "assistant" | null;
  /** Whether CRON_SECRET is set — without it the scheduler is refused. */
  scheduled: boolean;
};

const TRIGGER_LABEL = { schedule: "on schedule", admin: "by an admin", assistant: "by an assistant" } as const;

/**
 * Whether the daily job is actually running, and a way to run it now. A day
 * and a half without a run means the schedule is broken, whatever the cause.
 */
export function DailyRun({ status }: { status: DailyRunStatus }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  // "Now" is read once on mount: rendering must stay pure.
  const [now] = React.useState(() => Date.now());

  const last = status.lastStartedAt ? new Date(status.lastStartedAt) : null;
  const stale = last ? now - last.getTime() > 36 * 3_600_000 : true;
  const tone = !last || stale || status.ok === false ? "warn" : "ok";

  let headline: string;
  if (!last) {
    headline = status.scheduled
      ? "Hasn't run yet. The first run happens within a day of deploying."
      : "Hasn't run, and can't on its own: CRON_SECRET isn't set on this deployment.";
  } else if (status.ok === false) {
    headline = `Last run ${formatDistanceToNow(last, { addSuffix: true })} had ${status.failures} ${status.failures === 1 ? "failure" : "failures"}. The details are in the server log.`;
  } else if (stale) {
    headline = `Last ran ${formatDistanceToNow(last, { addSuffix: true })} — it should run every day. Check the schedule in your host's dashboard.`;
  } else {
    headline = `Last ran ${formatDistanceToNow(last, { addSuffix: true })}${status.trigger ? `, ${TRIGGER_LABEL[status.trigger]}` : ""} · ${status.emails} ${status.emails === 1 ? "email" : "emails"} sent`;
  }

  async function runNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body) toast.error(body?.error ?? "The run didn't start. Try again.");
      else if (body.ok === false) toast.error("The run finished with failures. See the server log.");
      else toast.success("Done. Anything due has been sent.");
    } catch {
      toast.error("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="flex min-w-0 items-start gap-2 text-sm">
        <span
          aria-hidden
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", tone === "ok" ? "bg-success" : "bg-warning")}
        />
        <span>
          <span className="sr-only">{tone === "ok" ? "Healthy: " : "Needs attention: "}</span>
          {headline}
        </span>
      </p>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void runNow()}>
        {busy ? "Running…" : "Run now"}
      </Button>
    </div>
  );
}
