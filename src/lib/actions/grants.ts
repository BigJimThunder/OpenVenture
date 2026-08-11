"use server";

import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  grant,
  grantPool,
  receipt,
  company,
  application,
  outcomeUpdate,
  USE_OF_FUNDS,
  PAYMENT_METHODS,
  OUTCOME_TIERS,
} from "@/db/schema";
import { canApprove } from "@/lib/grants/budget";
import { authedAction, ActionError } from "./safe-action";
import { formatMoney } from "@/lib/utils";

function revalidateGrants(applicationId?: string | null) {
  revalidatePath("/grants");
  revalidatePath("/grants/budget");
  revalidatePath("/");
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

    if (input.applicationId) {
      const [app] = await db
        .select()
        .from(application)
        .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
        .limit(1);
      if (!app) throw new ActionError("Application not found");
      companyId = app.companyId;
      amountRequested = app.amountRequested;

      const [existing] = await db
        .select({ id: grant.id })
        .from(grant)
        .where(
          and(eq(grant.applicationId, input.applicationId), ne(grant.status, "cancelled"))
        )
        .limit(1);
      if (existing) throw new ActionError("This application already has a grant");
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
      .where(eq(company.id, companyId))
      .limit(1);

    const [row] = await db
      .insert(grant)
      .values({
        orgId: ctx.org.id,
        poolId: input.poolId,
        applicationId: input.applicationId ?? null,
        companyId,
        status: "proposed",
        amountRequested,
        amountAwarded: String(input.amountAwarded),
        useOfFunds: input.useOfFunds,
        useOfFundsNarrative: input.useOfFundsNarrative,
        milestone: input.milestone,
      })
      .returning();

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

    // The overdraw guard: remaining budget must cover the award.
    const [pool] = await db.select().from(grantPool).where(eq(grantPool.id, g.poolId)).limit(1);
    const others = await db
      .select({ status: grant.status, amountAwarded: grant.amountAwarded })
      .from(grant)
      .where(and(eq(grant.poolId, g.poolId), ne(grant.id, g.id)));
    const check = canApprove(pool!, others, g.amountAwarded);
    if (!check.ok) {
      throw new ActionError(
        `Approving would overdraw the pool by ${formatMoney(check.shortfall, { cents: true })} — only ${formatMoney(check.remaining, { cents: true })} remains`
      );
    }

    const now = new Date();
    await db
      .update(grant)
      .set({ status: "approved", approvedByMemberId: ctx.member.id, approvedAt: now, updatedAt: now })
      .where(eq(grant.id, g.id));

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
    await db
      .update(grant)
      .set({
        status: "issued",
        paymentMethod: input.paymentMethod,
        paymentRef: input.paymentRef,
        issuedAt: now,
        updatedAt: now,
      })
      .where(eq(grant.id, g.id));
    // A funded company is portfolio from the moment money moves.
    await db
      .update(company)
      .set({ status: "portfolio", updatedAt: now })
      .where(eq(company.id, g.companyId));

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
    await db
      .update(grant)
      .set({ status: "cashed", cashedAt: now, updatedAt: now })
      .where(eq(grant.id, g.id));
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
    const receiptTotal = receipts.reduce((n, r) => n + Number(r.amount), 0);
    const short = Number(g.amountAwarded) - receiptTotal;

    const now = new Date();
    await db
      .update(grant)
      .set({ status: "reconciled", reconciledAt: now, updatedAt: now })
      .where(eq(grant.id, g.id));

    revalidateGrants(g.applicationId);
    return {
      // Warn (not block) when receipts don't cover the award.
      data: { ok: true, receiptShortfall: short > 0.005 ? short : 0 },
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
    await db
      .update(grant)
      .set({ status: "cancelled", notes: input.reason ?? g.notes, updatedAt: now })
      .where(eq(grant.id, g.id));
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
        amount: String(input.amount),
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
        totalBudget: String(input.totalBudget),
        rolloverFromPrior: String(input.rolloverFromPrior),
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
    await db
      .update(company)
      .set({ outcomeTier: input.tier, outcomeUpdatedAt: now, updatedAt: now })
      .where(eq(company.id, co.id));
    await db.insert(outcomeUpdate).values({
      orgId: ctx.org.id,
      companyId: co.id,
      tier: input.tier,
      note: input.note,
      recordedByMemberId: ctx.member.id,
    });

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
