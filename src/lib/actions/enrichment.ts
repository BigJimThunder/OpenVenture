"use server";

import { z } from "zod";
import { eq, and, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { company, companySector, sector } from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { fetchSiteMeta } from "@/lib/enrichment/fetch-meta";
import { llmExtract, llmEnrichmentAvailable } from "@/lib/enrichment/llm";

/**
 * "✨ Enrich from website" — reads the company's own homepage and fills in
 * ONLY fields that are currently empty AND not human-locked (locked_fields).
 * Provenance for every auto-filled field lands in field_sources, so a member
 * can always tell what came from a machine. No third-party data providers.
 */
export const enrichCompany = authedAction({
  minRole: "analyst",
  input: z.object({
    companyId: z.string().uuid(),
    applicationId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const rows = await db
      .select()
      .from(company)
      .where(
        and(eq(company.id, input.companyId), eq(company.orgId, ctx.org.id), isNull(company.archivedAt))
      )
      .limit(1);
    const c = rows[0];
    if (!c) throw new ActionError("Company not found.");

    const site = c.websiteUrl ?? c.domain;
    if (!site) throw new ActionError("Add a website or domain to this company first.");

    let fetched;
    try {
      fetched = await fetchSiteMeta(site);
    } catch (e) {
      throw new ActionError(
        `Couldn't read ${site}: ${e instanceof Error ? e.message : "fetch failed"}`
      );
    }
    const { meta, finalUrl } = fetched;
    const fetchedAt = new Date().toISOString();

    const locked = new Set(c.lockedFields);
    const fillable = (field: "oneLiner" | "description" | "logoUrl") =>
      !locked.has(field) && !c[field];

    const updates: Partial<typeof company.$inferInsert> = {};
    const sources: Record<string, unknown> = { ...c.fieldSources };
    const filled: string[] = [];
    const skippedLocked: string[] = [];
    const provenance = (provider: string) => ({ provider, url: finalUrl, fetchedAt });

    for (const [field, value] of [
      ["oneLiner", meta.description],
      ["description", meta.description],
      ["logoUrl", meta.faviconUrl],
    ] as const) {
      if (!value) continue;
      if (locked.has(field)) {
        skippedLocked.push(field);
      } else if (fillable(field)) {
        updates[field] = value;
        sources[field] = provenance("site-meta");
        filled.push(field);
      }
    }

    // Optional LLM pass — only when a key is configured, and only for fields
    // still open after the deterministic fill. A better one-liner than a raw
    // meta description, plus a sector guess constrained to the org's own list.
    let sectorGuess: string | null = null;
    if (llmEnrichmentAvailable() && meta.textExcerpt) {
      const sectors = await db
        .select({ id: sector.id, name: sector.name })
        .from(sector)
        .where(and(eq(sector.orgId, ctx.org.id), isNull(sector.archivedAt)));
      try {
        const extraction = await llmExtract({
          companyName: c.name,
          pageText: meta.textExcerpt,
          sectorNames: sectors.map((s) => s.name),
        });
        if (extraction) {
          if (extraction.oneLiner && !locked.has("oneLiner") && !c.oneLiner) {
            // The LLM one-liner supersedes the meta-description copy of this run.
            updates.oneLiner = extraction.oneLiner;
            sources.oneLiner = provenance("llm");
            if (!filled.includes("oneLiner")) filled.push("oneLiner");
          }
          sectorGuess = extraction.sectorGuess;
          if (sectorGuess) {
            const match = sectors.find((s) => s.name === sectorGuess);
            const existing = await db
              .select({ sectorId: companySector.sectorId })
              .from(companySector)
              .where(eq(companySector.companyId, c.id));
            if (match && existing.length === 0) {
              await db.insert(companySector).values({ companyId: c.id, sectorId: match.id });
              sources.sector = provenance("llm");
              filled.push("sector");
            }
          }
        }
      } catch (e) {
        // LLM failure never blocks the deterministic result.
        console.error("[enrich:llm]", e);
      }
    }

    if (filled.length > 0) {
      await db
        .update(company)
        .set({ ...updates, fieldSources: sources, updatedAt: new Date() })
        .where(eq(company.id, c.id));
    }

    revalidatePath("/applications");
    if (input.applicationId) revalidatePath(`/applications/${input.applicationId}`);

    return {
      data: { filled, skippedLocked, sectorGuess, title: meta.title },
      activity:
        filled.length > 0
          ? {
              verb: "company.enriched",
              entityType: "company",
              entityId: c.id,
              entityLabel: c.name,
              summary: `${ctx.member.displayName} enriched ${c.name} from its website (${filled.join(", ")})`,
            }
          : undefined,
    };
  },
});
