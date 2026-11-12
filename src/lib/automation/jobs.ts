import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  actionItem,
  activity,
  application,
  company,
  grant,
  grantPool,
  meeting,
  member,
  notificationLog,
  organization,
  outcomeUpdate,
  pipelineStage,
  voteEligibility,
  voteRound,
} from "@/db/schema";
import { summarizePool } from "@/lib/grants/budget";
import { appUrl, emailLayout, sendEmailSafe, sendOnce } from "@/lib/notify";
import { formatRef } from "@/lib/refs";
import { formatMoney } from "@/lib/utils";
import {
  applicationRow,
  digestHasContent,
  formatWhen,
  paragraph,
  plural,
  renderDigest,
  rowList,
  sectionHeading,
  type DigestApplication,
  type EmailRow,
} from "./digest";
import {
  checkinDue,
  findSlaBreaches,
  localDate,
  routeToOwnerOrAdmins,
  voteIsOverdue,
  voteNeedsReminder,
} from "./rules";

/**
 * The scheduled jobs. Each one loads rows, asks `rules.ts` what is due, and
 * sends at most one email per person. Every send is claimed in
 * notification_log first, so running a job twice — a retried cron, an admin
 * pressing "Run now" — never emails anyone twice.
 */

type Org = typeof organization.$inferSelect;

export type JobSummary = {
  /** Emails that actually went out in this run. */
  emails: number;
  /** Things acted on: rounds closed, breaches reported, companies flagged. */
  items: number;
  note?: string;
};

type RosterMember = {
  id: string;
  email: string;
  displayName: string;
  role: (typeof member.$inferSelect)["role"];
  emailPrefs: (typeof member.$inferSelect)["emailPrefs"];
};

export type Roster = {
  members: RosterMember[];
  byId: Map<string, RosterMember>;
  activeIds: Set<string>;
  adminIds: string[];
};

export async function loadRoster(orgId: string): Promise<Roster> {
  const members = await db
    .select({
      id: member.id,
      email: member.email,
      displayName: member.displayName,
      role: member.role,
      emailPrefs: member.emailPrefs,
    })
    .from(member)
    .where(and(eq(member.orgId, orgId), eq(member.status, "active"), isNull(member.offboardedAt)))
    .orderBy(asc(member.joinedAt));
  return {
    members,
    byId: new Map(members.map((m) => [m.id, m])),
    activeIds: new Set(members.map((m) => m.id)),
    adminIds: members.filter((m) => m.role === "admin").map((m) => m.id),
  };
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

function memberFooter(org: Org): string {
  return `You're getting this because you're a member of ${org.name}.`;
}

/** Marks a scheduled email as optional for its recipient (see lib/email.ts). */
function audience(recipient: RosterMember, category: "digest" | "reminders") {
  return { memberId: recipient.id, category, prefs: recipient.emailPrefs };
}

/**
 * One email covering several items, each remembered separately. Items already
 * reported to this person are dropped; the rest go out together, at most one
 * such email per person per day. Returns how many items were newly reported.
 */
async function sendBatch<T extends { key: string }>(opts: {
  org: Org;
  kind: string;
  day: string;
  recipient: RosterMember;
  items: T[];
  send: (fresh: T[]) => Promise<boolean>;
}): Promise<number> {
  const keyed = opts.items.map((item) => ({ item, logKey: `${item.key}:${opts.recipient.id}` }));
  if (keyed.length === 0) return 0;
  const seen = await db
    .select({ key: notificationLog.key })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, opts.org.id),
        eq(notificationLog.kind, opts.kind),
        inArray(
          notificationLog.key,
          keyed.map((k) => k.logKey)
        )
      )
    );
  const seenKeys = new Set(seen.map((s) => s.key));
  const fresh = keyed.filter((k) => !seenKeys.has(k.logKey));
  if (fresh.length === 0) return 0;

  const sent = await sendOnce(
    {
      orgId: opts.org.id,
      kind: `${opts.kind}_email`,
      key: `${opts.recipient.id}:${opts.day}`,
      recipient: opts.recipient.email,
      summary: `${fresh.length} item(s)`,
    },
    () => opts.send(fresh.map((f) => f.item))
  );
  if (!sent) return 0;
  await markReported(opts.org.id, opts.kind, opts.recipient.email, fresh.map((f) => f.logKey));
  return fresh.length;
}

