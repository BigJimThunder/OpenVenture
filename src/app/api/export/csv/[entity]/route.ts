import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  application,
  company,
  pipelineStage,
  grant,
  grantPool,
  member,
  outcomeUpdate,
} from "@/db/schema";
import { getCtx, roleAtLeast } from "@/lib/actions/context";
import { DEMO_REFUSAL, demoMode } from "@/lib/demo";
import { toCsv } from "@/lib/export/csv";

export const dynamic = "force-dynamic";

/**
 * Spreadsheet-friendly exports for the four tables officers actually reach
 * for. Demographics never appear here — aggregate-only means exports too.
 */


const ENTITIES = ["applications", "grants", "members", "outcomes"] as const;
type Entity = (typeof ENTITIES)[number];

async function buildRows(entity: Entity, orgId: string) {
  switch (entity) {
    case "applications": {
      const rows = await db
        .select({
          id: application.id,
          company: company.name,
          domain: company.domain,
          stage: pipelineStage.name,
          status: application.status,
          amount_requested: application.amountRequested,
          applicant_name: application.applicantName,
          applicant_email: application.applicantEmail,
          department: application.department,
          major: application.major,
          school: application.school,
          class_year: application.classYear,
          team_size: application.teamSize,
          team_composition: application.teamComposition,
          team_student_mix: application.teamStudentMix,
          campus_source: application.campusSource,
          how_heard: application.howHeard,
          decline_reason: application.declineReason,
          applied_at: application.appliedAt,
          decided_at: application.decidedAt,
        })
        .from(application)
        .innerJoin(company, eq(application.companyId, company.id))
        .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
        .where(eq(application.orgId, orgId));
      return rows;
    }
    case "grants": {
      const rows = await db
        .select({
          id: grant.id,
          company: company.name,
          pool: grantPool.name,
          status: grant.status,
          amount_requested: grant.amountRequested,
          amount_awarded: grant.amountAwarded,
          use_of_funds: grant.useOfFunds,
          milestone: grant.milestone,
          payment_method: grant.paymentMethod,
          approved_at: grant.approvedAt,
          issued_at: grant.issuedAt,
          cashed_at: grant.cashedAt,
          reconciled_at: grant.reconciledAt,
        })
        .from(grant)
        .innerJoin(company, eq(grant.companyId, company.id))
        .innerJoin(grantPool, eq(grant.poolId, grantPool.id))
        .where(eq(grant.orgId, orgId));
      return rows;
    }
    case "members": {
      const rows = await db
        .select({
          id: member.id,
          display_name: member.displayName,
          email: member.email,
          role: member.role,
          status: member.status,
          title: member.title,
          cohort: member.cohort,
          class_year: member.classYear,
          joined_at: member.joinedAt,
          offboarded_at: member.offboardedAt,
        })
        .from(member)
        .where(eq(member.orgId, orgId));
      return rows;
    }
    case "outcomes": {
      const rows = await db
        .select({
          id: outcomeUpdate.id,
          company: company.name,
          tier: outcomeUpdate.tier,
          note: outcomeUpdate.note,
          recorded_at: outcomeUpdate.recordedAt,
        })
        .from(outcomeUpdate)
        .innerJoin(company, eq(outcomeUpdate.companyId, company.id))
        .where(eq(outcomeUpdate.orgId, orgId));
      return rows;
    }
  }
}

const HEADER_COLUMNS: Record<Entity, string[]> = {
  applications: [
    "id", "company", "domain", "stage", "status", "amount_requested", "applicant_name",
    "applicant_email", "department", "major", "school", "class_year", "team_size",
    "team_composition", "team_student_mix", "campus_source", "how_heard",
    "decline_reason", "applied_at", "decided_at",
  ],
  grants: [
    "id", "company", "pool", "status", "amount_requested", "amount_awarded",
    "use_of_funds", "milestone", "payment_method", "approved_at", "issued_at",
    "cashed_at", "reconciled_at",
  ],
  members: [
    "id", "display_name", "email", "role", "status", "title", "cohort",
    "class_year", "joined_at", "offboarded_at",
  ],
  outcomes: ["id", "company", "tier", "note", "recorded_at"],
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ entity: string }> }
) {
  const ctx = await getCtx();
  if (!ctx) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!roleAtLeast(ctx.member.role, "admin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  // The demo's admin is whoever clicked "Explore the demo".
  if (demoMode(ctx.org)) return NextResponse.json({ error: DEMO_REFUSAL }, { status: 403 });
  const { entity } = await params;
  if (!(ENTITIES as readonly string[]).includes(entity)) {
    return NextResponse.json(
      { error: `Unknown entity — one of: ${ENTITIES.join(", ")}` },
      { status: 404 }
    );
  }
  const e = entity as Entity;
  const rows = await buildRows(e, ctx.org.id);
  const body = toCsv(rows as Record<string, unknown>[], HEADER_COLUMNS[e]);
  // Data leaving the club is part of the record.
  await db.insert(activity).values({
    orgId: ctx.org.id,
    actorMemberId: ctx.member.id,
    actorType: "member",
    verb: "data.exported",
    entityType: "organization",
    entityId: ctx.org.id,
    entityLabel: ctx.org.name,
    summary: `${ctx.member.displayName} exported ${e} as CSV (${rows.length} rows)`,
  });

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="openventure-${e}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
