"use server";

import { z } from "zod";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { apiToken, member, API_TOKEN_SCOPES } from "@/db/schema";
import { mcpEnabled } from "@/lib/mcp/config";
import {
  DEFAULT_TOKEN_EXPIRY_DAYS,
  generateToken,
  MAX_TOKENS_PER_MEMBER,
  TOKEN_EXPIRY_DAYS,
  tokenExpiry,
} from "@/lib/mcp/tokens";
import type { Ctx } from "./context";
import { ActionError, authedAction } from "./safe-action";

/**
 * Personal access tokens: a member's key for their own AI assistant.
 *
 * Both actions refuse a request that itself arrived with a token. A token must
 * never be able to mint a longer-lived or wider copy of itself, or revoke the
 * others — only a signed-in person does that.
 */
function assertSignedIn(ctx: Ctx) {
  if (ctx.via !== "session") {
    throw new ActionError("Access tokens are managed by signing in to the app, not through a token.");
  }
}

export const createAccessToken = authedAction({
  minRole: "read_only",
  input: z.object({
    name: z.string().trim().min(1, "Give the token a name, like the assistant it is for").max(60),
    scope: z.enum(API_TOKEN_SCOPES),
    /** null = never expires. */
    expiresInDays: z
      .union([z.literal(TOKEN_EXPIRY_DAYS[0]), z.literal(TOKEN_EXPIRY_DAYS[1]), z.literal(TOKEN_EXPIRY_DAYS[2]), z.null()])
      .default(DEFAULT_TOKEN_EXPIRY_DAYS),
  }),
  handler: async (input, ctx) => {
    assertSignedIn(ctx);
    if (!mcpEnabled()) throw new ActionError("The AI connection is switched off on this deployment.");
    // A token never does more than its member.
    if (input.scope === "write" && ctx.member.role === "read_only") {
      throw new ActionError("Read-only members can create read tokens only.");
    }

    const now = new Date();
    const [live] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(apiToken)
      .where(
        and(
          eq(apiToken.memberId, ctx.member.id),
          isNull(apiToken.revokedAt),
          or(isNull(apiToken.expiresAt), gt(apiToken.expiresAt, now))
        )
      );
    if ((live?.n ?? 0) >= MAX_TOKENS_PER_MEMBER) {
      throw new ActionError(`You have ${MAX_TOKENS_PER_MEMBER} active tokens, which is the limit. Revoke one first.`);
    }

    const { token, tokenHash, prefix } = generateToken();
    const [row] = await db
      .insert(apiToken)
      .values({
        orgId: ctx.org.id,
        memberId: ctx.member.id,
        name: input.name,
        tokenHash,
        prefix,
        scope: input.scope,
        expiresAt: tokenExpiry(input.expiresInDays, now),
      })
      .returning({ id: apiToken.id, expiresAt: apiToken.expiresAt });

    revalidatePath("/connect");
    return {
      // The only time the token itself exists outside the member's clipboard.
      data: { id: row.id, token, expiresAt: row.expiresAt?.toISOString() ?? null },
      activity: {
        verb: "token.created",
        entityType: "api_token",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} created a ${input.scope} access token for an assistant (${input.name})`,
      },
    };
  },
});

export const revokeAccessToken = authedAction({
  minRole: "read_only",
  input: z.object({ tokenId: z.string().uuid() }),
  handler: async (input, ctx) => {
    assertSignedIn(ctx);
    const [row] = await db
      .select({
        id: apiToken.id,
        name: apiToken.name,
        memberId: apiToken.memberId,
        revokedAt: apiToken.revokedAt,
        ownerName: member.displayName,
      })
      .from(apiToken)
      .innerJoin(member, eq(apiToken.memberId, member.id))
      .where(and(eq(apiToken.id, input.tokenId), eq(apiToken.orgId, ctx.org.id)))
      .limit(1);
    // Your own tokens; an admin may revoke anyone's (offboarding, a lost laptop).
    const mine = row?.memberId === ctx.member.id;
    if (!row || (!mine && ctx.member.role !== "admin")) throw new ActionError("Token not found");
    if (row.revokedAt) return { data: { ok: true } };

    await db.update(apiToken).set({ revokedAt: new Date() }).where(eq(apiToken.id, row.id));
    revalidatePath("/connect");
    return {
      data: { ok: true },
      activity: {
        verb: "token.revoked",
        entityType: "api_token",
        entityId: row.id,
        entityLabel: row.name,
        summary: mine
          ? `${ctx.member.displayName} revoked their access token (${row.name})`
          : `${ctx.member.displayName} revoked ${row.ownerName}'s access token (${row.name})`,
      },
    };
  },
});
