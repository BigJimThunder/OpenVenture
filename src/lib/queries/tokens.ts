import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { apiToken, member } from "@/db/schema";

/** Never selects `tokenHash` — nothing outside the auth lookup needs it. */
const tokenRow = {
  id: apiToken.id,
  name: apiToken.name,
  prefix: apiToken.prefix,
  scope: apiToken.scope,
  createdAt: apiToken.createdAt,
  lastUsedAt: apiToken.lastUsedAt,
  expiresAt: apiToken.expiresAt,
  revokedAt: apiToken.revokedAt,
};

/** A member's own tokens: live ones, plus expired ones so they can see why an assistant stopped. */
export async function getMyTokens(orgId: string, memberId: string) {
  return db
    .select(tokenRow)
    .from(apiToken)
    .where(and(eq(apiToken.orgId, orgId), eq(apiToken.memberId, memberId), isNull(apiToken.revokedAt)))
    .orderBy(desc(apiToken.createdAt));
}

export type MyToken = Awaited<ReturnType<typeof getMyTokens>>[number];

/** Every token in the club that still works, with its owner — the admin's hygiene list. */
export async function getClubTokens(orgId: string) {
  return db
    .select({
      ...tokenRow,
      memberId: member.id,
      ownerName: member.displayName,
      ownerRole: member.role,
      /** An offboarded owner's token is already dead, but stays listed until revoked. */
      ownerStatus: member.status,
      ownerOffboardedAt: member.offboardedAt,
    })
    .from(apiToken)
    .innerJoin(member, eq(apiToken.memberId, member.id))
    .where(
      and(
        eq(apiToken.orgId, orgId),
        isNull(apiToken.revokedAt),
        or(isNull(apiToken.expiresAt), gt(apiToken.expiresAt, new Date()))
      )
    )
    .orderBy(desc(apiToken.lastUsedAt), desc(apiToken.createdAt));
}

export type ClubToken = Awaited<ReturnType<typeof getClubTokens>>[number];
