import { organization } from "@/db/schema";
import { sendEmailSafe, sendOnce } from "@/lib/notify";
import { adminNoticeEmail, inviteEmail, nudgeEmail, type AdminNoticeRow } from "@/lib/onboarding/emails";
import { getPipeline, NUDGE_KIND } from "@/lib/onboarding/load";
import { adminNotice, memberNudge, type NudgeSubject } from "@/lib/onboarding/nudges";
import type { JobSummary, Roster } from "./jobs";
import { localDate } from "./rules";

type Org = typeof organization.$inferSelect;

/**
 * Onboarding follow-up, once a day:
 *  - one reminder to an invite nobody has used after three days;
 *  - a reminder to members with required items left, three days before the
 *    due date and again once it has passed, never more than one per three days;
 *  - one note to the admin who invited them when a member finishes, or is a
 *    week past due.
 * The decisions live in src/lib/onboarding/nudges.ts; every send is claimed in
 * notification_log first, so a second run the same day sends nothing.
 */
export async function onboardingNudges(org: Org, roster: Roster, now: Date): Promise<JobSummary> {
  const { entries } = await getPipeline(org.id, now);
  const today = localDate(now, org.timezone).date;
  let emails = 0;
  let items = 0;
  const notices = new Map<string, { key: string; row: AdminNoticeRow }[]>();

  for (const e of entries) {
    // Only people on a track are chased; an unenrolled sign-in has no due date.
    if (!e.enrolled) continue;
    const subject: NudgeSubject = {
      memberId: e.member.id,
      stage: e.stage,
      invitedAt: e.member.createdAt,
      dueAt: e.dueAt,
      completedAt: e.completedAt,
      lastNudgeAt: e.lastNudgeAt,
    };
    const remaining = e.summary.requiredTotal - e.summary.requiredDone;

    const nudge = memberNudge(subject, now, today);
    if (nudge) {
      const inviter = e.invitedBy ? roster.byId.get(e.invitedBy.id) : undefined;
      const sent = await sendOnce(
        {
          orgId: org.id,
          // The invite reminder keeps its own kind so it never counts as a due-date nudge.
          kind: nudge.kind === "invite_reminder" ? "onboarding_invite_reminder" : NUDGE_KIND,
          key: nudge.key,
          recipient: e.member.email,
          summary: nudge.kind,
        },
        () =>
          sendEmailSafe(
            nudge.kind === "invite_reminder"
              ? inviteEmail({
                  org,
                  inviterName: e.invitedBy?.name ?? org.name,
                  inviterEmail: inviter?.email,
                  to: e.member,
                  plan: { requiredCount: e.summary.requiredTotal, minutes: e.summary.minutesTotal, dueAt: e.dueAt },
                  reminder: true,
                })
              : nudgeEmail({
                  org,
                  to: e.member,
                  kind: nudge.kind,
                  remaining,
                  nextTitle: e.summary.next?.title ?? null,
                  minutesLeft: e.summary.minutesLeft,
                  dueAt: e.dueAt,
                  locked: !e.member.onboardedAt,
                })
          )
      );
      if (sent) {
        emails++;
        items++;
      }
    }

    const notice = adminNotice(subject, now);
    if (notice) {
      // The admin who invited them, if they are still an active admin; otherwise every admin.
      const inviter = e.invitedBy ? roster.byId.get(e.invitedBy.id) : undefined;
      const recipients = inviter?.role === "admin" ? [inviter.id] : roster.adminIds;
      const row: AdminNoticeRow = {
        name: e.member.displayName,
        kind: notice.kind,
        detail:
          notice.kind === "completed"
            ? `${e.summary.requiredTotal} of ${e.summary.requiredTotal} required items`
            : e.stage === "invited"
              ? "has not signed in"
              : remaining > 0
                ? `${remaining} required item${remaining === 1 ? "" : "s"} left${e.summary.next ? `, stuck on “${e.summary.next.title}”` : ""}`
                : "has not confirmed their details",
      };
      for (const id of recipients) {
        if (id === e.member.id) continue;
        notices.set(id, [...(notices.get(id) ?? []), { key: notice.key, row }]);
      }
    }
  }

  // One summary per admin, covering only what they have not been told yet.
  for (const [adminId, list] of notices) {
    const admin = roster.byId.get(adminId);
    if (!admin) continue;
    const fresh: AdminNoticeRow[] = [];
    for (const n of list) {
      const claimed = await sendOnce(
        { orgId: org.id, kind: "onboarding_admin_notice", key: `${n.key}:${adminId}`, recipient: admin.email },
        async () => true
      );
      if (claimed) fresh.push(n.row);
    }
    if (fresh.length === 0) continue;
    const sent = await sendEmailSafe({
      ...adminNoticeEmail({ org, to: admin, rows: fresh }),
      audience: { memberId: admin.id, category: "reminders", prefs: admin.emailPrefs },
    });
    if (sent) emails++;
    items += fresh.length;
  }

  return { emails, items };
}