async function markReported(orgId: string, kind: string, recipient: string, keys: string[]) {
  if (keys.length === 0) return;
  await db
    .insert(notificationLog)
    .values(keys.map((key) => ({ orgId, kind, key, recipient })))
    .onConflictDoNothing();
}

// ——— Close votes at their deadline ———

export async function autoCloseVotes(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const open = await db
    .select({ id: voteRound.id, closesAt: voteRound.closesAt })
    .from(voteRound)
    .where(and(eq(voteRound.orgId, org.id), eq(voteRound.status, "open"), isNotNull(voteRound.closesAt)));
  const overdue = open.filter((r) => voteIsOverdue(r, now)).map((r) => r.id);

  // Closing is not revealing: ballots stay sealed until a partner reveals.
  const closed = overdue.length
    ? await db
        .update(voteRound)
        .set({ status: "closed" })
        .where(and(inArray(voteRound.id, overdue), eq(voteRound.status, "open")))
        .returning({ id: voteRound.id, title: voteRound.title })
    : [];
  if (closed.length) {
    await db.insert(activity).values(
      closed.map((r) => ({
        orgId: org.id,
        actorType: "system" as const,
        verb: "vote.closed",
        entityType: "vote_round",
        entityId: r.id,
        entityLabel: r.title,
        summary: `${r.title} closed at its deadline and is ready to reveal`,
      }))
    );
  }

  // Derived from state rather than from this run's transition, so a failed
  // send is retried tomorrow instead of being lost.
  const awaitingReveal = await db
    .select({ id: voteRound.id, title: voteRound.title, memoId: voteRound.memoId, quorum: voteRound.quorum })
    .from(voteRound)
    .where(
      and(
        eq(voteRound.orgId, org.id),
        eq(voteRound.status, "closed"),
        gte(voteRound.closesAt, new Date(now.getTime() - 7 * 86_400_000))
      )
    );
  const day = localDate(now, org.timezone).date;
  let emails = 0;
  if (awaitingReveal.length) {
    for (const partner of roster.members.filter((m) => m.role === "partner" || m.role === "admin")) {
      const reported = await sendBatch({
        org,
        kind: "vote_closed",
        day,
        recipient: partner,
        items: awaitingReveal.map((r) => ({ ...r, key: r.id })),
        send: (rounds) =>
          sendEmailSafe({
            to: partner.email,
            subject:
              rounds.length === 1
                ? `Ready to reveal: ${rounds[0].title}`
                : `${rounds.length} votes are ready to reveal`,
            html: emailLayout({
              orgName: org.name,
              heading: rounds.length === 1 ? "A vote has closed" : "Votes have closed",
              bodyHtml:
                paragraph(
                  "Voting closed at the deadline. Ballots are still sealed: nobody can see how anyone voted until a partner reveals the round."
                ) +
                rowList(
                  rounds.map((r) => ({
                    title: r.title,
                    meta: r.quorum
                      ? `Quorum is ${r.quorum}. Reveal checks it for you.`
                      : "Reveal when the club is ready to discuss.",
                    href: appUrl(r.memoId ? `/memos/${r.memoId}/vote` : "/memos"),
                  }))
                ),
              cta: {
                label: "Open the vote",
                url: appUrl(rounds[0].memoId ? `/memos/${rounds[0].memoId}/vote` : "/memos"),
              },
              footer: memberFooter(org),
            }),
          }),
      });
      if (reported) emails++;
    }
  }
  return { emails, items: closed.length };
}

// ——— Vote reminders ———

/**
 * BLIND-VOTE INVARIANT: this job never reads `vote` rows. It cannot know who
 * has voted, so it reminds every eligible, non-recused member — which also
 * means the reminder itself leaks nothing about turnout.
 */
