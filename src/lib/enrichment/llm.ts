import { z } from "zod";
import { AI_MODEL } from "@/lib/ai";

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
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function llmExtract(input: {
  companyName: string;
  pageText: string;
  sectorNames: string[];
}): Promise<LlmExtraction | null> {
  if (!llmEnrichmentAvailable()) return null;

  // Dynamic imports keep the SDK out of every other server bundle.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: AI_MODEL,
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          `Here is the homepage text of a company called "${input.companyName}":`,
          "",
          "<homepage>",
          input.pageText.slice(0, 4000),
          "</homepage>",
          "",
          `Available sectors: ${input.sectorNames.join(", ") || "(none configured)"}`,
          "",
          "Write the one-liner and pick the sector. If the page text is too thin or",
          "generic to tell what the company does, still write the best honest one-liner",
          "you can from what's there — never invent specifics.",
        ].join("\n"),
      },
    ],
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) return null;
  // Trust but verify: the guess must actually be one of the org's sectors.
  const sectorGuess =
    parsed.sectorGuess && input.sectorNames.includes(parsed.sectorGuess)
      ? parsed.sectorGuess
      : null;
  return { oneLiner: parsed.oneLiner.trim(), sectorGuess };
}
