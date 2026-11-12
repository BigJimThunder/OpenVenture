import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { notificationLog } from "@/db/schema";
import { intakeSchema, loadSoleOrg, receiveApplication } from "@/lib/intake";
import { demoMode } from "@/lib/demo";

/**
 * Write-only application intake for clubs that already have a form on their
 * own website (the hosted alternative is /apply). Auth: HMAC-SHA256 with the
 * org's ingest secret, sent as `x-openventure-signature: sha256=<hex>`.
 *
 * Two ways to sign, and the second is the one to use:
 *   - the raw body alone (the original scheme, still accepted);
 *   - `<unix seconds>.<raw body>`, with the same seconds in
 *     `x-openventure-timestamp`. A captured request then stops working after
 *     five minutes instead of forever.
 * With `x-openventure-delivery: <any unique id>` a delivery that arrives
 * twice (a retry, a replay) creates one application, not two.
 *
 * What happens after validation — owner rotation, duplicate check, the
 * "we received it" email, the Slack ping — is shared with the hosted form in
 * src/lib/intake.ts.
 */

const MAX_SKEW_SECONDS = 5 * 60;

function verifySignature(raw: string, header: string | null, secret: string) {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const provided = header.replace(/^sha256=/, "").trim();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Single-org deployment: the one org row holds the secret.
  const org = await loadSoleOrg();
  if (!org?.ingestSecret) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }
  if (demoMode(org)) return NextResponse.json({ error: "This deployment is a read-only demo" }, { status: 403 });

  const signature = req.headers.get("x-openventure-signature");
  const timestamp = req.headers.get("x-openventure-timestamp");
  if (timestamp !== null) {
    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > MAX_SKEW_SECONDS) {
      return NextResponse.json({ error: "Timestamp is missing or too old" }, { status: 401 });
    }
    if (!verifySignature(`${timestamp}.${raw}`, signature, org.ingestSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else if (!verifySignature(raw, signature, org.ingestSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = intakeSchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  // Claimed only for a signed, valid payload, so a rejected delivery can be
  // corrected and sent again under the same id. A repeat answers 200
  // without creating anything.
  const delivery = req.headers.get("x-openventure-delivery")?.trim().slice(0, 120);
  if (delivery) {
    const claimed = await db
      .insert(notificationLog)
      .values({ orgId: org.id, kind: "ingest_delivery", key: delivery })
      .onConflictDoNothing()
      .returning({ id: notificationLog.id });
    if (claimed.length === 0) return NextResponse.json({ ok: true, duplicate: true });
  }

  const result = await receiveApplication(org, parsed.data, "webhook");
  if (!result.ok) {
    return NextResponse.json({ error: "No entry stage configured" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, applicationId: result.applicationId }, { status: 201 });
}