export async function voteReminders(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const open = await db
    .select({
      id: voteRound.id,
      title: voteRound.title,
      memoId: voteRound.memoId,
      opensAt: voteRound.opensAt,
      closesAt: voteRound.closesAt,
    })
    .from(voteRound)
    .where(and(eq(voteRound.orgId, org.id), eq(voteRound.status, "open")));
  const due = open.filter((r) => voteNeedsReminder(r, now));
  if (due.length === 0) return { emails: 0, items: 0 };

  const eligible = await db
    .select({ roundId: voteEligibility.voteRoundId, memberId: voteEligibility.memberId })
    .from(voteEligibility)
    .where(
      and(
        inArray(
          voteEligibility.voteRoundId,
          due.map((r) => r.id)
        ),
        eq(voteEligibility.isRecused, false)
      )
    );
  const roundsByMember = new Map<string, typeof due>();
  for (const e of eligible) {
    const round = due.find((r) => r.id === e.roundId);
    if (!round || !roster.activeIds.has(e.memberId)) continue;
    roundsByMember.set(e.memberId, [...(roundsByMember.get(e.memberId) ?? []), round]);
  }

  const day = localDate(now, org.timezone).date;
  let emails = 0;
  for (const [memberId, rounds] of roundsByMember) {
    const recipient = roster.byId.get(memberId)!;
    const reported = await sendBatch({
      org,
      kind: "vote_reminder",
      day,
      recipient,
      items: rounds.map((r) => ({ ...r, key: r.id })),
      send: (fresh) =>
        sendEmailSafe({
          audience: audience(recipient, "reminders"),
          to: recipient.email,
          subject:
            fresh.length === 1
              ? `Closing soon: ${fresh[0].title}`
              : `${fresh.length} votes are closing soon`,
          html: emailLayout({
            orgName: org.name,
            heading: fresh.length === 1 ? "A vote closes soon" : "Votes close soon",
            bodyHtml:
              paragraph(
                "If you haven't voted yet, now is the time. Votes are blind until reveal, and you can change your ballot until the round closes."
              ) +
              rowList(
                fresh.map((r) => ({
                  title: r.title,
                  meta: r.closesAt ? `Closes ${formatWhen(r.closesAt, org.timezone)}` : undefined,
                  href: appUrl(r.memoId ? `/memos/${r.memoId}/vote` : "/memos"),
                }))
              ),
            cta: {
              label: "Cast your vote",
              url: appUrl(fresh[0].memoId ? `/memos/${fresh[0].memoId}/vote` : "/memos"),
            },
            footer: `This reminder goes to every eligible member — we can't see who has voted. ${memberFooter(org)}`,
          }),
        }),
    });
    if (reported) emails++;
  }
  return { emails, items: due.length };
}

// ——— Open work, shared by the SLA nudge and the digest ———

