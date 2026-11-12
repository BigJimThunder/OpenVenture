"use server";

import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  grant,
  grantPool,
  receipt,
  company,
  application,
  memo,
  voteRound,
  outcomeUpdate,
  USE_OF_FUNDS,
  PAYMENT_METHODS,
  OUTCOME_TIERS,
  type GrantStatus,
} from "@/db/schema";
import { canApprove, COMMITTED_STATUSES } from "@/lib/grants/budget";
import { findLiveGrant } from "@/lib/pipeline/moves";
import { atomic, guard, guardFailure, lock } from "@/lib/pipeline/atomic";
import { authedAction, ActionError } from "./safe-action";
import { formatMoney } from "@/lib/utils";

function revalidateGrants(applicationId?: string | null) {
  revalidatePath("/grants");
  revalidatePath("/grants/budget");
  revalidatePath("/inbox");
  if (applicationId) revalidatePath(`/pipeline/${applicationId}`);
}

async function loadGrant(orgId: string, grantId: string) {
  const [row] = await db
    .select({
      grant: grant,
      companyName: company.name,
    })
    .from(grant)
    .innerJoin(company, eq(grant.companyId, company.id))
    .where(and(eq(grant.id, grantId), eq(grant.orgId, orgId)))
    .limit(1);
  if (!row) throw new ActionError("Grant not found");
  return row;
}

const STALE_GRANT = "This grant was just changed by someone else — refresh to see where it stands";

/** SQL: the grant is (still) in this status. */
function grantHasStatus(grantId: string, status: GrantStatus) {
  return sql`exists (select 1 from ${grant} where ${grant.id} = ${grantId} and ${grant.status} = ${status})`;
}

/** SQL: the application has no grant that isn't cancelled. */
function noLiveGrant(applicationId: string) {
  return sql`not exists (select 1 from ${grant} where ${grant.applicationId} = ${applicationId} and ${grant.status} <> 'cancelled')`;
}

/**
 * SQL: the pool's budget covers this grant on top of everything already
 * committed against it. The same rule as `canApprove`, evaluated by Postgres
 * in exact numeric arithmetic at the moment of the write.
 */
function poolCovers(poolId: string, grantId: string) {
  return sql`(select ${grantPool.totalBudget} + ${grantPool.rolloverFromPrior} from ${grantPool} where ${grantPool.id} = ${poolId})
    - coalesce((select sum(${grant.amountAwarded}) from ${grant}
        where ${grant.poolId} = ${poolId} and ${grant.id} <> ${grantId}
          and ${inArray(grant.status, [...COMMITTED_STATUSES])}), 0)
    >= (select ${grant.amountAwarded} from ${grant} where ${grant.id} = ${grantId})`;
}

/**
 * Move a grant to its next status only if it is still in one of `from`. Two
 * people acting on the same grant can't both succeed, and a stale screen
 * can't overwrite a newer status.
 */
async function transition(
  grantId: string,
  orgId: string,
  from: GrantStatus[],
  set: Partial<typeof grant.$inferInsert>
) {
  const updated = await db
    .update(grant)
    .set(set)
    .where(and(eq(grant.id, grantId), eq(grant.orgId, orgId), inArray(grant.status, from)))
    .returning({ id: grant.id });
  if (updated.length === 0) throw new ActionError(STALE_GRANT);
}

