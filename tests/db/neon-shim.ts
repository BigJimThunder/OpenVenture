import pg from "pg";

/**
 * A stand-in for the Neon HTTP client (`neon(url)`), backed by node-postgres.
 *
 * Production talks to Postgres through drizzle's neon-http driver, which has
 * no interactive transactions: units of work go through `db.batch()`, which
 * the Neon client runs as one transaction per HTTP request. None of that code
 * runs under node-postgres, so without this shim the production write path
 * would never be exercised by a test.
 *
 * The shim replaces only the network hop. drizzle's own neon-http session
 * (statement building, batching, result mapping) runs for real, and `batch`
 * is one BEGIN…COMMIT on a single connection, as on Neon.
 */

// drizzle's neon-http driver asks for these as raw strings and parses them itself.
const RAW_OIDS = new Set([1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182]);
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (RAW_OIDS.has(oid)) return (value: string) => value;
    return pg.types.getTypeParser(oid, format as "text");
  },
};

type Opts = { arrayMode?: boolean; fullResults?: boolean };
type Pending = { sql: string; params: unknown[]; opts: Opts };
type Runner = { query: (config: pg.QueryConfig | pg.QueryArrayConfig) => Promise<pg.QueryResult | pg.QueryArrayResult> };

function run(on: Runner, q: Pending, defaults: Opts = {}) {
  const arrayMode = q.opts.arrayMode ?? defaults.arrayMode ?? false;
  const config = { text: q.sql, values: q.params, types, ...(arrayMode ? { rowMode: "array" as const } : {}) };
  return on.query(config).then((result) => ({
    rows: result.rows,
    fields: result.fields,
    rowCount: result.rowCount,
    command: result.command,
    rowAsArray: arrayMode,
  }));
}

export function neonShim(pool: pg.Pool) {
  const client = (sql: string, params: unknown[] = [], opts: Opts = {}) => {
    const pending: Pending = { sql, params, opts };
    let started: Promise<unknown> | undefined;
    const start = () => (started ??= run(pool, pending));
    return {
      __pending: pending,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => start().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => start().catch(reject),
    };
  };
  client.transaction = async (queries: { __pending: Pending }[], opts: Opts = {}) => {
    const connection = await pool.connect();
    try {
      await connection.query("begin");
      const results = [];
      for (const q of queries) results.push(await run(connection, q.__pending, opts));
      await connection.query("commit");
      return results;
    } catch (e) {
      await connection.query("rollback").catch(() => {});
      throw e;
    } finally {
      connection.release();
    }
  };
  return client;
}
