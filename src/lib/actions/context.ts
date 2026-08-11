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

/**
 * Break-glass admin — survival hatch for the year a cohort graduates without
 * promoting a successor. Set BOOTSTRAP_ADMIN_EMAIL in the deployment env; the
 * matching sign-in becomes (or is promoted to) an admin member. Unset it when
 * you're done. Documented in ADMIN_RUNBOOK.md.
 */
function isBreakGlassEmail(email: string): boolean {
  const configured = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  return Boolean(configured) && email.toLowerCase() === configured;
}

async function maybeBreakGlass(
  userId: string,
  email: string
): Promise<typeof member.$inferSelect | null> {
  if (!isBreakGlassEmail(email)) return null;
  const orgs = await db.select().from(organization).limit(1);
  if (!orgs[0]) return null; // no org yet — first-run /setup handles that
  const created = await db
    .insert(member)
    .values({
      orgId: orgs[0].id,
      userId,
      email: email.toLowerCase(),
      displayName: email.split("@")[0],
      role: "admin",
      status: "active",
    })
    .returning();
  console.warn(`[break-glass] admin member created for ${email}`);
  return created[0] ?? null;
}

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
    if (pending[0]) {
      const updated = await db
        .update(member)
        .set({ userId: session.user.id, status: "active", updatedAt: new Date() })
        .where(eq(member.id, pending[0].id))
        .returning();
      m = updated[0]!;
    } else {
      const breakGlass = await maybeBreakGlass(session.user.id, session.user.email);
      if (!breakGlass) return null;
      m = breakGlass;
    }
  } else if (isBreakGlassEmail(session.user.email) && m.role !== "admin") {
    // Existing member matching BOOTSTRAP_ADMIN_EMAIL: promote to admin.
    const updated = await db
      .update(member)
      .set({ role: "admin", updatedAt: new Date() })
      .where(eq(member.id, m.id))
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
