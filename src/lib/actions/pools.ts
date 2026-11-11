"use server";

import { z } from "zod";
import Decimal from "decimal.js";
import { and, eq, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { grant, grantPool } from "@/db/schema";
import { poolTotals, summarizePool } from "@/lib/grants/budget";
import { formatMoney } from "@/lib/utils";
import { authedAction, ActionError } from "./safe-action";

/** Dollars-and-cents string, validated as text so money never becomes a float. */
const money = (max: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount like 10000 or 2500.50")
    .refine((v) => new Decimal(v).lte(max), `Must be ${formatMoney(max)} or less`);

function revalidatePools() {
  revalidatePath("/settings");
  revalidatePath("/grants");
  revalidatePath("/inbox");
}

/**
 * Edit a pool. The one hard rule: the pool (budget + rollover) can never be
 * set below what has already been approved or paid out of it — that would
 * retroactively overdraw it.
 */
export const updatePool = authedAction({
  minRole: "admin",
  input: z.object({
    poolId: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    fiscalYear: z.coerce.number().int().min(2000).max(2100),
    totalBudget: money("10000000").refine((v) => new Decimal(v).gt(0), "Budget must be above zero"),
    rolloverFromPrior: money("10000000"),
    notes: z.string().trim().max(1000).nullable(),
  }),
  handler: async (input, ctx) => {
    const [pool] = await db
      .select()
      .from(grantPool)
      .where(and(eq(grantPool.id, input.poolId), eq(grantPool.orgId, ctx.org.id)))
      .limit(1);
    if (!pool) throw new ActionError("Pool not found");

    const grants = await db
      .select({ status: grant.status, amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(eq(grant.poolId, pool.id));
    const current = summarizePool(pool, grants);
    const spoken = new Decimal(current.committed).add(current.deployed);
    const { total: nextTotal } = poolTotals(input);
    if (nextTotal.lt(spoken)) {
      throw new ActionError(
        `${formatMoney(spoken.toFixed(2))} is already committed or paid from this pool, so budget plus rollover can't go below that. Cancel a grant first if the pool really shrank.`
      );
    }

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (pool.name !== input.name) diff.name = { from: pool.name, to: input.name };
    if (pool.fiscalYear !== input.fiscalYear)
      diff.fiscalYear = { from: pool.fiscalYear, to: input.fiscalYear };
    if (!new Decimal(pool.totalBudget).eq(input.totalBudget))
      diff.totalBudget = { from: pool.totalBudget, to: input.totalBudget };
    if (!new Decimal(pool.rolloverFromPrior).eq(input.rolloverFromPrior))
      diff.rolloverFromPrior = { from: pool.rolloverFromPrior, to: input.rolloverFromPrior };

    await db
      .update(grantPool)
      .set({
        name: input.name,
        fiscalYear: input.fiscalYear,
        totalBudget: new Decimal(input.totalBudget).toFixed(2),
        rolloverFromPrior: new Decimal(input.rolloverFromPrior).toFixed(2),
        notes: input.notes || null,
      })
      .where(eq(grantPool.id, pool.id));
    revalidatePools();
    return {
      data: { ok: true },
      activity: {
        verb: "pool.updated",
        entityType: "grant_pool",
        entityId: pool.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} edited the ${input.name} pool`,
        diff,
      },
    };
  },
});

export const createPoolFromSettings = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().trim().min(2).max(80),
    fiscalYear: z.coerce.number().int().min(2000).max(2100),
    totalBudget: money("10000000").refine((v) => new Decimal(v).gt(0), "Budget must be above zero"),
    rolloverFromPrior: money("10000000"),
    notes: z.string().trim().max(1000).nullable(),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .insert(grantPool)
      .values({
        orgId: ctx.org.id,
        name: input.name,
        fiscalYear: input.fiscalYear,
        totalBudget: new Decimal(input.totalBudget).toFixed(2),
        rolloverFromPrior: new Decimal(input.rolloverFromPrior).toFixed(2),
        notes: input.notes || null,
      })
      .returning();
    revalidatePools();
    return {
      data: { poolId: row.id },
      activity: {
        verb: "pool.created",
        entityType: "grant_pool",
        entityId: row.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} created ${input.name} with a ${formatMoney(input.totalBudget)} budget`,
      },
    };
  },
});

/**
 * Pools have no archive flag, and every grant must point at one — so a pool
 * can only be deleted while nothing has ever been drawn from (or proposed
 * against) it. That covers the real case: a pool created by mistake.
 */
export const deletePool = authedAction({
  minRole: "admin",
  input: z.object({ poolId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [pool] = await db
      .select()
      .from(grantPool)
      .where(and(eq(grantPool.id, input.poolId), eq(grantPool.orgId, ctx.org.id)))
      .limit(1);
    if (!pool) throw new ActionError("Pool not found");
    const [used] = await db.select({ n: count() }).from(grant).where(eq(grant.poolId, pool.id));
    if ((used?.n ?? 0) > 0) {
      throw new ActionError(
        `${used.n} grant${used.n === 1 ? "" : "s"} ${used.n === 1 ? "is" : "are"} recorded against this pool. It is part of the club's financial record and can't be deleted.`
      );
    }
    await db.delete(grantPool).where(eq(grantPool.id, pool.id));
    revalidatePools();
    return {
      data: { ok: true },
      activity: {
        verb: "pool.deleted",
        entityType: "grant_pool",
        entityId: pool.id,
        entityLabel: pool.name,
        summary: `${ctx.member.displayName} deleted the unused ${pool.name} pool`,
      },
    };
  },
});
