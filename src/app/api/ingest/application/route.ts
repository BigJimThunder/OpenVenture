import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { intakeSchema, loadSoleOrg, receiveApplication } from "@/lib/intake";

/**
 * Write-only application intake for clubs that already have a form on their
 * own website (the hosted alternative is /apply). Auth: HMAC-SHA256 of the raw
 * body with the org's ingest secret, sent as
 * `x-openventure-signature: sha256=<hex>`.
 *
 * What happens after validation — owner rotation, duplicate check, the
 * "we received it" email, the Slack ping — is shared with the hosted form in
 * src/lib/intake.ts.
 */

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

  if (!verifySignature(raw, req.headers.get("x-openventure-signature"), org.ingestSecret)) {
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

  const result = await receiveApplication(org, parsed.data, "webhook");
  if (!result.ok) {
    return NextResponse.json({ error: "No entry stage configured" }, { status: 503 });
  }
  return NextResponse.json({ ok: true, applicationId: result.applicationId }, { status: 201 });
}
