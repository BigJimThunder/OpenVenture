import { and, eq, asc, desc, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { capTable, capEvent, company, member } from "@/db/schema";
import type { CapEventInput } from "@/lib/captable/types";

export async function getCapTablesList(orgId: string) {
  // NB: correlated subquery — fully qualify columns (see dashboard.ts note).
  return db
    .select({
      id: capTable.id,
      name: capTable.name,
      isScenario: capTable.isScenario,
      parentCapTableId: capTable.parentCapTableId,
      source: capTable.source,
      updatedAt: capTable.updatedAt,
      companyName: company.name,
      createdByName: member.displayName,
      eventCount: sql<number>`(
        select count(*)::int from ${capEvent}
        where ${capEvent}."cap_table_id" = ${capTable}."id"
      )`,
    })
    .from(capTable)
    .leftJoin(company, eq(capTable.companyId, company.id))
    .leftJoin(member, eq(capTable.createdByMemberId, member.id))
    .where(and(eq(capTable.orgId, orgId), isNull(capTable.archivedAt)))
    .orderBy(desc(capTable.updatedAt));
}

/** Every live table's ledger in one query, keyed by table — the Lab index folds each for its ownership bar. */
export async function getCapEventsByTable(orgId: string) {
  const rows = await db
    .select({
      capTableId: capEvent.capTableId,
      seq: capEvent.seq,
      effectiveDate: capEvent.effectiveDate,
      label: capEvent.label,
      payload: capEvent.payload,
    })
    .from(capEvent)
    .innerJoin(capTable, eq(capEvent.capTableId, capTable.id))
    .where(and(eq(capTable.orgId, orgId), isNull(capTable.archivedAt)))
    .orderBy(asc(capEvent.seq));
  const byTable: Record<string, CapEventInput[]> = {};
  for (const r of rows) {
    (byTable[r.capTableId] ??= []).push({
      seq: r.seq,
      effectiveDate: r.effectiveDate.toISOString(),
      label: r.label ?? undefined,
      payload: r.payload as CapEventInput["payload"],
    });
  }
  return byTable;
}

export async function getCapTableDetail(orgId: string, capTableId: string) {
  const [t] = await db
    .select({
      table: capTable,
      companyName: company.name,
    })
    .from(capTable)
    .leftJoin(company, eq(capTable.companyId, company.id))
    .where(and(eq(capTable.id, capTableId), eq(capTable.orgId, orgId)))
    .limit(1);
  if (!t) return null;

  const rows = await db
    .select()
    .from(capEvent)
    .where(eq(capEvent.capTableId, capTableId))
    .orderBy(asc(capEvent.seq));

  const events: CapEventInput[] = rows.map((r) => ({
    seq: r.seq,
    effectiveDate: r.effectiveDate.toISOString(),
    label: r.label ?? undefined,
    payload: r.payload as CapEventInput["payload"],
  }));

  return { ...t, events };
}
