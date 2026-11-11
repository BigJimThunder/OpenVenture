import { z } from "zod";
import { aiObject, CLUB_VOICE } from "@/lib/ai";

/**
 * Screening brief: a one-screen read of an application for the member about
 * to screen it or walk into the coffee chat. Built only from what the founder
 * and members wrote — application fields and notes. Never demographics, never
 * vote rows.
 */
export const screeningBriefSchema = z.object({
  whatItIs: z.string().describe("One or two sentences: what the company does and for whom."),
  theAsk: z.string().describe("One sentence: how much they want and what it pays for."),
  strengths: z.array(z.string()).max(4).describe("Concrete positives found in the material."),
  openQuestions: z
    .array(z.string())
    .max(5)
    .describe("Questions to ask in the coffee chat — things the material leaves unanswered."),
  risks: z.array(z.string()).max(4).describe("Specific concerns, each tied to something in the material."),
});

export type ScreeningBrief = z.infer<typeof screeningBriefSchema>;

/** What we persist on application.custom.aiBrief. */
export type StoredScreeningBrief = ScreeningBrief & { generatedAt: string; model: string };

export function readStoredBrief(custom: Record<string, unknown> | null | undefined): StoredScreeningBrief | null {
  const raw = custom?.aiBrief;
  if (!raw || typeof raw !== "object") return null;
  const parsed = screeningBriefSchema
    .extend({ generatedAt: z.string(), model: z.string().default("") })
    .safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export type ScreeningBriefInput = {
  companyName: string;
  oneLiner: string | null;
  description: string | null;
  website: string | null;
  amountRequested: string | null;
  useOfFundsNarrative: string | null;
  pitchSummary: string | null;
  department: string | null;
  classYear: number | null;
  teamSize: number | null;
  campusSource: string | null;
  stageName: string | null;
  notes: { author: string; body: string }[];
  coffeeChatDebriefs: string[];
};

const SYSTEM = [
  CLUB_VOICE,
  "You write a screening brief: a short, structured read of one application for the member who is about to screen it or meet the founder for a coffee chat.",
  "Be useful, not exhaustive. Each list item is one plain sentence. Prefer fewer, sharper points over padding — return an empty list when the material gives you nothing to say.",
  "Open questions are the most valuable part: ask what a careful member would want answered before recommending a grant (who is the customer, what exists today, what the money unlocks, what happens after it is spent).",
  "Do not recommend funding or declining. Do not score the application. Do not speculate about the founder's background beyond what is written.",
].join("\n");

function line(label: string, value: string | number | null | undefined): string {
  return value == null || value === "" ? "" : `${label}: ${value}\n`;
}

export function screeningBriefPrompt(input: ScreeningBriefInput): string {
  const notes = input.notes
    .slice(0, 12)
    .map((n) => `<note author="${n.author.replace(/"/g, "'")}">\n${n.body.slice(0, 1500)}\n</note>`)
    .join("\n");
  const debriefs = input.coffeeChatDebriefs
    .slice(0, 4)
    .map((d) => `<debrief>\n${d.slice(0, 1500)}\n</debrief>`)
    .join("\n");
  return [
    "<application>",
    line("Company", input.companyName) +
      line("One-liner", input.oneLiner) +
      line("Description", input.description?.slice(0, 2000)) +
      line("Website", input.website) +
      line("Amount requested (USD)", input.amountRequested) +
      line("Use of funds", input.useOfFundsNarrative?.slice(0, 3000)) +
      line("Pitch", input.pitchSummary?.slice(0, 3000)) +
      line("Department", input.department) +
      line("Class year", input.classYear) +
      line("Team size", input.teamSize) +
      line("How they reached us", input.campusSource) +
      line("Current pipeline stage", input.stageName),
    "</application>",
    notes ? `<member_notes>\n${notes}\n</member_notes>` : "",
    debriefs ? `<coffee_chat_debriefs>\n${debriefs}\n</coffee_chat_debriefs>` : "",
    "Write the screening brief for this application.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftScreeningBrief(input: ScreeningBriefInput): Promise<ScreeningBrief | null> {
  return aiObject({
    system: SYSTEM,
    prompt: screeningBriefPrompt(input),
    schema: screeningBriefSchema,
    effort: "low",
    maxTokens: 2000,
  });
}