export const createGrant = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid().optional(),
    companyId: z.string().uuid().optional(),
    poolId: z.string().uuid(),
    amountAwarded: z.coerce.number().positive().max(1_000_000),
    useOfFunds: z.enum(USE_OF_FUNDS).default("other"),
    useOfFundsNarrative: z.string().max(2000).optional(),
    milestone: z.string().max(500).optional(),
  }),
  handler: async (input, ctx) => {
    let companyId = input.companyId ?? null;
    let amountRequested: string | null = null;
    let memoId: string | null = null;
    let voteRoundId: string | null = null;

    if (input.applicationId) {
      const [app] = await db
        .select()
        .from(application)
        .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
        .limit(1);
      if (!app) throw new ActionError("Application not found");
      companyId = app.companyId;
      amountRequested = app.amountRequested;

      if (await findLiveGrant(input.applicationId)) {
        throw new ActionError("This application already has a grant");
      }

      // Link the decision trail: the memo and vote that justified this check.
      const [[latestMemo], [latestRound]] = await Promise.all([
        db
          .select({ id: memo.id })
          .from(memo)
          .where(
            and(
              eq(memo.applicationId, input.applicationId),
              inArray(memo.status, ["decided", "circulated"])
            )
          )
          .orderBy(desc(memo.createdAt))
          .limit(1),
        db
          .select({ id: voteRound.id })
          .from(voteRound)
          .where(
            and(
              eq(voteRound.applicationId, input.applicationId),
              eq(voteRound.status, "revealed")
            )
          )
          .orderBy(desc(voteRound.createdAt))
          .limit(1),
      ]);
      memoId = latestMemo?.id ?? null;
      voteRoundId = latestRound?.id ?? null;
    }
    if (!companyId) throw new ActionError("A company or application is required");

    const [pool] = await db
      .select()
      .from(grantPool)
      .where(and(eq(grantPool.id, input.poolId), eq(grantPool.orgId, ctx.org.id)))
      .limit(1);
    if (!pool) throw new ActionError("Pool not found");

    const [co] = await db
      .select({ name: company.name })
      .from(company)
      .where(and(eq(company.id, companyId), eq(company.orgId, ctx.org.id)))
      .limit(1);
    if (!co) throw new ActionError("Company not found");

    const insert = (q: typeof db) =>
      q
        .insert(grant)
        .values({
          orgId: ctx.org.id,
          poolId: input.poolId,
          applicationId: input.applicationId ?? null,
          companyId,
          memoId,
          voteRoundId,
          status: "proposed",
          amountRequested,
          amountAwarded: new Decimal(input.amountAwarded).toFixed(2),
          useOfFunds: input.useOfFunds,
          useOfFundsNarrative: input.useOfFundsNarrative,
          milestone: input.milestone,
        })
        .returning();

    let row: typeof grant.$inferSelect;
    if (input.applicationId) {
      // "At most one live grant per application" was checked above on a
      // snapshot. Two people proposing at once would both pass it, so the
      // check is repeated under a lock, in the same unit as the insert.
      const applicationId = input.applicationId;
      try {
        const results = await atomic((q) => [
          lock(q, "application", applicationId),
          guard(q, noLiveGrant(applicationId), "grant_exists"),
          insert(q),
        ]);
        row = (results[2] as (typeof grant.$inferSelect)[])[0];
      } catch (e) {
        if (guardFailure(e) === "grant_exists") {
          throw new ActionError("This application already has a grant");
        }
        throw e;
      }
    } else {
      [row] = await insert(db);
    }

    revalidateGrants(input.applicationId);
    return {
      data: { grantId: row.id },
      activity: {
        verb: "grant.proposed",
        entityType: "grant",
        entityId: row.id,
        entityLabel: co?.name,
        summary: `${ctx.member.displayName} proposed a ${formatMoney(input.amountAwarded)} grant to ${co?.name}`,
      },
    };
  },
});

