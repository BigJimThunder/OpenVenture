import pg from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import * as schema from "../../src/db/schema";
import { neonShim } from "./neon-shim";

const url = process.env.TEST_DATABASE_URL!;
export const driver = process.env.OV_TEST_DRIVER === "neon" ? "neon" : "pg";
export const pool = new pg.Pool({ connectionString: url, max: 12 });

/** The handle the app's own code receives as `db` (see setup.ts). */
export const testDb =
  driver === "neon"
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      drizzleNeon(neonShim(pool) as any, { schema })
    : (drizzlePg(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>);

/** Empty every table. */
export async function resetDatabase() {
  const { rows } = await pool.query(
    `select tablename from pg_tables where schemaname = 'public'`
  );
  if (rows.length === 0) return;
  await pool.query(
    `truncate table ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`
  );
}
