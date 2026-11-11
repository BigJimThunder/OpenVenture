import { aiText, CLUB_VOICE } from "@/lib/ai";
import { formatFounder, type EssayMaterial, type Founder } from "@/lib/reports/annual";

/**
 * Annual report drafts: the "Our thesis on X" essay and the short note on a
 * company the club supported but did not fund. Both are drafts a member edits
 * — the essay is signed by a person, so the model must leave the personal
 * parts as visible [add: …] prompts rather than make them up.
 *
 * Deliberately NOT in the material: demographics, vote tallies, who voted
 * how. Ballot rationales arrive only from revealed rounds, without names.
 */

const VOICE = [
  CLUB_VOICE,
  "This is for the club's annual report, which its donors and the university read.",
  "Banned words and moves: delve, landscape, robust, leverage, testament, seamless, passionate, journey, \"at the heart of\", lists of three adjectives, rhetorical questions, em-dash asides, and closing sentences that restate the paragraph. Prefer a number or a concrete observation to an adjective.",
].join("\n");

export const ESSAY_SYSTEM = [
  VOICE,
  "You are drafting an essay titled \"Our thesis on <company>\", signed by one named member of the club. It explains why the club backed these founders.",
  "Write in the first person singular, in the author's voice (\"I\", and \"we\" for the club). Four or five paragraphs, 280–420 words, plain text with a blank line between paragraphs. No headings, no bullets, no markdown, no title, no byline.",
  "Say what the club actually observed, using only the material: what the founders had built or tested when we met them, what they said in the coffee chat, what members wrote in the memo and in their rationales. Paraphrase; do not quote members.",
  "The essay is about the founders as people as much as the product. You do not know how the author met them or what the author personally saw. Wherever a personal detail belongs, leave a bracketed prompt for the author instead, written exactly like [add: how you first met Maya]. Use two to four such prompts, including one in the opening paragraph. Never invent an anecdote, a meeting, a quote, a number or a prior relationship.",
  "Do not mention votes, scores, conviction, or the grant amount. Do not describe what happened after the grant; a separate section covers that.",
].join("\n");

const block = (name: string, lines: string[]) =>
  lines.length > 0 ? `<${name}>\n${lines.join("\n\n")}\n</${name}>` : "";

const founderLine = (founders: Founder[]) => founders.map(formatFounder).join(", ") || "(unknown)";

export function essayPrompt(input: {
  orgName: string;
  author: { name: string; title: string } | null;
  material: EssayMaterial;
}): string {
  const m = input.material;
  return [
    "<company>",
    `Club: ${input.orgName}`,
    `Company: ${m.companyName}`,
    m.oneLiner ? `What it is: ${m.oneLiner}` : "",
    `Founders: ${founderLine(m.founders)}`,
    input.author ? `Essay author: ${input.author.name}, ${input.author.title}` : "Essay author: (not chosen yet)",
    m.grantUse ? `The grant paid for: ${m.grantNarrative ?? m.grantUse}` : "",
    "</company>",
    m.pitchSummary ? block("application_pitch", [m.pitchSummary.slice(0, 2000)]) : "",
    block(
      "investment_memo",
      m.memoSections.map((s) => `${s.title}:\n${s.text}`)
    ),
    block(
      "funding_request",
      m.fundingRequest.map((s) => `${s.title}:\n${s.text}`)
    ),
    block(
      "coffee_chat_debriefs",
      m.debriefs.map((d) => `${d.date.slice(0, 10)}:\n${d.text}`)
    ),
    block("member_rationales_after_reveal", m.rationales.slice(0, 8)),
    "Write the essay.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftEssay(input: Parameters<typeof essayPrompt>[0]): Promise<string | null> {
  return aiText({ system: ESSAY_SYSTEM, prompt: essayPrompt(input), effort: "medium", maxTokens: 2500 });
}

export const UNFUNDED_NOTE_SYSTEM = [
  VOICE,
  "You are drafting one short paragraph (40–70 words, plain text) for the section \"Companies we supported but didn't fund\".",
  "First sentence: what the company is, starting with its name. Then what the club did for the founders, only if the material says so; otherwise leave [add: how we helped]. End with [add: where they are now] unless the material states it.",
  "Never state or imply why the application was declined, and never mention votes or internal notes about the team.",
].join("\n");

export function unfundedNotePrompt(input: {
  name: string;
  oneLiner: string | null;
  founders: Founder[];
  debriefs: string[];
}): string {
  return [
    "<company>",
    `Company: ${input.name}`,
    input.oneLiner ? `What it is: ${input.oneLiner}` : "",
    `Founders: ${founderLine(input.founders)}`,
    "</company>",
    block("coffee_chat_debriefs", input.debriefs.map((d) => d.slice(0, 1200))),
    "Write the paragraph.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function draftUnfundedNote(input: Parameters<typeof unfundedNotePrompt>[0]): Promise<string | null> {
  return aiText({ system: UNFUNDED_NOTE_SYSTEM, prompt: unfundedNotePrompt(input), effort: "low", maxTokens: 600 });
}

/** Shown beside the essay when AI is off — the same questions the model is told to leave open. */
export function essayQuestions(founder: string, company: string): string[] {
  return [
    `How did you first meet ${founder}, and what did you notice?`,
    `What had they already built or tested before they asked us for money?`,
    `What did ${founder} say or do in the coffee chat that changed your mind, or confirmed it?`,
    `Why ${founder}, and not someone else, for ${company}?`,
    `What do you expect to be true about ${company} a year from now?`,
  ];
}