export const approveGrant = authedAction({
  minRole: "admin",
  input: z.object({ grantId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    if (g.status !== "proposed") throw new ActionError(`Cannot approve a ${g.status} grant`);

    // The overdraw guard. Remaining budget is derived from the other grants
    // in the pool, so two approvals racing each other could each see room
    // for themselves. Approvals in a pool therefore take turns (the lock),
    // and the budget is re-derived by Postgres inside the same unit as the
    // status change (the guards).
    const now = new Date();
    try {
      await atomic((q) => [
        lock(q, "pool", g.poolId),
        guard(q, grantHasStatus(g.id, "proposed"), "not_proposed"),
        guard(q, poolCovers(g.poolId, g.id), "overdraw"),
        q
          .update(grant)
          .set({ status: "approved", approvedByMemberId: ctx.member.id, approvedAt: now, updatedAt: now })
          .where(and(eq(grant.id, g.id), eq(grant.orgId, ctx.org.id))),
      ]);
    } catch (e) {
      const failed = guardFailure(e);
      if (failed === "not_proposed") {
        throw new ActionError("This grant was just approved or cancelled by someone else — refresh to see it");
      }
      if (failed !== "overdraw") throw e;
      // Explain with the numbers as they are now.
      const [pool] = await db.select().from(grantPool).where(eq(grantPool.id, g.poolId)).limit(1);
      const others = await db
        .select({ status: grant.status, amountAwarded: grant.amountAwarded })
        .from(grant)
        .where(and(eq(grant.poolId, g.poolId), sql`${grant.id} <> ${g.id}`));
      const check = canApprove(pool!, others, g.amountAwarded);
      throw new ActionError(
        `Approving would overdraw the pool by ${formatMoney(check.shortfall, { cents: true })} — only ${formatMoney(check.remaining, { cents: true })} remains`
      );
    }

    revalidateGrants(g.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "grant.approved",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} approved a ${formatMoney(g.amountAwarded)} grant to ${companyName}`,
      },
    };
  },
});

export const issueGrant = authedAction({
  minRole: "admin",
  input: z.object({
    grantId: z.string().uuid(),
    paymentMethod: z.enum(PAYMENT_METHODS),
    paymentRef: z.string().max(120).optional(),
  }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    if (g.status !== "approved") throw new ActionError(`Cannot issue a ${g.status} grant`);

    const now = new Date();
    try {
      await atomic((q) => [
        lock(q, "grant", g.id),
        guard(q, grantHasStatus(g.id, "approved"), "not_approved"),
        q
          .update(grant)
          .set({
            status: "issued",
            paymentMethod: input.paymentMethod,
            paymentRef: input.paymentRef,
            issuedAt: now,
            updatedAt: now,
          })
          .where(and(eq(grant.id, g.id), eq(grant.orgId, ctx.org.id))),
        // A funded company is portfolio from the moment money moves.
        q
          .update(company)
          .set({ status: "portfolio", updatedAt: now })
          .where(and(eq(company.id, g.companyId), eq(company.orgId, ctx.org.id))),
      ]);
    } catch (e) {
      if (guardFailure(e) === "not_approved") throw new ActionError(STALE_GRANT);
      throw e;
    }

    revalidateGrants(g.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "grant.issued",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} issued ${formatMoney(g.amountAwarded)} to ${companyName} via ${input.paymentMethod}`,
      },
    };
  },
});

export const markGrantCashed = authedAction({
  minRole: "partner",
  input: z.object({ grantId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    if (g.status !== "issued") throw new ActionError(`Cannot mark a ${g.status} grant as cashed`);
    const now = new Date();
    await transition(g.id, ctx.org.id, ["issued"], { status: "cashed", cashedAt: now, updatedAt: now });
    revalidateGrants(g.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "grant.cashed",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `The ${formatMoney(g.amountAwarded)} grant to ${companyName} was cashed`,
      },
    };
  },
});

