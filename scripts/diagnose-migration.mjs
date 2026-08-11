// Read-only migration diagnostic. Changes nothing.
import pg from "pg";

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL_DIRECT first."); process.exit(1); }

const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
  console.log("connection: OK");
} catch (e) {
  console.log("connection: FAILED —", e.message);
  console.log("\n→ This is a connection/SSL problem, not a SQL one.");
  process.exit(0);
}

const q = async (sql, ...a) => (await client.query(sql, a)).rows;

const journal = await q(`select exists (select 1 from information_schema.tables
  where table_schema='drizzle' and table_name='__drizzle_migrations') as t`);
if (journal[0].t) {
  const rows = await q(`select hash, created_at from drizzle.__drizzle_migrations order by created_at`);
  console.log(`migrations drizzle thinks are applied: ${rows.length}`);
  for (const r of rows) console.log(`  ${new Date(Number(r.created_at)).toISOString()}  ${r.hash.slice(0, 12)}…`);
} else {
  console.log("migrations drizzle thinks are applied: 0 (no journal table yet)");
}

const cols = await q(`select table_name, column_name from information_schema.columns
  where column_name in ('ref','priority')
    and table_name in ('application','memo','meeting','action_item')
  order by table_name, column_name`);
console.log(`\nnew columns already present: ${cols.length ? "" : "none"}`);
for (const c of cols) console.log(`  ${c.table_name}.${c.column_name}`);

const counts = await q(`select
  (select count(*) from application) as applications,
  (select count(*) from memo) as memos,
  (select count(*) from meeting) as meetings,
  (select count(*) from action_item) as action_items`);
console.log("\nrow counts:", counts[0]);

if (cols.length && journal[0].t) {
  const n = (await q(`select count(*)::int c from drizzle.__drizzle_migrations`))[0].c;
  if (n < 2 && cols.length > 0) {
    console.log("\n→ The columns exist but drizzle has not recorded 0001 as applied.");
    console.log("  Re-running db:migrate will fail with \"column already exists\".");
  }
}
await client.end();
