import { sql, eq, type SQL } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";

/**
 * Allocating the next per-org `ref`. Split from `refs.ts` because that module
 * is imported by client components for formatting — importing `db` here would
 * otherwise pull the Postgres driver into the browser bundle.
 */

/**
 * Next free ref for an org: `max(ref) + 1`.
 *
 * Two concurrent inserts can both read the same max under READ COMMITTED, so
 * this is not a substitute for the unique index — it's the fast path. The
 * index is what actually guarantees uniqueness, and `withRef` below retries
 * when it fires. At this app's scale (one club, <15 members) a collision is
 * rare enough that a counter table or per-org sequence would cost more than
 * it buys.
 */
export async function nextRef(
  table: PgTable,
  orgIdColumn: PgColumn,
  refColumn: PgColumn,
  orgId: string
): Promise<number> {
  const [row] = await db
    .select({ next: sql<number>`coalesce(max(${refColumn}), 0) + 1` })
    .from(table)
    .where(eq(orgIdColumn, orgId) as SQL);
  return row?.next ?? 1;
}

/** Postgres unique-violation. */
function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505"
  );
}

/**
 * Run an insert that needs a fresh ref, retrying if another writer claimed the
 * same number first. `insert` receives the ref to use and performs the write.
 */
export async function withRef<T>(
  table: PgTable,
  orgIdColumn: PgColumn,
  refColumn: PgColumn,
  orgId: string,
  insert: (ref: number) => Promise<T>,
  attempts = 5
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const ref = await nextRef(table, orgIdColumn, refColumn, orgId);
    try {
      return await insert(ref);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
