import { and, eq, desc, asc, isNull, sql, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  member,
  attendance,
  meeting,
  application,
  memo,
  activity,
  onboardingTrack,
  onboardingTask,
  onboardingAssignment,
  onboardingCompletion,
} from "@/db/schema";

/** Roster with attendance %, applications owned, and onboarding %. */
export async function getRoster(orgId: string) {
  // NB: correlated subqueries — fully qualify columns (see dashboard.ts note).
  return db
    .select({
      id: member.id,
      displayName: member.displayName,
      email: member.email,
      role: member.role,
      status: member.status,
      cohort: member.cohort,
      classYear: member.classYear,
      title: member.title,
      joinedAt: member.joinedAt,
      lastActiveAt: sql<Date | null>`greatest(${member}."last_active_at", (
        select max(${activity}."occurred_at") from ${activity}
        where ${activity}."actor_member_id" = ${member}."id"
      ))`.mapWith((v) => (v ? new Date(v as string) : null)),
      applicationsOwned: sql<number>`(
        select count(*)::int from ${application}
        where ${application}."owner_member_id" = ${member}."id"
          and ${application}."archived_at" is null
      )`,
      memosWritten: sql<number>`(
        select count(*)::int from ${memo}
        where ${memo}."author_member_id" = ${member}."id"
      )`,
      meetingsAttended: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance}."member_id" = ${member}."id"
          and ${attendance}."status" in ('present','remote','late')
      )`,
      meetingsRecorded: sql<number>`(
        select count(*)::int from ${attendance}
        where ${attendance}."member_id" = ${member}."id"
      )`,
      onboardingDone: sql<number>`coalesce((
        select count(*)::int from ${onboardingCompletion} oc
        join ${onboardingAssignment} oa on oc."assignment_id" = oa."id"
        where oa."member_id" = ${member}."id"
      ), 0)`,
      onboardingTotal: sql<number>`coalesce((
        select count(*)::int from ${onboardingTask} ot
        join ${onboardingAssignment} oa2 on ot."track_id" = oa2."track_id"
        where oa2."member_id" = ${member}."id"
      ), 0)`,
    })
    .from(member)
    .where(eq(member.orgId, orgId))
    .orderBy(asc(member.displayName));
}

export async function getMemberProfile(orgId: string, memberId: string) {
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.id, memberId), eq(member.orgId, orgId)))
    .limit(1);
  if (!m) return null;

  const [recentActivity, apps, memos, attendanceRows, onboarding] = await Promise.all([
    db
      .select()
      .from(activity)
      .where(and(eq(activity.orgId, orgId), eq(activity.actorMemberId, memberId)))
      .orderBy(desc(activity.occurredAt))
      .limit(25),
    db
      .select({ id: application.id, status: application.status })
      .from(application)
      .where(and(eq(application.ownerMemberId, memberId), isNull(application.archivedAt))),
    db
      .select({ id: memo.id, title: memo.title, status: memo.status })
      .from(memo)
      .where(eq(memo.authorMemberId, memberId))
      .orderBy(desc(memo.updatedAt)),
    db
      .select({
        status: attendance.status,
        meetingTitle: meeting.title,
        scheduledAt: meeting.scheduledAt,
      })
      .from(attendance)
      .innerJoin(meeting, eq(attendance.meetingId, meeting.id))
      .where(eq(attendance.memberId, memberId))
      .orderBy(desc(meeting.scheduledAt))
      .limit(20),
    getMemberOnboarding(memberId),
  ]);

  return { member: m, recentActivity, apps, memos, attendanceRows, onboarding };
}

export async function getMemberOnboarding(memberId: string) {
  const assignments = await db
    .select({
      assignmentId: onboardingAssignment.id,
      trackId: onboardingAssignment.trackId,
      trackName: onboardingTrack.name,
      completedAt: onboardingAssignment.completedAt,
    })
    .from(onboardingAssignment)
    .innerJoin(onboardingTrack, eq(onboardingAssignment.trackId, onboardingTrack.id))
    .where(eq(onboardingAssignment.memberId, memberId));
  if (assignments.length === 0) return null;
  const a = assignments[0];

  const [tasks, completions] = await Promise.all([
    db
      .select()
      .from(onboardingTask)
      .where(eq(onboardingTask.trackId, a.trackId))
      .orderBy(asc(onboardingTask.position)),
    db
      .select({ taskId: onboardingCompletion.taskId })
      .from(onboardingCompletion)
      .where(eq(onboardingCompletion.assignmentId, a.assignmentId)),
  ]);
  const done = new Set(completions.map((c) => c.taskId));
  return {
    ...a,
    tasks: tasks.map((t) => ({ ...t, done: done.has(t.id) })),
  };
}

/** Every track with its tasks and how many members are on it (admin manager + picker). */
export async function getOnboardingTracks(orgId: string) {
  const tracks = await db
    .select({
      id: onboardingTrack.id,
      name: onboardingTrack.name,
      description: onboardingTrack.description,
      isDefault: onboardingTrack.isDefault,
      archivedAt: onboardingTrack.archivedAt,
      assignedCount: sql<number>`(
        select count(*)::int from ${onboardingAssignment}
        join ${member} on ${member}."id" = ${onboardingAssignment}."member_id"
        where ${onboardingAssignment}."track_id" = ${onboardingTrack}."id"
          and ${member}."status" in ('invited','active')
      )`,
    })
    .from(onboardingTrack)
    .where(eq(onboardingTrack.orgId, orgId))
    .orderBy(desc(onboardingTrack.isDefault), asc(onboardingTrack.name));
  if (tracks.length === 0) return [];
  const tasks = await db
    .select()
    .from(onboardingTask)
    .where(
      inArray(
        onboardingTask.trackId,
        tracks.map((t) => t.id)
      )
    )
    .orderBy(asc(onboardingTask.position), asc(onboardingTask.title));
  return tracks.map((t) => ({ ...t, tasks: tasks.filter((k) => k.trackId === t.id) }));
}

/** Members × tasks matrix for /onboarding, least-complete members first. */
export async function getOnboardingMatrix(orgId: string, trackId?: string) {
  const [track] = await db
    .select()
    .from(onboardingTrack)
    .where(
      and(
        eq(onboardingTrack.orgId, orgId),
        trackId ? eq(onboardingTrack.id, trackId) : eq(onboardingTrack.isDefault, true),
        isNull(onboardingTrack.archivedAt)
      )
    )
    .limit(1);
  if (!track) return null;

  const tasks = await db
    .select()
    .from(onboardingTask)
    .where(eq(onboardingTask.trackId, track.id))
    .orderBy(asc(onboardingTask.position), asc(onboardingTask.title));
  const assignments = await db
    .select({
      assignmentId: onboardingAssignment.id,
      memberId: member.id,
      memberName: member.displayName,
      memberStatus: member.status,
      completedAt: onboardingAssignment.completedAt,
    })
    .from(onboardingAssignment)
    .innerJoin(member, eq(onboardingAssignment.memberId, member.id))
    .where(
      and(
        eq(onboardingAssignment.trackId, track.id),
        eq(member.orgId, orgId),
        inArray(member.status, ["invited", "active"])
      )
    );

  const completionRows = assignments.length
    ? await db
        .select({
          assignmentId: onboardingCompletion.assignmentId,
          taskId: onboardingCompletion.taskId,
        })
        .from(onboardingCompletion)
        .where(
          inArray(
            onboardingCompletion.assignmentId,
            assignments.map((a) => a.assignmentId)
          )
        )
    : [];
  const doneByAssignment = new Map<string, Set<string>>();
  for (const c of completionRows) {
    if (!doneByAssignment.has(c.assignmentId)) doneByAssignment.set(c.assignmentId, new Set());
    doneByAssignment.get(c.assignmentId)!.add(c.taskId);
  }

  const rows = assignments
    .map((a) => ({
      ...a,
      done: doneByAssignment.get(a.assignmentId) ?? new Set<string>(),
    }))
    .sort((a, b) => a.done.size - b.done.size || a.memberName.localeCompare(b.memberName));

  return { track, tasks, rows };
}
