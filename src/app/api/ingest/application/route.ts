import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  organization,
  company,
  application,
  applicationDemographics,
  pipelineStage,
  stageHistory,
  activity,
} from "@/db/schema";

/**
 * Write-only application intake. The club's existing website form POSTs here —
 * no founder-facing UI exists or is implied. Auth: HMAC-SHA256 of the raw body
 * with the org's ingest secret, sent as `x-openventure-signature: sha256=<hex>`.
 *
 * Replaces the website → Airtable → Slack hop: the application lands in the
 * entry stage instantly and (optionally) pings the club's Slack webhook.
 */

const IngestSchema = z.object({
  companyName: z.string().min(1).max(120),
  website: z.string().max(200).optional(),
  pitchSummary: z.string().max(5000).optional(),
  amountRequested: z.coerce.number().min(0).max(1_000_000).optional(),
  useOfFunds: z.string().max(5000).optional(),

  applicantName: z.string().max(120).optional(),
  applicantEmail: z.string().email().optional(),

  // Academic / team analytics fields (low-sensitivity, displayable)
  department: z.string().max(120).optional(),
  major: z.string().max(120).optional(),
  school: z.string().max(120).optional(),
  classYear: z.coerce.number().int().min(2000).max(2100).optional(),
  teamSize: z.coerce.number().int().min(1).max(50).optional(),
  teamComposition: z.enum(["solo", "cofounded"]).optional(),
  teamStudentMix: z.enum(["all_students", "mixed", "non_students"]).optional(),
  campusSource: z.string().max(200).optional(),
  howHeard: z.string().max(500).optional(),

  // Optional self-reported demographics — write-once, aggregate-read only.
  demographics: z
    .object({
      gender: z.string().max(60).optional(),
      raceEthnicity: z.string().max(120).optional(),
      firstGeneration: z.boolean().optional(),
      international: z.boolean().optional(),
    })
    .optional(),
});

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
  const [org] = await db.select().from(organization).limit(1);
  if (!org?.ingestSecret) {
    return NextResponse.json({ error: "Ingest not configured" }, { status: 503 });
  }

  if (!verifySignature(raw, req.headers.get("x-openventure-signature"), org.ingestSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let parsed;
  try {
    parsed = IngestSchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const input = parsed.data;

  const [entry] = await db
    .select()
    .from(pipelineStage)
    .where(
      and(
        eq(pipelineStage.orgId, org.id),
        eq(pipelineStage.isEntryStage, true),
        isNull(pipelineStage.archivedAt)
      )
    )
    .limit(1);
  if (!entry) {
    return NextResponse.json({ error: "No entry stage configured" }, { status: 503 });
  }

  const domain = input.website
    ?.trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];

  // Reuse an existing company on domain match; otherwise create.
  let companyId: string | null = null;
  if (domain) {
    const existing = await db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.orgId, org.id), eq(company.domain, domain)))
      .limit(1);
    companyId = existing[0]?.id ?? null;
  }
  if (!companyId) {
    const [co] = await db
      .insert(company)
      .values({
        orgId: org.id,
        name: input.companyName,
        domain: domain || null,
        websiteUrl: domain ? `https://${domain}` : null,
        oneLiner: input.pitchSummary?.slice(0, 200),
      })
      .returning();
    companyId = co.id;
  }

  const [app] = await db
    .insert(application)
    .values({
      orgId: org.id,
      companyId,
      stageId: entry.id,
      pitchSummary: input.pitchSummary,
      amountRequested: input.amountRequested != null ? String(input.amountRequested) : null,
      useOfFundsNarrative: input.useOfFunds,
      applicantName: input.applicantName,
      applicantEmail: input.applicantEmail,
      department: input.department,
      major: input.major,
      school: input.school,
      classYear: input.classYear,
      teamSize: input.teamSize,
      teamComposition: input.teamComposition,
      teamStudentMix: input.teamStudentMix,
      campusSource: input.campusSource,
      howHeard: input.howHeard,
    })
    .returning();

  await db.insert(stageHistory).values({
    orgId: org.id,
    applicationId: app.id,
    toStageId: entry.id,
  });

  if (input.demographics && Object.values(input.demographics).some((v) => v != null)) {
    await db.insert(applicationDemographics).values({
      orgId: org.id,
      applicationId: app.id,
      gender: input.demographics.gender,
      raceEthnicity: input.demographics.raceEthnicity,
      firstGeneration: input.demographics.firstGeneration,
      international: input.demographics.international,
    });
  }

  await db.insert(activity).values({
    orgId: org.id,
    actorType: "integration",
    verb: "application.received",
    entityType: "application",
    entityId: app.id,
    entityLabel: input.companyName,
    summary: `New application: ${input.companyName}${
      input.amountRequested ? ` asking $${input.amountRequested.toLocaleString()}` : ""
    }`,
  });

  // Slack ping — best-effort, never blocks the response.
  if (org.slackWebhookUrl) {
    const base = process.env.BETTER_AUTH_URL ?? "";
    fetch(org.slackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `🆕 New application: *${input.companyName}*${
          input.amountRequested ? ` — asking $${input.amountRequested.toLocaleString()}` : ""
        }${input.pitchSummary ? `\n> ${input.pitchSummary.slice(0, 280)}` : ""}${
          base ? `\n<${base}/applications/${app.id}|Open in OpenVenture>` : ""
        }`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, applicationId: app.id }, { status: 201 });
}
