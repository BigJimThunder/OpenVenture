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
 */
export async function atomic(build: (q: Db) => Statement[]): Promise<void> {
  const batch = (db as unknown as { batch?: (statements: Statement[]) => Promise<unknown> }).batch;
  if (typeof batch === "function") {
    const statements = build(db);
    if (statements.length > 0) await batch.call(db, statements);
    return;
  }
  await db.transaction(async (tx) => {
    for (const statement of build(tx as unknown as Db)) await statement;
  });
}
