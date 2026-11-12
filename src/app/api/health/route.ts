import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { secretSource } from "@/lib/env";
import journal from "../../../../drizzle/meta/_journal.json";

/**
 * Deployment self-check. Public and safe to share: it reports whether things
 * are configured, never what they are configured to. The welcome page and
 * ADMIN_RUNBOOK.md point here when "is it set up right?" comes up.
 */

export const dynamic = "force-dynamic";

type Check = { ok: boolean; detail: string };

async function checkDatabase(): Promise<{ database: Check; migrations: Check }> {
  if (!process.env.DATABASE_URL) {
    const missing = { ok: false, detail: "DATABASE_URL is not set" };
    return { database: missing, migrations: { ok: false, detail: "No database to check" } };
  }
  try {
    await db.execute(sql`select 1`);
  } catch {
    return {
      database: { ok: false, detail: "Could not reach the database" },
      migrations: { ok: false, detail: "No database to check" },
    };
  }
  const database = { ok: true, detail: "Reachable" };
  const expected = journal.entries.length;
  try {
    const result = await db.execute(
      sql`select count(*)::int as applied from drizzle.__drizzle_migrations`
    );
    const applied = Number((result.rows[0] as { applied: number } | undefined)?.applied ?? 0);
    return {
      database,
      migrations:
        applied >= expected
          ? { ok: true, detail: `${applied} of ${expected} applied` }
          : { ok: false, detail: `${applied} of ${expected} applied — redeploy to apply the rest` },
    };
  } catch {
    // No journal table: the schema was created with `db:push`, or not at all.
    return {
      database,
      migrations: {
        ok: false,
        detail: "No migration record yet — the next deploy creates it (see ADMIN_RUNBOOK.md → Upgrades)",
      },
    };
  }
}

export async function GET() {
  const { database, migrations } = await checkDatabase();
  const production = process.env.NODE_ENV === "production";
  const checks: Record<string, Check> = {
    database,
    migrations,
    auth:
      secretSource() === "env"
        ? { ok: true, detail: "Session secret set" }
        : secretSource() === "derived"
          ? {
              ok: true,
              detail:
                "Session secret derived from the database credentials — set BETTER_AUTH_SECRET to manage it yourself",
            }
          : { ok: !production, detail: "Development secret in use" },
    email: process.env.RESEND_API_KEY
      ? { ok: true, detail: "Resend connected" }
      : { ok: false, detail: "RESEND_API_KEY is not set — emails only print to the server log" },
    schedule: process.env.CRON_SECRET
      ? { ok: true, detail: "Daily run is protected by CRON_SECRET" }
      : { ok: false, detail: "CRON_SECRET is not set — reminders and digests will not run" },
  };
  // Optional extras: reported, but they never make the deployment "unhealthy".
  const optional = {
    ai: Boolean(process.env.ANTHROPIC_API_KEY),
    breakGlassActive: Boolean(process.env.BOOTSTRAP_ADMIN_EMAIL),
  };
  // Only reachability decides the status code: an uptime monitor should not
  // page anyone because the club has not connected email yet.
  const ok = database.ok;
  return NextResponse.json(
    { ok, ready: Object.values(checks).every((c) => c.ok), checks, optional },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } }
  );
}
