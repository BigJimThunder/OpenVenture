/**
 * The one migration runner. `pnpm build` calls it before `next build`, so a
 * deploy applies its own schema changes — nobody needs a terminal.
 *
 * The SQL files in drizzle/ are the source of truth. For each one, in order:
 *
 *   recorded in drizzle.__drizzle_migrations     → skip
 *   everything it creates already exists         → record it, don't run it
 *                                                  (a database made with
 *                                                  `drizzle-kit push`)
 *   nothing it creates exists                    → run it and record it
 *   some of it exists                            → stop and say exactly what
 *
 * Everything happens in a single transaction behind an advisory lock, so two
 * builds racing each other are safe and a failure changes nothing. Queries
 * are plain text (no prepared statements), so this works through Neon's
 * pooled endpoint as well as a direct connection.
 *
 * Usage:
 *   node scripts/migrate.mjs            apply pending migrations
 *   node scripts/migrate.mjs --status   report only, change nothing
 *
 * Environment:
 *   DATABASE_URL_DIRECT | DATABASE_URL_UNPOOLED | POSTGRES_URL_NON_POOLING |
 *   DATABASE_URL | POSTGRES_URL          first one set wins
 *   SKIP_DB_MIGRATE=1                    build without touching the database
 *   MIGRATE_PREVIEW=1                    also migrate on Vercel preview builds
 *
 * Vercel preview builds (pull requests, branches) do NOT migrate by default:
 * a preview usually shares the production database, and unmerged SQL must
 * never reach it. If your previews have their own database (Neon branching),
 * set MIGRATE_PREVIEW=1 for the Preview environment.
 *
 * Records are written the way drizzle-kit writes them, so `drizzle-kit
 * migrate` and this script agree about what has been applied.
 */
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const statusOnly = process.argv.includes("--status");
const log = (msg) => console.log(`[migrate] ${msg}`);

const URL_VARS = [
  "DATABASE_URL_DIRECT",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL",
  "POSTGRES_URL",
];
const urlVar = URL_VARS.find((name) => process.env[name]);

if (process.env.SKIP_DB_MIGRATE === "1" && !statusOnly) {
  log("SKIP_DB_MIGRATE=1 — leaving the database alone.");
  process.exit(0);
}
if (process.env.VERCEL_ENV === "preview" && process.env.MIGRATE_PREVIEW !== "1" && !statusOnly) {
  log(
    "Preview build — not migrating, so unmerged schema changes cannot reach a shared database."
  );
  log("If this preview has its own database, set MIGRATE_PREVIEW=1 for the Preview environment.");
  process.exit(0);
}
if (!urlVar) {
  if (process.env.VERCEL === "1" && !statusOnly) {
    console.error(
      [
        "[migrate] No database is connected to this project.",
        "  In Vercel: Storage → Create Database → Neon (free), connect it to this",
        "  project for all environments, then redeploy. That sets DATABASE_URL.",
      ].join("\n")
    );
    process.exit(1);
  }
  log("No DATABASE_URL set — skipping migrations (fine for CI and local builds).");
  process.exit(0);
}

// ——— the migrations on disk ———

const journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
const migrations = [...journal.entries]
  .sort((a, b) => a.idx - b.idx)
  .map((entry) => {
    const sql = readFileSync(join(root, `drizzle/${entry.tag}.sql`), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      tag: entry.tag,
      when: entry.when,
      hash: createHash("sha256").update(sql).digest("hex"),
      statements,
      creates: findCreatedObjects(statements),
    };
  });

