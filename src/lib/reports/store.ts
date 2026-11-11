import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { report, type ReportKind } from "@/db/schema";

/**
 * Shared persistence for all three report kinds. Kind-specific content shapes
 * (and their Zod schemas) live next to each report: funding-request.ts,
 * quarterly.ts, annual.ts. Call these from inside an authedAction — they do no
 * authorization of their own.
 */
export type ReportRow = typeof report.$inferSelect;

export const periodKey = {
  quarterly: (fiscalYear: number, quarter: number) => `FY${fiscalYear}-Q${quarter}`,
  annual: (fiscalYear: number) => `FY${fiscalYear}`,
  fundingRequest: (applicationId: string) => applicationId,
};

export async function getReport(orgId: string, kind: ReportKind, key: string) {
  const [row] = await db
    .select()
    .from(report)
    .where(and(eq(report.orgId, orgId), eq(report.kind, kind), eq(report.periodKey, key)))
    .limit(1);
  return row ?? null;
}

export async function getReportById(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(report)
    .where(and(eq(report.orgId, orgId), eq(report.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listReports(orgId: string, kind?: ReportKind) {
  return db
    .select()
    .from(report)
    .where(
      and(eq(report.orgId, orgId), isNull(report.archivedAt), kind ? eq(report.kind, kind) : undefined)
    )
    .orderBy(desc(report.updatedAt));
}

/** Create the draft if it doesn't exist yet; otherwise return it untouched. */
export async function ensureReport(input: {
  orgId: string;
  kind: ReportKind;
  key: string;
  title: string;
  memberId: string;
  applicationId?: string;
  content?: Record<string, unknown>;
}): Promise<ReportRow> {
  const [created] = await db
    .insert(report)
    .values({
      orgId: input.orgId,
      kind: input.kind,
      periodKey: input.key,
      title: input.title,
      applicationId: input.applicationId,
      content: input.content ?? {},
      createdByMemberId: input.memberId,
      updatedByMemberId: input.memberId,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  return (await getReport(input.orgId, input.kind, input.key))!;
}

/**
 * Shallow-merge a patch into a draft's content. Refuses once the report is
 * final or sent — reopen it first, so a report that went out can't drift.
 * Returns null when the report is locked or missing.
 */
export async function patchReportContent(
  orgId: string,
  id: string,
  memberId: string,
  patch: Record<string, unknown>
): Promise<ReportRow | null> {
  const current = await getReportById(orgId, id);
  if (!current || current.status !== "draft") return null;
  const [row] = await db
    .update(report)
    .set({
      content: { ...current.content, ...patch },
      updatedByMemberId: memberId,
      updatedAt: new Date(),
    })
    .where(and(eq(report.id, id), eq(report.status, "draft")))
    .returning();
  return row ?? null;
}
