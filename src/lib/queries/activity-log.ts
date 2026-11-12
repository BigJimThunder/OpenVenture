import { and, desc, eq, ilike, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { activity, member } from "@/db/schema";

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityFilter = {
  /** Entity type, e.g. "grant". */
  type?: string;
  /** Acting member's id, or "system" for anything no member did. */
  actor?: string;
  /** Text in the summary. */
  q?: string;
  /** Show entries strictly older than this. */
  before?: Date;
};

export type ActivityEntry = {
  id: string;
  occurredAt: Date;
  actorName: string | null;
  actorType: "member" | "system" | "integration";
  verb: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  summary: string;
  diff: Record<string, { from: unknown; to: unknown }> | null;
};

/**
 * The club's whole activity log, newest first, one page at a time. Paged by
 * time rather than offset, so a busy log never repeats or skips an entry.
 */
export async function getActivityLog(
  orgId: string,
  filter: ActivityFilter
): Promise<{ entries: ActivityEntry[]; nextBefore: Date | null }> {
  const where = and(
    eq(activity.orgId, orgId),
    filter.type ? eq(activity.entityType, filter.type) : undefined,
    filter.actor === "system"
      ? sql`${activity.actorMemberId} is null`
      : filter.actor
        ? eq(activity.actorMemberId, filter.actor)
        : undefined,
    filter.q ? ilike(activity.summary, `%${filter.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
    filter.before ? lt(activity.occurredAt, filter.before) : undefined
  );
  const rows = await db
    .select({
      id: activity.id,
      occurredAt: activity.occurredAt,
      actorName: member.displayName,
      actorType: activity.actorType,
      verb: activity.verb,
      entityType: activity.entityType,
      entityId: activity.entityId,
      entityLabel: activity.entityLabel,
      summary: activity.summary,
      diff: activity.diff,
    })
    .from(activity)
    .leftJoin(member, eq(activity.actorMemberId, member.id))
    .where(where)
    .orderBy(desc(activity.occurredAt), desc(activity.id))
    .limit(ACTIVITY_PAGE_SIZE + 1);
  const entries = rows.slice(0, ACTIVITY_PAGE_SIZE);
  return {
    entries,
    nextBefore: rows.length > ACTIVITY_PAGE_SIZE ? entries[entries.length - 1].occurredAt : null,
  };
}

/** What can be filtered on: the entity types present, and who has acted. */
export async function getActivityFacets(orgId: string) {
  const [types, actors] = await Promise.all([
    db
      .select({ type: activity.entityType, n: sql<number>`count(*)::int` })
      .from(activity)
      .where(eq(activity.orgId, orgId))
      .groupBy(activity.entityType)
      .orderBy(desc(sql`count(*)`)),
    db
      .selectDistinct({ id: member.id, name: member.displayName })
      .from(activity)
      .innerJoin(member, eq(activity.actorMemberId, member.id))
      .where(eq(activity.orgId, orgId))
      .orderBy(member.displayName),
  ]);
  return { types, actors };
}
