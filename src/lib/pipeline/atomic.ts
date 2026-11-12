import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

type Db = typeof db;
type Statement = PromiseLike<unknown>;

/**
 * Run a fixed list of writes as one unit.
 *
 * The app runs on two drivers (see src/db/index.ts): Neon HTTP in production,
 * which has no interactive transactions but commits a `batch` atomically, and
 * node-postgres locally, which has real transactions but no `batch`. `build`
 * receives the handle to build statements on and must only BUILD them (no
 * awaits, no reads) — do every read and validation before calling this.
 *
 * Returns each statement's result, in order.
 *
 * Reads done before the unit are a snapshot that another request may have
 * invalidated by the time the writes run. When a unit's correctness depends
 * on such a read (money, a one-time decision), put `lock` and `guard`
 * statements at the front: the lock makes competing units take turns, and the
 * guards re-check the facts inside the unit, aborting all of it if they no
 * longer hold.
 */
export async function atomic(build: (q: Db) => Statement[]): Promise<unknown[]> {
  const batch = (db as unknown as { batch?: (statements: Statement[]) => Promise<unknown[]> }).batch;
  if (typeof batch === "function") {
    const statements = build(db);
    if (statements.length === 0) return [];
    return batch.call(db, statements);
  }
  return db.transaction(async (tx) => {
    const results: unknown[] = [];
    for (const statement of build(tx as unknown as Db)) results.push(await statement);
    return results;
  });
}

/**
 * Take turns on a key until this unit commits or rolls back. Units that lock
 * the same key run one after another; each then sees what the previous one
 * committed. Take at most one lock per unit (two could deadlock).
 */
export function lock(q: Db, scope: string, id: string): Statement {
  return q.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`ov:${scope}:${id}`}, 0))`);
}

const GUARD_PREFIX = "ov_guard:";

/**
 * Abort the whole unit unless `condition` is true (false and NULL both
 * abort). `code` comes back from `guardFailure` so the caller can say what
 * changed.
 *
 * Postgres has no ASSERT outside PL/pgSQL, and a helper function would have
 * to exist in every database (including ones made with `db:push`). So the
 * guard is a cast that only fails when the condition does: the code is cast
 * to an integer, which raises with the code in the message. `random()` keeps
 * the planner from evaluating the failing branch ahead of time.
 */
export function guard(q: Db, condition: SQL, code: string): Statement {
  return q.execute(
    sql`select (case when (${condition}) then '1' else ${GUARD_PREFIX + code} || left(random()::text, 0) end)::int as ok`
  );
}

/** The `code` of the guard that aborted a unit, or null for any other error. */
export function guardFailure(error: unknown): string | null {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string") {
      const match = message.match(/ov_guard:([a-z0-9_]+)/);
      if (match) return match[1];
    }
    e = (e as { cause?: unknown }).cause;
  }
  return null;
}

/** Postgres unique-violation, whichever driver (and wrapper) threw it. */
export function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error, depth = 0; e && depth < 5; depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}