/** The tables, columns and indexes a migration adds — what "already applied" looks like. */
function findCreatedObjects(statements) {
  const objects = [];
  for (const raw of statements) {
    // Leading comment lines would hide the statement keyword.
    const s = raw.replace(/^\s*--.*$/gm, "").trim();
    let m;
    if ((m = /^CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"/i.exec(s))) {
      objects.push({ kind: "table", table: m[1], label: `table ${m[1]}` });
    } else if ((m = /^ALTER TABLE "([^"]+)" ADD COLUMN (?:IF NOT EXISTS )?"([^"]+)"/i.exec(s))) {
      objects.push({ kind: "column", table: m[1], column: m[2], label: `column ${m[1]}.${m[2]}` });
    } else if ((m = /^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)"/i.exec(s))) {
      objects.push({ kind: "index", index: m[1], label: `index ${m[1]}` });
    }
  }
  return objects;
}

// ——— connect ———

async function connect() {
  let lastError;
  // A free-tier database that has scaled to zero can refuse the first knock.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const client = new pg.Client({ connectionString: process.env[urlVar] });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastError = e;
      await client.end().catch(() => {});
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  console.error(`[migrate] Could not connect using ${urlVar}: ${lastError.message}`);
  console.error("  Check the connection string (and that it ends with ?sslmode=require for hosted Postgres).");
  process.exit(1);
}

const client = await connect();
const q = async (text) => (await client.query(text)).rows;
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;

async function exists(object) {
  if (object.kind === "table") {
    return (
      await q(`select 1 from information_schema.tables
        where table_schema = 'public' and table_name = ${lit(object.table)}`)
    ).length > 0;
  }
  if (object.kind === "column") {
    return (
      await q(`select 1 from information_schema.columns
        where table_schema = 'public' and table_name = ${lit(object.table)}
          and column_name = ${lit(object.column)}`)
    ).length > 0;
  }
  return (
    await q(`select 1 from pg_indexes
      where schemaname = 'public' and indexname = ${lit(object.index)}`)
  ).length > 0;
}

async function recordedHashes() {
  const [{ present }] = await q(`select to_regclass('drizzle.__drizzle_migrations') is not null as present`);
  if (!present) return new Set();
  return new Set((await q(`select hash from drizzle.__drizzle_migrations`)).map((r) => r.hash));
}

/** Decide what to do with one migration given the database as it is right now. */
async function plan(migration, recorded) {
  if (recorded.has(migration.hash)) return { action: "skip" };
  const found = [];
  const missing = [];
  for (const object of migration.creates) {
    ((await exists(object)) ? found : missing).push(object.label);
  }
  if (found.length === 0) return { action: "run" };
  if (missing.length === 0) return { action: "baseline" };
  return { action: "conflict", found, missing };
}

function explainConflict(migration, found, missing) {
  return [
    `[migrate] ${migration.tag} is half-applied, so it is not safe to run or to skip.`,
    `  already there: ${found.join(", ")}`,
    `  missing:       ${missing.join(", ")}`,
    "  This happens when the schema was changed by hand or with an older `db:push`.",
    "  Fix: run `pnpm db:push` once against this database to bring it fully up to",
    "  date, then deploy again — the migration will be recorded instead of re-run.",
    "  Nothing was changed.",
  ].join("\n");
}

// ——— status ———

if (statusOnly) {
  const recorded = await recordedHashes();
  let pending = 0;
  for (const m of migrations) {
    const p = await plan(m, recorded);
    if (p.action !== "skip") pending++;
    const label = {
      skip: "applied",
      run: "pending",
      baseline: "present but not recorded (will be recorded, not re-run)",
      conflict: "HALF-APPLIED — needs attention",
    }[p.action];
    log(`${m.tag}: ${label}`);
    if (p.action === "conflict") console.log(explainConflict(m, p.found, p.missing));
  }
  log(pending ? `${pending} of ${migrations.length} need action.` : "Up to date.");
  await client.end();
  process.exit(0);
}

// ——— apply ———

let failing = null;
try {
  await q("begin");
  // Serialises concurrent builds; released automatically at commit/rollback.
  await q("select pg_advisory_xact_lock(7166250418)");
  await q("create schema if not exists drizzle");
  await q(`create table if not exists drizzle.__drizzle_migrations (
    id serial primary key, hash text not null, created_at bigint)`);

  const recorded = await recordedHashes();
  let applied = 0;
  let baselined = 0;
  for (const m of migrations) {
    const p = await plan(m, recorded);
    if (p.action === "skip") continue;
    if (p.action === "conflict") {
      await q("rollback");
      console.error(explainConflict(m, p.found, p.missing));
      await client.end();
      process.exit(1);
    }
    if (p.action === "run") {
      for (const statement of m.statements) {
        failing = { tag: m.tag, statement };
        await q(statement);
      }
      failing = null;
      applied++;
      log(`applied ${m.tag}`);
    } else {
      baselined++;
      log(`${m.tag} is already in the schema — recorded without re-running`);
    }
    await q(
      `insert into drizzle.__drizzle_migrations (hash, created_at) values (${lit(m.hash)}, ${Number(m.when)})`
    );
  }
  await q("commit");
  log(
    applied || baselined
      ? `Done: ${applied} applied, ${baselined} recorded. Database is up to date.`
      : "Database is up to date."
  );
} catch (e) {
  await q("rollback").catch(() => {});
  console.error(`[migrate] Failed — rolled back, the database is unchanged.`);
  console.error(`  ${e.message}`);
  if (failing) {
    console.error(`  in ${failing.tag}:\n    ${failing.statement.split("\n").join("\n    ")}`);
  }
  await client.end().catch(() => {});
  process.exit(1);
}
await client.end();
