import { formatDistanceToNow } from "date-fns";
import type { LastRun } from "./run";

const TRIGGER_LABEL = { schedule: "on schedule", admin: "by an admin", assistant: "by an assistant" } as const;

/**
 * One sentence on whether the daily job is healthy, for Settings. A day and a
 * half without a run means the schedule is broken, whatever the cause.
 */
export function dailyRunStatus(
  last: LastRun | null,
  scheduled: boolean,
  now: Date = new Date()
): { tone: "ok" | "warn"; headline: string } {
  if (!last) {
    return {
      tone: "warn",
      headline: scheduled
        ? "Hasn't run yet. The first run happens within a day of deploying."
        : "Hasn't run, and can't on its own: CRON_SECRET isn't set on this deployment.",
    };
  }
  const ago = formatDistanceToNow(last.startedAt, { addSuffix: true });
  if (last.ok === false) {
    return {
      tone: "warn",
      headline: `Last run ${ago} had ${last.failures} ${last.failures === 1 ? "failure" : "failures"}. The details are in the server log.`,
    };
  }
  if (now.getTime() - last.startedAt.getTime() > 36 * 3_600_000) {
    return {
      tone: "warn",
      headline: `Last ran ${ago} — it should run every day. Check the schedule in your host's dashboard.`,
    };
  }
  return {
    tone: "ok",
    headline: `Last ran ${ago}, ${TRIGGER_LABEL[last.trigger]} · ${last.emails} ${last.emails === 1 ? "email" : "emails"} sent`,
  };
}
