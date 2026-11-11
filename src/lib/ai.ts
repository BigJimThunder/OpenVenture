import type { z } from "zod";

/**
 * The one door to Claude. Every AI feature in the app — memo drafts,
 * screening briefs, decline letters, duplicate checks, enrichment — calls
 * `aiObject` (schema-validated JSON) or `aiText` from here.
 *
 * AI is strictly optional. With no ANTHROPIC_API_KEY (or with the club's AI
 * switch off) `aiConfigured()` is false, every helper returns null, and the UI
 * hides its AI controls — nothing else in the app depends on a model call.
 *
 * Ground rules for callers:
 *  - Output is always a DRAFT a member reviews; never write model output
 *    straight into a decision, a vote, or an email that sends itself.
 *  - Never send demographics or vote rows to the model.
 */

export const AI_MODEL = "claude-opus-5-5";

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type Effort = "low" | "medium" | "high";

type BaseInput = {
  /** Stable instructions: role, house style, constraints. */
  system: string;
  /** The material and the ask. Wrap source material in XML-ish tags. */
  prompt: string;
  /** `low` for extraction/classification, `medium` for drafting. */
  effort?: Effort;
  maxTokens?: number;
};

async function client() {
  // Dynamic import keeps the SDK out of every other server bundle.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // Server actions should fail fast rather than hang a button for minutes.
  return new Anthropic({ timeout: 90_000, maxRetries: 1 });
}

/**
 * Structured output validated against `schema`. Returns null when AI is not
 * configured, the model declines, or the response doesn't fit the schema —
 * callers treat null as "no draft available" and carry on.
 */
export async function aiObject<S extends z.ZodType>(
  input: BaseInput & { schema: S }
): Promise<z.output<S> | null> {
  if (!aiConfigured()) return null;
  try {
    const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
    const anthropic = await client();
    const response = await anthropic.messages.parse({
      model: AI_MODEL,
      max_tokens: input.maxTokens ?? 8000,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: {
        effort: input.effort ?? "low",
        format: zodOutputFormat(input.schema),
      },
    });
    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
    return (response.parsed_output as z.output<S> | null) ?? null;
  } catch (e) {
    console.error("[ai] structured call failed", e);
    return null;
  }
}

/** Plain-text output (letters, summaries). Null on any failure. */
export async function aiText(input: BaseInput): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const anthropic = await client();
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: input.maxTokens ?? 8000,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: { effort: input.effort ?? "medium" },
    });
    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.error("[ai] text call failed", e);
    return null;
  }
}

/** House voice shared by every drafting prompt. */
export const CLUB_VOICE = [
  "You are helping a student-run venture club that gives small non-dilutive grants ($200–$4,000) to student founders. The club takes no equity.",
  "Write the way a careful analyst writes: dry, specific, first-person plural, no marketing voice, no exclamation points, no superlatives.",
  "Use only facts present in the material you are given. If something is unknown, say it is unknown or leave it as an open question — never invent numbers, names, traction or quotes.",
  "Your output is a draft that a member will edit before anyone relies on it.",
].join("\n");
