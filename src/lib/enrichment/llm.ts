import { z } from "zod";
import { aiConfigured, aiObject } from "@/lib/ai";

/**
 * Optional LLM enrichment pass — strictly additive on top of the deterministic
 * meta fetch. Gated on ANTHROPIC_API_KEY: when the key is unset this module
 * returns null and the feature simply doesn't exist. Each call reads one
 * homepage excerpt (~a cent per enrichment at current pricing).
 */

const ExtractionSchema = z.object({
  oneLiner: z
    .string()
    .describe(
      "A single crisp sentence (max ~15 words) saying what the company does, in plain language. No marketing superlatives."
    ),
  sectorGuess: z
    .string()
    .nullable()
    .describe(
      "The best-fitting sector from the provided list, copied verbatim, or null if none fits."
    ),
});

export type LlmExtraction = z.infer<typeof ExtractionSchema>;

export function llmEnrichmentAvailable(): boolean {
  return aiConfigured();
}

export async function llmExtract(input: {
  companyName: string;
  pageText: string;
  sectorNames: string[];
}): Promise<LlmExtraction | null> {
  // Through the app's one door to the model: same timeout, same daily
  // ceiling, and the same rule that page text is data, never instructions —
  // a homepage is written by the applicant.
  const parsed = await aiObject({
    schema: ExtractionSchema,
    system:
      "You read a company's homepage text and describe the company in one plain sentence. Use only what the text says; never invent specifics.",
    prompt: [
      `Here is the homepage text of a company called "${input.companyName.replace(/"/g, "'")}":`,
      "",
      "<homepage>",
      input.pageText.slice(0, 4000),
      "</homepage>",
      "",
      `Available sectors: ${input.sectorNames.join(", ") || "(none configured)"}`,
      "",
      "Write the one-liner and pick the sector. If the page text is too thin or",
      "generic to tell what the company does, still write the best honest one-liner",
      "you can from what's there.",
    ].join("\n"),
    effort: "low",
    maxTokens: 2000,
  });
  if (!parsed) return null;
  // Trust but verify: the guess must actually be one of the org's sectors.
  const sectorGuess =
    parsed.sectorGuess && input.sectorNames.includes(parsed.sectorGuess)
      ? parsed.sectorGuess
      : null;
  return { oneLiner: parsed.oneLiner.trim().slice(0, 300), sectorGuess };
}
