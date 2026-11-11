import { db } from "@/db";
import { organization } from "@/db/schema";
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

/**
 * The one scheduled entry point. Runs once a day (see vercel.json and
 * ADMIN_RUNBOOK.md → Scheduling); each job decides for itself whether today
 * is its day. Safe to run more often — every send is deduplicated.
 */

export type JobReport = JobSummary | { skipped: string } | { error: string };

export type DailyReport = {
  ranAt: string;
  /** False means emails were only printed to the server log. */
  emailConfigured: boolean;
  orgs: { name: string; jobs: Record<string, JobReport> }[];
};

async function attempt(enabled: boolean, job: () => Promise<JobSummary>): Promise<JobReport> {
  if (!enabled) return { skipped: "Switched off in Settings" };
  try {
    return await job();
  } catch (e) {
    // One broken job must not stop the others from running.
    console.error("[automation] job failed", e);
    return { error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function runDaily(now: Date = new Date()): Promise<DailyReport> {
  const orgs = await db.select().from(organization);
  const report: DailyReport = {
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
    jobs.housekeeping = await attempt(true, async () => ({
      emails: 0,
      items: await pruneIntakeAttempts(org.id, now),
    }));

    report.orgs.push({ name: org.name, jobs });
  }
  return report;
}
