import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  member,
  notificationLog,
  onboardingAssignment,
  onboardingCompletion,
  onboardingTask,
  onboardingTrack,
} from "@/db/schema";
import {
  daysUntilDue,
  isOverdue,
  profileConfirmed,
  stageOf,
  summarize,
  type JourneyItem,
  type Stage,
  type Summary,
} from "./progress";

/**
 * Loads onboarding state for the welcome flow, the admin board and the nudge
 * job. One member can be on several tracks; their items are the tracks' tasks
 * in assignment order, each remembering which assignment it belongs to.
 */

export const WAIVED_VERB = "onboarding.item_waived";
export const INVITED_VERB = "member.invited";
export const NUDGE_KIND = "onboarding_nudge";

type MemberRow = typeof member.$inferSelect;

export type JourneyAssignment = {
  id: string;
  trackId: string;
  trackName: string;
  assignedAt: Date;
  dueAt: Date | null;
  completedAt: Date | null;
};

export type Journey = {
  member: MemberRow;
  assignments: JourneyAssignment[];
  items: JourneyItem[];
  summary: Summary;
  stage: Stage;
  profileConfirmed: boolean;
  /** Earliest due date among unfinished tracks. */
  dueAt: Date | null;
  overdue: boolean;
  daysUntilDue: number | null;
  /** When every required item was done, if it has been. */
  completedAt: Date | null;
};

async function loadItems(members: MemberRow[]) {
  const ids = members.map((m) => m.id);
  const assignments = ids.length
    ? await db
        .select({
          id: onboardingAssignment.id,
          memberId: onboardingAssignment.memberId,
          trackId: onboardingAssignment.trackId,
          trackName: onboardingTrack.name,
          assignedAt: onboardingAssignment.assignedAt,
          dueAt: onboardingAssignment.dueAt,
          completedAt: onboardingAssignment.completedAt,
        })
        .from(onboardingAssignment)
        .innerJoin(onboardingTrack, eq(onboardingAssignment.trackId, onboardingTrack.id))
        .where(inArray(onboardingAssignment.memberId, ids))
        .orderBy(asc(onboardingAssignment.assignedAt))
    : [];
  if (assignments.length === 0) return { assignments, tasks: [], completions: [], waivers: [] };

  const [tasks, completions, waivers] = await Promise.all([
    db
      .select()
      .from(onboardingTask)
      .where(inArray(onboardingTask.trackId, [...new Set(assignments.map((a) => a.trackId))]))
      .orderBy(asc(onboardingTask.position), asc(onboardingTask.title)),
    db
      .select()
      .from(onboardingCompletion)
      .where(
        inArray(
          onboardingCompletion.assignmentId,
          assignments.map((a) => a.id)
        )
      ),
    // A waiver is a completion an admin made on the member's behalf; the
    // activity log is what tells it apart from a verified tick.
    db
      .select({
        memberId: activity.entityId,
        occurredAt: activity.occurredAt,
        taskId: sql<string | null>`${activity.diff}->'waived'->>'to'`,
      })
      .from(activity)
      .where(and(eq(activity.verb, WAIVED_VERB), inArray(activity.entityId, ids))),
  ]);
  return { assignments, tasks, completions, waivers };
}

