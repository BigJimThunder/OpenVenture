import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { application, company } from "@/db/schema";
import {
  matchDuplicates,
  type DuplicateCandidate,
  type DuplicateQuery,
} from "./duplicate-match";

export {
  matchDuplicates,
  nameSimilarity,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  type DuplicateCandidate,
  type DuplicateQuery,
  type DuplicateReason,
} from "./duplicate-match";

/**
 * Likely duplicates of an application that is about to be (or has just been)
 * created: same normalized domain, same applicant email, or a near-identical
 * company name. Matching is pure (./duplicate-match) and runs in memory — a
 * club's whole history is a few hundred rows.
 *
 * Pass `excludeApplicationId` when checking an application that already exists.
 */
export async function findDuplicateCandidates(
  orgId: string,
  query: DuplicateQuery,
  opts: { excludeApplicationId?: string; limit?: number } = {}
): Promise<DuplicateCandidate[]> {
  if (!query.companyName?.trim() && !query.domain?.trim() && !query.applicantEmail?.trim()) {
    return [];
  }
  const rows = await db
    .select({
      applicationId: application.id,
      ref: application.ref,
      companyName: company.name,
      domain: company.domain,
      applicantEmail: application.applicantEmail,
    })
    .from(application)
    .innerJoin(company, eq(application.companyId, company.id))
    .where(and(eq(application.orgId, orgId), isNull(application.archivedAt)))
    .orderBy(desc(application.appliedAt))
    .limit(2000);
  return matchDuplicates(query, rows, opts);
}
