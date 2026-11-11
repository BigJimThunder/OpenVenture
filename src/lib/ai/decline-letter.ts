import { aiText, CLUB_VOICE } from "@/lib/ai";

/**
 * Decline letter draft. A member always reads, edits and chooses to send it —
 * this never sends anything itself.
 */
export type DeclineLetterInput = {
  orgName: string;
  companyName: string;
  founderFirstName: string;
  /** Human label, e.g. "Too early". */
  reasonLabel: string;
  /** The member's internal note on why. May be blunt; the letter must not be. */
  note: string | null;
  oneLiner: string | null;
  amountRequested: string | null;
};

const SYSTEM = [
  CLUB_VOICE,
  "You draft the email a student venture club sends a student founder when it has decided not to fund their grant application.",
  "The letter is kind, direct and short: 90–150 words, three or four short paragraphs, plain text with a blank line between paragraphs. No subject line, no markdown, no bullet points.",
  "Structure: greet by first name; thank them and say plainly, in the first paragraph, that we are not funding this application; give one honest, specific reason grounded in the decline reason and the member's note, phrased constructively and without repeating internal wording that would sting; say what would change our answer or that they are welcome to reapply, only if the reason makes that true; sign off with the club name on its own line after an em dash.",
  "Never invent feedback, numbers or meeting details that are not in the material. Never mention votes, scores, or what individual members said. Never promise future funding. Do not apologise more than once.",
].join("\n");

export function declineLetterPrompt(input: DeclineLetterInput): string {
  return [
    "<decision>",
    `Club: ${input.orgName}`,
    `Company: ${input.companyName}`,
    `Founder first name: ${input.founderFirstName || "(unknown — open with \"Hi,\")"}`,
    input.oneLiner ? `What they are building: ${input.oneLiner}` : "",
    input.amountRequested ? `Amount requested (USD): ${input.amountRequested}` : "",
    `Decline reason: ${input.reasonLabel}`,
    input.note ? `Member's internal note (context only — do not quote): ${input.note.slice(0, 1500)}` : "",
    "</decision>",
    "Write the letter.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftDeclineLetter(input: DeclineLetterInput): Promise<string | null> {
  return aiText({
    system: SYSTEM,
    prompt: declineLetterPrompt(input),
    effort: "low",
    maxTokens: 1200,
  });
}
