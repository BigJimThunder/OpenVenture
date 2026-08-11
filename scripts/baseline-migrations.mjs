/**
 * Baseline an existing database into drizzle's migration journal.
 *
 * A database created with `drizzle-kit push` has the tables but no record in
 * drizzle.__drizzle_migrations, so `drizzle-kit migrate` tries to replay 0000
 * and dies on "relation already exists". This marks the migrations whose
 * schema is already present as applied, without running them, so `migrate`
 * picks up cleanly from the first one that genuinely hasn't run.
 *
 * Usage:  DATABASE_URL_DIRECT=… node scripts/baseline-migrations.mjs [--apply]
 * Without --apply it only reports what it would do.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) { console.error("Set DATABASE_URL_DIRECT."); process.exit(1); }

// Only 0000 is baselined: it is the one whose schema `push` already created.
// Everything after it must actually run, so it is deliberately not recorded.
const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
const first = journal.entries.find((e) => e.idx === 0);
const sql = readFileSync(join(root, `drizzle/${first.tag}.sql`), "utf8");
const hash = createHash("sha256").update(sql).digest("hex");

const c = new pg.Client({ connectionString: url });
await c.connect();

const { rows: existing } = await c.query(
  `select 1 from information_schema.tables
   where table_schema = 'drizzle' and table_name = '__drizzle_migrations'`
);
const recorded = existing.length
  ? (await c.query(`select hash from drizzle.__drizzle_migrations`)).rows.map((r) => r.hash)
  : [];

if (recorded.includes(hash)) {
  console.log(`${first.tag} is already recorded — nothing to do.`);
  await c.end();
  process.exit(0);
}
if (recorded.length) {
  console.log(`Journal already has ${recorded.length} entr(ies) but not ${first.tag}.`);
  console.log("Stopping: this is not the plain push-created case. Ask before proceeding.");
  await c.end();
  process.exit(1);
}

console.log(`will record ${first.tag} as applied (sha256 ${hash.slice(0, 12)}…)`);
if (!apply) {
  console.log("\nDry run. Re-run with --apply to write it.");
  await c.end();
  process.exit(0);
}

await c.query(`create schema if not exists drizzle`);
await c.query(`create table if not exists drizzle.__drizzle_migrations (
  id serial primary key, hash text not null, created_at bigint)`);
await c.query(`insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)`, [
  hash,
  first.when,
]);
console.log("done — now run: pnpm db:migrate");
await c.end();