function assemble(members: MemberRow[], loaded: Awaited<ReturnType<typeof loadItems>>, now: Date): Journey[] {
  return members.map((m) => {
    const assignments = loaded.assignments.filter((a) => a.memberId === m.id);
    const items: JourneyItem[] = assignments.flatMap((a) =>
      loaded.tasks
        .filter((t) => t.trackId === a.trackId)
        .map((t) => {
          const c = loaded.completions.find((x) => x.assignmentId === a.id && x.taskId === t.id);
          const waived =
            Boolean(c?.verifiedByMemberId) &&
            loaded.waivers.some(
              (w) => w.memberId === m.id && w.taskId === t.id && c && w.occurredAt >= c.completedAt
            );
          return {
            id: t.id,
            assignmentId: a.id,
            title: t.title,
            description: t.description,
            kind: t.kind,
            resourceUrl: t.resourceUrl,
            docId: t.docId,
            required: t.required,
            estimatedMinutes: t.estimatedMinutes,
            completedAt: c?.completedAt ?? null,
            verified: Boolean(c?.verifiedByMemberId) && !waived,
            waived,
          };
        })
    );
    const stage = stageOf(m, items);
    const open = assignments.filter((a) => !a.completedAt && a.dueAt);
    const dueAt =
      open.length > 0
        ? open.reduce((min, a) => (a.dueAt! < min ? a.dueAt! : min), open[0].dueAt!)
        : (assignments.find((a) => a.dueAt)?.dueAt ?? null);
    const finished = assignments.map((a) => a.completedAt).filter((d): d is Date => d != null);
    return {
      member: m,
      assignments: assignments.map(({ memberId: _memberId, ...a }) => a),
      items,
      summary: summarize(items),
      stage,
      profileConfirmed: profileConfirmed(m),
      dueAt,
      overdue: isOverdue(stage, dueAt, now),
      daysUntilDue: stage === "complete" ? null : daysUntilDue(dueAt, now),
      completedAt:
        stage === "complete"
          ? finished.length > 0
            ? finished.reduce((max, d) => (d > max ? d : max))
            : m.onboardedAt
          : null,
    };
  });
}

export async function getJourney(orgId: string, memberId: string, now = new Date()): Promise<Journey | null> {
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.orgId, orgId)))
    .limit(1);
  if (!m) return null;
  return assemble([m], await loadItems([m]), now)[0];
}

export type PipelineEntry = Journey & {
  enrolled: boolean;
  /** Who invited them, from the activity log. */
  invitedBy: { id: string; name: string } | null;
  lastNudgeAt: Date | null;
};

/**
 * Everyone who is, or should be, going through onboarding: current members
 * with a track, plus anyone who hasn't finished the welcome flow.
 */
export async function getPipeline(orgId: string, now = new Date()) {
  const members = await db
    .select()
    .from(member)
    .where(and(eq(member.orgId, orgId), inArray(member.status, ["invited", "active"])))
    .orderBy(asc(member.displayName));
  const ids = members.map((m) => m.id);
  const [loaded, invites, nudges] = await Promise.all([
    loadItems(members),
    ids.length
      ? db
          .select({ memberId: activity.entityId, actorId: activity.actorMemberId })
          .from(activity)
          .where(and(eq(activity.orgId, orgId), eq(activity.verb, INVITED_VERB), inArray(activity.entityId, ids)))
          .orderBy(desc(activity.occurredAt))
      : [],
    db
      .select({
        recipient: notificationLog.recipient,
        sentAt: sql<Date>`max(${notificationLog.sentAt})`.mapWith((v) => new Date(v as string)),
      })
      .from(notificationLog)
      .where(and(eq(notificationLog.orgId, orgId), eq(notificationLog.kind, NUDGE_KIND)))
      .groupBy(notificationLog.recipient),
  ]);
  const byId = new Map(members.map((m) => [m.id, m]));
  const journeys = assemble(members, loaded, now);
  const entries: PipelineEntry[] = journeys.map((j) => {
    const inviterId = invites.find((i) => i.memberId === j.member.id)?.actorId ?? null;
    const inviter = inviterId ? byId.get(inviterId) : undefined;
    return {
      ...j,
      enrolled: j.assignments.length > 0,
      invitedBy: inviter ? { id: inviter.id, name: inviter.displayName } : null,
      lastNudgeAt: nudges.find((n) => n.recipient === j.member.email)?.sentAt ?? null,
    };
  });
  return {
    /** On the board: has a track, or hasn't been through the welcome flow. */
    entries: entries.filter((e) => e.enrolled || !e.member.onboardedAt),
    /** Established members with no track, who could be given one. */
    unenrolled: entries.filter((e) => !e.enrolled && e.member.onboardedAt).map((e) => e.member),
  };
}
