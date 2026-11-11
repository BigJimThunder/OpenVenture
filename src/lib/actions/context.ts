import { cache } from "react";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { apiToken, member, organization, type ApiTokenScope, type MemberRole } from "@/db/schema";

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
  /** Auth user id; empty for a token of a member who has never signed in. */
  userId: string;
  email: string;
  member: typeof member.$inferSelect;
  org: typeof organization.$inferSelect;
  /**
   * How this request authenticated. A personal access token acts as its
   * member, with the member's role; a `read` token can never mutate
   * (enforced in authedAction, not left to each caller).
   */
  via: "session" | "token";
  tokenScope?: ApiTokenScope;
};

const TOKEN_PREFIX = "ov_pat_";

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Resolve `Authorization: Bearer ov_pat_…` to its member. Used by the MCP
 * endpoint; returns null for anything that isn't a live token of a live member.
 */
async function ctxFromToken(authorization: string | null): Promise<Ctx | null> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const [row] = await db
    .select({ token: apiToken, member, org: organization })
    .from(apiToken)
    .innerJoin(member, eq(apiToken.memberId, member.id))
    .innerJoin(organization, eq(apiToken.orgId, organization.id))
    .where(and(eq(apiToken.tokenHash, hashApiToken(token)), isNull(apiToken.revokedAt)))
    .limit(1);
  if (!row) return null;
  if (row.token.expiresAt && row.token.expiresAt < new Date()) return null;
  if (row.member.offboardedAt || row.member.status !== "active") return null;
  // Throttled: at most one write per token per minute.
  if (!row.token.lastUsedAt || Date.now() - row.token.lastUsedAt.getTime() > 60_000) {
    await db.update(apiToken).set({ lastUsedAt: new Date() }).where(eq(apiToken.id, row.token.id));
  }
  return {
    userId: row.member.userId ?? "",
    email: row.member.email,
    member: row.member,
    org: row.org,
    via: "token",
    tokenScope: row.token.scope,
  };
}

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
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user) return ctxFromToken(requestHeaders.get("authorization"));

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
      .where(
        and(
          eq(member.email, session.user.email.toLowerCase()),
          isNull(member.userId),
          // Only a live row links. One that was offboarded or marked
          // alumni/removed before its first sign-in must not come back to life.
          // ("active" with no user only occurs for demo-seeded members.)
          inArray(member.status, ["invited", "active"]),
          isNull(member.offboardedAt)
        )
      )
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

  return {
    userId: session.user.id,
    email: session.user.email,
    member: m,
    org: orgs[0],
    via: "session",
  };
});

export async function requireCtx(minRole: MemberRole = "read_only"): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) throw new AuthError();
  if (!roleAtLeast(ctx.member.role, minRole)) throw new ForbiddenError();
  return ctx;
}
