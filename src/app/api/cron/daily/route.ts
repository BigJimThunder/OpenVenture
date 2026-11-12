import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getCtx } from "@/lib/actions/context";
import { runDaily } from "@/lib/automation/run";

/**
 * The daily scheduled run: closes votes at their deadline, sends vote and SLA
 * reminders, the Monday digest and quarterly check-in nudges.
 *
 *   GET  — for schedulers. Vercel Cron sends `Authorization: Bearer
 *          $CRON_SECRET` on its own; any other cron does the same with curl
 *          (ADMIN_RUNBOOK.md → Scheduling).
 *   POST — "Run now" for a signed-in admin.
 *
 * Every send is deduplicated, so calling this twice in a day is harmless.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function bearerMatches(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(header ?? "");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Without a secret this would be an open "send email" button on the internet.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "CRON_SECRET is not set. Add it to the environment and redeploy." },
        { status: 503 }
      );
    }
  } else if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // 500 when any job failed, so the scheduler's own log shows a red run
  // instead of a green one with the failure buried in the body.
  const report = await runDaily(new Date(), "schedule");
  return NextResponse.json(report, { status: report.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  // Route handlers get no built-in CSRF check; refuse cross-site posts.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (ctx.member.role !== "admin") {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  return NextResponse.json(await runDaily(new Date(), "admin"));
}
