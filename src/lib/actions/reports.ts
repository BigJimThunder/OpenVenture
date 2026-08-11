"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { doc } from "@/db/schema";
import { authedAction } from "./safe-action";

/** Create (idempotently) the GP-commentary doc backing a quarter's letter. */
export const ensureReportCommentary = authedAction({
  minRole: "partner",
  input: z.object({
    fiscalYear: z.coerce.number().int().min(2000).max(2100),
    quarter: z.coerce.number().int().min(1).max(4),
  }),
  handler: async (input, ctx) => {
    const slug = `lp-report-${input.fiscalYear}-q${input.quarter}`;
    const [existing] = await db
      .select({ id: doc.id })
      .from(doc)
      .where(and(eq(doc.orgId, ctx.org.id), eq(doc.slug, slug)))
      .limit(1);
    if (existing) return { data: { docId: existing.id } };

    const [row] = await db
      .insert(doc)
      .values({
        orgId: ctx.org.id,
        title: `LP letter FY${input.fiscalYear} Q${input.quarter} — commentary`,
        slug,
        folder: "LP Reports",
        visibility: "partners",
        createdByMemberId: ctx.member.id,
        updatedByMemberId: ctx.member.id,
      })
      .returning();
    revalidatePath("/reports");
    return { data: { docId: row.id } };
  },
});