export const reconcileGrant = authedAction({
  minRole: "partner",
  input: z.object({ grantId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    if (g.status !== "issued" && g.status !== "cashed") {
      throw new ActionError(`Cannot reconcile a ${g.status} grant`);
    }
    const receipts = await db
      .select({ amount: receipt.amount })
      .from(receipt)
      .where(eq(receipt.grantId, g.id));
    // Exact arithmetic: receipts are cents, and floats drift.
    const receiptSum = receipts.reduce((n, r) => n.add(r.amount), new Decimal(0));
    const receiptTotal = receiptSum.toNumber();
    const shortBy = new Decimal(g.amountAwarded).sub(receiptSum);
    const short = shortBy.toNumber();

    const now = new Date();
    await transition(g.id, ctx.org.id, ["issued", "cashed"], {
      status: "reconciled",
      reconciledAt: now,
      updatedAt: now,
    });

    revalidateGrants(g.applicationId);
    return {
      // Warn (not block) when receipts don't cover the award.
      data: { ok: true, receiptShortfall: shortBy.gt(0) ? short : 0 },
      activity: {
        verb: "grant.reconciled",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} reconciled the ${formatMoney(g.amountAwarded)} grant to ${companyName} (${formatMoney(receiptTotal)} in receipts)`,
      },
    };
  },
});

export const cancelGrant = authedAction({
  minRole: "admin",
  input: z.object({ grantId: z.string().uuid(), reason: z.string().max(500).optional() }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    if (g.status === "reconciled") throw new ActionError("Cannot cancel a reconciled grant");
    const now = new Date();
    await transition(g.id, ctx.org.id, ["proposed", "approved", "issued", "cashed"], {
      status: "cancelled",
      notes: input.reason ?? g.notes,
      updatedAt: now,
    });
    revalidateGrants(g.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "grant.cancelled",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} cancelled the ${formatMoney(g.amountAwarded)} grant to ${companyName}`,
      },
    };
  },
});

export const addReceipt = authedAction({
  minRole: "analyst",
  input: z.object({
    grantId: z.string().uuid(),
    amount: z.coerce.number().positive().max(1_000_000),
    vendor: z.string().max(120).optional(),
    description: z.string().max(500).optional(),
  }),
  handler: async (input, ctx) => {
    const { grant: g, companyName } = await loadGrant(ctx.org.id, input.grantId);
    const [row] = await db
      .insert(receipt)
      .values({
        orgId: ctx.org.id,
        grantId: g.id,
        amount: new Decimal(input.amount).toFixed(2),
        vendor: input.vendor,
        description: input.description,
      })
      .returning();
    revalidateGrants(g.applicationId);
    return {
      data: { receiptId: row.id },
      activity: {
        verb: "receipt.added",
        entityType: "grant",
        entityId: g.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} added a ${formatMoney(input.amount, { cents: true })} receipt${input.vendor ? ` (${input.vendor})` : ""} for ${companyName}`,
      },
    };
  },
});

export const createPool = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().min(2).max(80),
    fiscalYear: z.coerce.number().int().min(2000).max(2100),
    totalBudget: z.coerce.number().positive().max(10_000_000),
    rolloverFromPrior: z.coerce.number().min(0).max(10_000_000).default(0),
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
      })
      .returning();
    revalidateGrants();
    return {
      data: { poolId: row.id },
      activity: {
        verb: "pool.created",
        entityType: "grant_pool",
        entityId: row.id,
        summary: `${ctx.member.displayName} created ${input.name} with a ${formatMoney(input.totalBudget)} budget`,
      },
    };
  },
});

export const setOutcomeTier = authedAction({
  minRole: "analyst",
  input: z.object({
    companyId: z.string().uuid(),
    tier: z.enum(OUTCOME_TIERS),
    note: z.string().max(1000).optional(),
  }),
  handler: async (input, ctx) => {
    const [co] = await db
      .select()
      .from(company)
      .where(and(eq(company.id, input.companyId), eq(company.orgId, ctx.org.id)))
      .limit(1);
    if (!co) throw new ActionError("Company not found");

    const now = new Date();
    await atomic((q) => [
      q
        .update(company)
        .set({ outcomeTier: input.tier, outcomeUpdatedAt: now, updatedAt: now })
        .where(and(eq(company.id, co.id), eq(company.orgId, ctx.org.id))),
      q.insert(outcomeUpdate).values({
        orgId: ctx.org.id,
        companyId: co.id,
        tier: input.tier,
        note: input.note,
        recordedByMemberId: ctx.member.id,
      }),
    ]);

    revalidatePath("/outcomes");
    return {
      data: { ok: true },
      activity: {
        verb: "outcome.updated",
        entityType: "company",
        entityId: co.id,
        entityLabel: co.name,
        summary: `${ctx.member.displayName} marked ${co.name} as ${input.tier.replace("_", " ")}`,
        diff: { outcomeTier: { from: co.outcomeTier, to: input.tier } },
      },
    };
  },
});