async function loadOpenApplications(orgId: string) {
  return db
    .select({
      id: application.id,
      ref: application.ref,
      companyName: company.name,
      stageName: pipelineStage.name,
      slaDays: pipelineStage.slaDays,
      enteredStageAt: application.enteredStageAt,
      nextStep: application.nextStep,
      nextStepDue: application.nextStepDue,
      ownerMemberId: application.ownerMemberId,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
    .where(
      and(
        eq(application.orgId, orgId),
        eq(application.status, "open"),
        eq(pipelineStage.kind, "active"),
        isNull(application.archivedAt)
      )
    )
    .orderBy(asc(application.enteredStageAt));
}

async function loadOpenActionItems(orgId: string) {
  return db
    .select({
      ref: actionItem.ref,
      title: actionItem.title,
      dueAt: actionItem.dueAt,
      assigneeMemberId: actionItem.assigneeMemberId,
    })
    .from(actionItem)
    .where(and(eq(actionItem.orgId, orgId), eq(actionItem.status, "open"), isNotNull(actionItem.assigneeMemberId)))
    .orderBy(sql`${actionItem.dueAt} asc nulls last`);
}

// ——— Stage SLA nudges ———

export async function slaNudges(
  org: Org,
  roster: Roster,
  now: Date,
  /** Members whose digest this week already lists their overdue applications. */
  coveredByDigest: ReadonlySet<string> = new Set()
): Promise<JobSummary> {
  const apps = await loadOpenApplications(org.id);
  const breaches = findSlaBreaches(
    apps.map((a) => ({ ...a, applicationId: a.id })),
    now
  );
  if (breaches.length === 0) return { emails: 0, items: 0 };

  const routed = routeToOwnerOrAdmins(breaches, roster.activeIds, roster.adminIds);
  const overdueTasks = (await loadOpenActionItems(org.id)).filter(
    (t) => t.dueAt != null && t.dueAt.getTime() < now.getTime()
  );
  const day = localDate(now, org.timezone).date;
  let emails = 0;
  let folded = 0;

  for (const [memberId, items] of routed) {
    const recipient = roster.byId.get(memberId);
    if (!recipient) continue;

    let toSend = items;
    if (coveredByDigest.has(memberId)) {
      // Their Monday digest flagged these as over; a second email would be noise.
      const own = items.filter((b) => b.ownerMemberId === memberId);
      await markReported(
        org.id,
        "sla_nudge",
        recipient.email,
        own.map((b) => `${b.key}:${memberId}`)
      );
      folded += own.length;
      toSend = items.filter((b) => b.ownerMemberId !== memberId);
    }

    const myTasks = overdueTasks.filter((t) => t.assigneeMemberId === memberId);
    const reported = await sendBatch({
      org,
      kind: "sla_nudge",
      day,
      recipient,
      items: toSend,
      send: (fresh) => {
        const unowned = fresh.filter((b) => b.ownerMemberId !== memberId);
        const rows: EmailRow[] = fresh.map((b) => ({
          ...applicationRow(b, now, appUrl),
          flag: `${plural(b.daysOver, "day")} over`,
        }));
        const taskRows: EmailRow[] = myTasks.map((t) => ({
          title: `${formatRef("actionItem", t.ref)} ${t.title}`,
          meta: `Due ${formatWhen(t.dueAt!, org.timezone)}`,
          href: appUrl("/my-work"),
          flag: "overdue",
        }));
        return sendEmailSafe({
          audience: audience(recipient, "reminders"),
          to: recipient.email,
          subject:
            fresh.length === 1
              ? `${fresh[0].companyName} has been in ${fresh[0].stageName} for ${plural(fresh[0].daysInStage, "day")}`
              : `${fresh.length} applications are past their stage deadline`,
          html: emailLayout({
            orgName: org.name,
            heading:
              fresh.length === 1 ? "An application is waiting" : "Applications are waiting",
            bodyHtml:
              paragraph(
                `${firstName(recipient.displayName) ? `Hi ${firstName(recipient.displayName)}. ` : ""}${
                  fresh.length === 1 ? "This application has" : "These applications have"
                } sat in a stage longer than the club allows. A founder is waiting on the other end — move ${
                  fresh.length === 1 ? "it" : "them"
                } forward, decline, or set a next step.`
              ) +
              (unowned.length
                ? paragraph(
                    `${plural(unowned.length, "application")} here ${
                      unowned.length === 1 ? "has" : "have"
                    } no owner, so this went to the admins. Assign one and the nudges go to them instead.`
                  )
                : "") +
              rowList(rows) +
              (taskRows.length ? sectionHeading("Also overdue") + rowList(taskRows) : ""),
            cta: { label: "Open the pipeline", url: appUrl("/pipeline") },
            footer: `One nudge per application per stage. ${memberFooter(org)}`,
          }),
        });
      },
    });
    if (reported) emails++;
  }
  return {
    emails,
    items: breaches.length,
    note: folded ? `${folded} folded into this week's digest` : undefined,
  };
}

// ——— Quarterly grantee check-ins ———

export async function checkinReminders(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const grants = await db
    .select({
      companyId: company.id,
      companyName: company.name,
      outcomeUpdatedAt: company.outcomeUpdatedAt,
      issuedAt: grant.issuedAt,
      ownerMemberId: application.ownerMemberId,
    })
    .from(grant)
    .innerJoin(company, eq(grant.companyId, company.id))
    .leftJoin(application, eq(grant.applicationId, application.id))
    .where(
      and(
        eq(grant.orgId, org.id),
        inArray(grant.status, ["issued", "cashed", "reconciled"]),
        isNotNull(grant.issuedAt),
        isNull(company.archivedAt)
      )
    )
    .orderBy(desc(grant.issuedAt));
  if (grants.length === 0) return { emails: 0, items: 0 };

  const lastUpdates = await db
    .select({ companyId: outcomeUpdate.companyId, at: sql<Date>`max(${outcomeUpdate.recordedAt})` })
    .from(outcomeUpdate)
    .where(eq(outcomeUpdate.orgId, org.id))
    .groupBy(outcomeUpdate.companyId);
  const lastUpdateBy = new Map(lastUpdates.map((u) => [u.companyId, new Date(u.at)]));

  const quarter = localDate(now, org.timezone).quarter;
  const seen = new Set<string>();
  const due: {
    key: string;
    companyName: string;
    daysSince: number;
    hasUpdate: boolean;
    ownerMemberId: string | null;
  }[] = [];
  for (const g of grants) {
    // Ordered newest grant first: that grant's application owner is the contact.
    if (seen.has(g.companyId)) continue;
    seen.add(g.companyId);
    const logged = lastUpdateBy.get(g.companyId) ?? null;
    const lastOutcomeAt =
      logged && g.outcomeUpdatedAt
        ? new Date(Math.max(logged.getTime(), g.outcomeUpdatedAt.getTime()))
        : (logged ?? g.outcomeUpdatedAt);
    const status = checkinDue({ lastOutcomeAt, issuedAt: g.issuedAt }, now);
    if (!status.due) continue;
    due.push({
      key: `${g.companyId}:${quarter}`,
      companyName: g.companyName,
      daysSince: status.daysSince ?? 0,
      hasUpdate: lastOutcomeAt != null,
      ownerMemberId: g.ownerMemberId,
    });
  }
  if (due.length === 0) return { emails: 0, items: 0 };

  const day = localDate(now, org.timezone).date;
  let emails = 0;
  for (const [memberId, items] of routeToOwnerOrAdmins(due, roster.activeIds, roster.adminIds)) {
    const recipient = roster.byId.get(memberId);
    if (!recipient) continue;
    const reported = await sendBatch({
      org,
      kind: "checkin_reminder",
      day,
      recipient,
      items,
      send: (fresh) =>
        sendEmailSafe({
          audience: audience(recipient, "reminders"),
          to: recipient.email,
          subject:
            fresh.length === 1
              ? `Time to check in with ${fresh[0].companyName}`
              : `${fresh.length} grantees are due a check-in`,
          html: emailLayout({
            orgName: org.name,
            heading: "How are our grantees doing?",
            bodyHtml:
              paragraph(
                "We check in with every funded company once a term. It is how the club learns whether its grants work, and it is most of what next year's report is made of. A two-line reply from the founder is enough."
              ) +
              rowList(
                fresh.map((c) => ({
                  title: c.companyName,
                  meta: c.hasUpdate
                    ? `Last update ${plural(c.daysSince, "day")} ago`
                    : `Funded ${plural(c.daysSince, "day")} ago, no update recorded yet`,
                  href: appUrl("/outcomes"),
                }))
              ),
            cta: { label: "Record a check-in", url: appUrl("/outcomes") },
            footer: `One reminder per company per quarter. ${memberFooter(org)}`,
          }),
        }),
    });
    if (reported) emails++;
  }
  return { emails, items: due.length };
}

// ——— Monday digest ———

export async function weeklyDigest(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const [apps, tasks, votes, [nextMeeting], [fresh], pools] = await Promise.all([
    loadOpenApplications(org.id),
    loadOpenActionItems(org.id),
    db
      .select({
        memberId: voteEligibility.memberId,
        title: voteRound.title,
        memoId: voteRound.memoId,
        closesAt: voteRound.closesAt,
      })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .where(
        and(
          eq(voteRound.orgId, org.id),
          eq(voteRound.status, "open"),
          eq(voteEligibility.isRecused, false)
        )
      )
      .orderBy(asc(voteRound.closesAt)),
    db
      .select({ id: meeting.id, title: meeting.title, scheduledAt: meeting.scheduledAt })
      .from(meeting)
      .where(and(eq(meeting.orgId, org.id), eq(meeting.status, "scheduled"), gte(meeting.scheduledAt, now)))
      .orderBy(asc(meeting.scheduledAt))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .where(and(eq(application.orgId, org.id), gte(application.appliedAt, weekAgo))),
    db.select().from(grantPool).where(eq(grantPool.orgId, org.id)).orderBy(desc(grantPool.fiscalYear)).limit(1),
  ]);

  let budgetRemaining: string | null = null;
  if (pools[0]) {
    const rows = await db
      .select({ status: grant.status, amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(eq(grant.poolId, pools[0].id));
    budgetRemaining = formatMoney(summarizePool(pools[0], rows).remaining);
  }

  const week = localDate(now, org.timezone).isoWeek;
  let emails = 0;
  let skipped = 0;
  for (const m of roster.members) {
    const mine: DigestApplication[] = apps.filter((a) => a.ownerMemberId === m.id);
    const input = {
      firstName: firstName(m.displayName),
      applications: mine,
      votes: votes.filter((v) => v.memberId === m.id),
      actionItems: tasks.filter((t) => t.assigneeMemberId === m.id),
      nextMeeting: nextMeeting ?? null,
      club: { newApplications: fresh?.n ?? 0, budgetRemaining },
    };
    if (!digestHasContent(input)) {
      skipped++;
      continue;
    }
    const { subject, bodyHtml } = renderDigest(input, { now, timeZone: org.timezone, url: appUrl });
    const sent = await sendOnce(
      { orgId: org.id, kind: "weekly_digest", key: `${m.id}:${week}`, recipient: m.email, summary: subject },
      () =>
        sendEmailSafe({
          audience: audience(m, "digest"),
          to: m.email,
          subject: `${org.name} — ${subject}`,
          html: emailLayout({
            orgName: org.name,
            heading: "Your week at the club",
            bodyHtml,
            cta: { label: "Open your work", url: appUrl("/my-work") },
            footer: `Sent on Mondays. ${memberFooter(org)}`,
          }),
        })
    );
    if (sent) emails++;
  }
  return {
    emails,
    items: roster.members.length - skipped,
    note: skipped ? `${plural(skipped, "member")} had nothing to report` : undefined,
  };
}

/** Members whose digest for this week has gone out (in this run or an earlier one). */
export async function digestRecipientsThisWeek(org: Org, now: Date): Promise<Set<string>> {
  const week = localDate(now, org.timezone).isoWeek;
  const rows = await db
    .select({ key: notificationLog.key })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, org.id),
        eq(notificationLog.kind, "weekly_digest"),
        sql`${notificationLog.key} like ${`%:${week}`}`
      )
    );
  return new Set(rows.map((r) => r.key.slice(0, -(week.length + 1))));
}

/** Rate-limit bookkeeping for the public form is only useful for a day. */
export async function pruneIntakeAttempts(orgId: string, now: Date): Promise<number> {
  // Rate-limit counters are only needed for their window; webhook delivery
  // ids for as long as a sender might plausibly retry.
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const removed = await db
    .delete(notificationLog)
    .where(
      and(
        eq(notificationLog.orgId, orgId),
        or(
          and(
            inArray(notificationLog.kind, ["apply_attempt", "signin_link", "signin_code", "ai_call"]),
            lt(notificationLog.sentAt, days(2))
          ),
          and(eq(notificationLog.kind, "ingest_delivery"), lt(notificationLog.sentAt, days(30)))
        )
      )
    )
    .returning({ id: notificationLog.id });
  return removed.length;
}
