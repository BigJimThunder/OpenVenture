import { cache } from "react";
import { headers } from "next/headers";
import { eq, and, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { member, organization, type MemberRole } from "@/db/schema";

/**
 * Server-side auth context. Auth is enforced here AND in the (app) layout —
 * middleware is only a cheap redirect, never the sole gate.
 */

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "ForbiddenError";
  }
}

const ROLE_RANK: Record<MemberRole, number> = {
  read_only: 0,
  analyst: 1,
  partner: 2,
  admin: 3,
};

export function roleAtLeast(role: MemberRole, min: MemberRole) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export type Ctx = {
  userId: string;
  email: string;
  member: typeof member.$inferSelect;
  org: typeof organization.$inferSelect;
};

/** Cached per-request. Returns null when unauthenticated or not yet a member. */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const rows = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, session.user.id), isNull(member.offboardedAt)))
    .limit(1);
  let m = rows[0];

  if (!m) {
    // First login after an invite: link the pending member row by email.
    const pending = await db
      .select()
      .from(member)
      .where(and(eq(member.email, session.user.email.toLowerCase()), isNull(member.userId)))
      .limit(1);
    if (!pending[0]) return null;
    const updated = await db
      .update(member)
      .set({ userId: session.user.id, status: "active", updatedAt: new Date() })
      .where(eq(member.id, pending[0].id))
      .returning();
    m = updated[0]!;
  }

  const orgs = await db
    .select()
    .from(organization)
    .where(eq(organization.id, m.orgId))
    .limit(1);
  if (!orgs[0]) return null;

  return { userId: session.user.id, email: session.user.email, member: m, org: orgs[0] };
});

export async function requireCtx(minRole: MemberRole = "read_only"): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new AuthError();
  if (!roleAtLeast(ctx.member.role, minRole)) throw new ForbiddenError();
  return ctx;
}
