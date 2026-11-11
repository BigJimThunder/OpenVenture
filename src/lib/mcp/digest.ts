import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItem,
  application,
  company,
  grant,
  grantPool,
  meeting,
  pipelineStage,
  voteEligibility,
  voteRound,
} from "@/db/schema";
import type { Ctx } from "@/lib/actions/context";
import {
  applicationRow,
  formatWhen,
  plural,
  renderDigest,
  type DigestInput,
} from "@/lib/automation/digest";
import { summarizePool } from "@/lib/grants/budget";
import { appUrl } from "@/lib/notify";
import { formatRef } from "@/lib/refs";
import { formatMoney } from "@/lib/utils";

/**
 * One member's digest, on demand. Same inputs and the same renderer as the
 * Monday job (src/lib/automation/jobs.ts → weeklyDigest), for one person — so
 * what an assistant sends and what the cron sends cannot drift apart in
 * wording. Like the Monday email, the votes section lists open rounds the
 * member is eligible for and never says whether they have voted.
 */
export async function buildMemberDigest(ctx: Ctx, now: Date = new Date()) {
  const orgId = ctx.org.id;
  const memberId = ctx.member.id;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [applications, actionItems, votes, [nextMeeting], [fresh], [pool]] = await Promise.all([
    db
      .select({
        id: application.id,
        ref: application.ref,
        companyName: company.name,
        stageName: pipelineStage.name,
        slaDays: pipelineStage.slaDays,
        enteredStageAt: application.enteredStageAt,
        nextStep: application.nextStep,
        nextStepDue: application.nextStepDue,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.ownerMemberId, memberId),
          eq(application.status, "open"),
          eq(pipelineStage.kind, "active"),
          isNull(application.archivedAt)
        )
      )
      .orderBy(asc(application.enteredStageAt)),
    db
      .select({ ref: actionItem.ref, title: actionItem.title, dueAt: actionItem.dueAt })
      .from(actionItem)
      .where(
        and(
          eq(actionItem.orgId, orgId),
          eq(actionItem.assigneeMemberId, memberId),
          eq(actionItem.status, "open")
        )
      )
      .orderBy(sql`${actionItem.dueAt} asc nulls last`),
    db
      .select({ title: voteRound.title, memoId: voteRound.memoId, closesAt: voteRound.closesAt })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .where(
        and(
          eq(voteRound.orgId, orgId),
          eq(voteRound.status, "open"),
          eq(voteEligibility.memberId, memberId),
          eq(voteEligibility.isRecused, false)
        )
      )
      .orderBy(asc(voteRound.closesAt)),
    db
      .select({ id: meeting.id, title: meeting.title, scheduledAt: meeting.scheduledAt })
      .from(meeting)
      .where(and(eq(meeting.orgId, orgId), eq(meeting.status, "scheduled"), gte(meeting.scheduledAt, now)))
      .orderBy(asc(meeting.scheduledAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .where(and(eq(application.orgId, orgId), gte(application.appliedAt, weekAgo))),
    db.select().from(grantPool).where(eq(grantPool.orgId, orgId)).orderBy(desc(grantPool.fiscalYear)).limit(1),
  ]);

  let budgetRemaining: string | null = null;
  if (pool) {
    const rows = await db
      .select({ status: grant.status, amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(eq(grant.poolId, pool.id));
    budgetRemaining = formatMoney(summarizePool(pool, rows).remaining);
  }

  const input: DigestInput = {
    firstName: ctx.member.displayName.trim().split(/\s+/)[0] ?? "",
    applications,
    votes,
    actionItems,
    nextMeeting: nextMeeting ?? null,
    club: { newApplications: fresh?.n ?? 0, budgetRemaining },
  };
  const timeZone = ctx.org.timezone;
  const { subject, bodyHtml } = renderDigest(input, { now, timeZone, url: appUrl });
  return { input, subject, bodyHtml, text: digestText(input, { now, timeZone }) };
}

/** The digest as plain text, section for section what the email says. */
export function digestText(input: DigestInput, opts: { now: Date; timeZone: string }): string {
  const { now, timeZone } = opts;
  const lines: string[] = [];
  const section = (title: string, rows: string[]) => {
    if (rows.length === 0) return;
    lines.push("", title, ...rows.map((r) => `- ${r}`));
  };

  section(
    "Votes open",
    input.votes.map(
      (v) =>
        `${v.title}${v.closesAt ? ` (closes ${formatWhen(v.closesAt, timeZone)})` : ""}: ${appUrl(
          v.memoId ? `/memos/${v.memoId}/vote` : "/memos"
        )}`
    )
  );
  section(
    "Your applications",
    input.applications.map((a) => {
      const row = applicationRow(a, now, appUrl);
      return `${row.title}: ${row.meta}${row.flag ? ` [${row.flag}]` : ""}`;
    })
  );
  section(
    "Your action items",
    input.actionItems.map((t) => {
      const overdue = t.dueAt != null && t.dueAt.getTime() < now.getTime();
      return `${formatRef("actionItem", t.ref)} ${t.title}: ${
        t.dueAt ? `due ${formatWhen(t.dueAt, timeZone)}${overdue ? " [overdue]" : ""}` : "no due date"
      }`;
    })
  );
  if (input.nextMeeting) {
    section("Next meeting", [
      `${input.nextMeeting.title}, ${formatWhen(input.nextMeeting.scheduledAt, timeZone)}: ${appUrl(
        `/meetings/${input.nextMeeting.id}`
      )}`,
    ]);
  }
  section("The club this week", [
    `${plural(input.club.newApplications, "new application")} in the last seven days.${
      input.club.budgetRemaining ? ` ${input.club.budgetRemaining} left in this year's pool.` : ""
    }`,
  ]);
  return lines.join("\n").trim();
}
