import { desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { jobRun, organization, type JobTrigger } from "@/db/schema";
import { reportError } from "@/lib/report-error";
import { orgSettings } from "@/lib/org-settings";
import { isDigestDay } from "./rules";
import {
  autoCloseVotes,
  checkinReminders,
  digestRecipientsThisWeek,
  loadRoster,
  pruneIntakeAttempts,
  slaNudges,
  voteReminders,
  weeklyDigest,
  type JobSummary,
} from "./jobs";
import { onboardingNudges } from "./onboarding-nudges";
import { scheduleReminders } from "./schedule-reminders";

/**
 * The one scheduled entry point. Runs once a day (see vercel.json and
 * ADMIN_RUNBOOK.md → Scheduling); each job decides for itself whether today
 * is its day. Safe to run more often — every send is deduplicated.
 */

export type JobReport = JobSummary | { skipped: string } | { error: string };

export type DailyReport = {
  /** False if any job failed. The route answers 500 so the scheduler shows it. */
  ok: boolean;
  ranAt: string;
  /** False means emails were only printed to the server log. */
  emailConfigured: boolean;
  orgs: { name: string; jobs: Record<string, JobReport> }[];
  /** Set when the run failed before reaching any job. */
  error?: string;
};

async function attempt(enabled: boolean, job: () => Promise<JobSummary>): Promise<JobReport> {
  if (!enabled) return { skipped: "Switched off in Settings" };
  try {
    return await job();
  } catch (e) {
    // One broken job must not stop the others from running.
    const ref = reportError("automation", e);
    return { error: `${e instanceof Error ? e.message : "Unknown error"} (ref ${ref})` };
  }
}

/**
 * Run every job and record the run. The record is what Settings and
 * /api/health show, so "did the reminders go out?" never needs the logs.
 */
export async function runDaily(now: Date = new Date(), trigger: JobTrigger = "schedule"): Promise<DailyReport> {
  const [run] = await db.insert(jobRun).values({ kind: "daily", trigger, startedAt: new Date() }).returning({ id: jobRun.id });
  let report: DailyReport;
  try {
    report = await runJobs(now);
  } catch (e) {
    // Something outside any single job (loading the club, the roster).
    const ref = reportError("automation", e);
    report = {
      ok: false,
      ranAt: now.toISOString(),
      emailConfigured: Boolean(process.env.RESEND_API_KEY),
      orgs: [],
      error: `${e instanceof Error ? e.message : "Unknown error"} (ref ${ref})`,
    };
  }
  const all = report.orgs.flatMap((o) => Object.values(o.jobs));
  const failures = all.filter((j) => "error" in j).length + (report.error ? 1 : 0);
  const emails = all.reduce((n, j) => n + ("emails" in j ? j.emails : 0), 0);
  await db
    .update(jobRun)
    .set({ finishedAt: new Date(), ok: report.ok, emails, failures, report: report as unknown as Record<string, unknown> })
    .where(eq(jobRun.id, run.id))
    .catch((e) => reportError("automation", e));
  // Keep three months of history.
  await db.delete(jobRun).where(lt(jobRun.startedAt, new Date(Date.now() - 90 * 86_400_000))).catch(() => {});
  return report;
}

export type LastRun = {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  emails: number;
  failures: number;
  trigger: JobTrigger;
};

/** The most recent run, for Settings and the health check. */
export async function lastDailyRun(): Promise<LastRun | null> {
  const [row] = await db
    .select({
      startedAt: jobRun.startedAt,
      finishedAt: jobRun.finishedAt,
      ok: jobRun.ok,
      emails: jobRun.emails,
      failures: jobRun.failures,
      trigger: jobRun.trigger,
    })
    .from(jobRun)
    .where(eq(jobRun.kind, "daily"))
    .orderBy(desc(jobRun.startedAt))
    .limit(1);
  return row ?? null;
}

async function runJobs(now: Date): Promise<DailyReport> {
  const orgs = await db.select().from(organization);
  const report: DailyReport = {
    ok: true,
    ranAt: now.toISOString(),
    emailConfigured: Boolean(process.env.RESEND_API_KEY),
    orgs: [],
  };

  for (const org of orgs) {
    const { automation } = orgSettings(org);
    const roster = await loadRoster(org.id);
    const jobs: Record<string, JobReport> = {};

    jobs.autoCloseVotes = await attempt(automation.autoCloseVotes, () => autoCloseVotes(org, roster, now));
    jobs.voteReminders = await attempt(automation.voteReminders, () => voteReminders(org, roster, now));

    const digestDay = isDigestDay(now, org.timezone);
    jobs.weeklyDigest = !digestDay
      ? { skipped: "Not Monday in the club's timezone" }
      : await attempt(automation.weeklyDigest, () => weeklyDigest(org, roster, now));

    // The digest runs first so the SLA nudge can skip what it just covered.
    jobs.slaNudges = await attempt(automation.slaNudges, async () =>
      slaNudges(org, roster, now, digestDay ? await digestRecipientsThisWeek(org, now) : undefined)
    );
    jobs.checkinReminders = await attempt(automation.checkinReminders, () =>
      checkinReminders(org, roster, now)
    );
    // No switch of its own yet: it follows the other member nudges.
    jobs.onboardingNudges = await attempt(automation.onboardingNudges, () => onboardingNudges(org, roster, now));
    jobs.scheduleReminders = await attempt(automation.scheduleReminders, () => scheduleReminders(org, roster, now));
    jobs.housekeeping = await attempt(true, async () => ({
      emails: 0,
      items: await pruneIntakeAttempts(org.id, now),
    }));

    report.orgs.push({ name: org.name, jobs });
  }
  report.ok = report.orgs.every((o) => Object.values(o.jobs).every((j) => !("error" in j)));
  return report;
}
