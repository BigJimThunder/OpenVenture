"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DailyRunStatus = {
  /** "ok" when it ran recently without failures. */
  tone: "ok" | "warn";
  /** The whole sentence, worded on the server: relative times computed in the
   *  browser would differ from the server's by the time the page hydrates. */
  headline: string;
};

/**
 * Whether the daily job is actually running, and a way to run it now. The
 * status itself is worked out by `dailyRunStatus` on the server.
 */
export function DailyRun({ status }: { status: DailyRunStatus }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const { tone, headline } = status;

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
