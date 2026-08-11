import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { screeningCriterion, sector, dealSource } from "@/db/schema";

/** Ordered unarchived lookups for the settings page. */
export async function getLookups(orgId: string) {
  const [criteria, sectors, sources] = await Promise.all([
    db
      .select()
      .from(screeningCriterion)
      .where(and(eq(screeningCriterion.orgId, orgId), isNull(screeningCriterion.archivedAt)))
      .orderBy(asc(screeningCriterion.position)),
    db
      .select()
      .from(sector)
      .where(and(eq(sector.orgId, orgId), isNull(sector.archivedAt)))
      .orderBy(asc(sector.position)),
    db
      .select()
      .from(dealSource)
      .where(and(eq(dealSource.orgId, orgId), isNull(dealSource.archivedAt)))
      .orderBy(asc(dealSource.name)),
  ]);
  return { criteria, sectors, sources };
}
