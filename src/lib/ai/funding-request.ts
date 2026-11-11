import { z } from "zod";
import { CLUB_VOICE } from "@/lib/ai";
import {
  FR_FIELDS,
  FR_FIELD_META,
  formatUsd,
  type FundingRequestContent,
  type FundingRequestFacts,
  type FundingRequestField,
} from "@/lib/reports/funding-request";

/**
 * Drafts for the subjective parts of a funding request. Pure — no DB, no
 * model call — so the prompt is unit-testable.
 *
 * In the material: the application, the memo, coffee-chat debriefs, notes and
 * the rationales of REVEALED ballots without names. Never in the material:
 * demographics, unrevealed votes, who voted which way.
 */

/** House rules for any prose the app drafts for a report. */
export const REPORT_VOICE = [
  "Write plainly and specifically, in the first-person plural, the way a careful student analyst writes to a donor who reads every word.",
  "Prefer numbers and names to adjectives. Short declarative sentences.",
  'Do not use these words or moves: "delve", "landscape", "robust", "leverage", "testament", "seamless", "at the heart of"; lists of three for rhythm; rhetorical questions; an em-dash aside in every sentence; a closing sentence that restates the paragraph; stacked hedges.',
  'If a fact the reader would expect is not in the material, write a visible prompt in square brackets — for example "[add: how the founders met]" — instead of inventing it.',
].join("\n");

export const fundingRequestDraftSchema = z.object({
  rationaleFunding: z.string(),
  rationaleCuts: z.string(),
  summary: z.string(),
  team: z.string(),
  feasibility: z.string(),
  impact: z.string(),
  value: z.string(),
  upside: z.array(z.string()),
  concerns: z.array(z.string()),
});
export type FundingRequestDraft = z.infer<typeof fundingRequestDraftSchema>;

export const FUNDING_REQUEST_SYSTEM = [
  CLUB_VOICE,
  REPORT_VOICE,
  "You are drafting parts of a one-page funding request: the memo the club sends to the person who signs off on a grant after the club has voted to fund a company.",
  "The reader has not met the founders. Each field is two to five sentences of plain prose with no headings, bullets or markdown. Upside and concerns are lists of one to three entries; each entry opens with a short label, then a hyphen, then two or three sentences.",
  "Fill only the fields you are asked for and return an empty string or empty list for the rest.",
].join("\n");

const FIELD_BRIEF: Record<FundingRequestField, string> = {
  rationaleFunding: "Why the club is funding this ask: what convinced the room and what the money unlocks.",
  rationaleCuts: "Why the club approved less than the founder asked for, item by item where the line items show it.",
  summary: "What the company does first, who it is for, and where the founders want to take it.",
  team: "Who the founders are, what they study, and what they have done that bears on this problem.",
  feasibility: "Evidence they can do the next step: conversations had, things built, what the grant makes possible.",
  impact: "What this specific check moves the company from and to.",
  value: "The size and shape of the problem, with figures only when the material gives them.",
  upside: "If this works, why. Draw on what fund voters wrote.",
  concerns: "If this fails, why. Draw on what decline voters wrote and the memo's risks.",
};

const tag = (name: string, value: string | null | undefined) =>
  value?.trim() ? `<${name}>\n${value.trim()}\n</${name}>` : "";

export type FundingRequestMaterial = {
  facts: FundingRequestFacts;
  content: FundingRequestContent;
  thesis: string;
  memoSections: { title: string; text: string }[];
  coffeeChats: { debrief: string | null; notes: string[] }[];
  notes: string[];
  /** Rationales from revealed ballots, names removed. */
  fundRationales: string[];
  declineRationales: string[];
};

export function buildFundingRequestPrompt(
  material: FundingRequestMaterial,
  fields: FundingRequestField[]
): string {
  const { facts, content } = material;
  const items = (rows: { name: string; amount: string }[]) =>
    rows.map((r) => `${r.name}: ${formatUsd(r.amount)}`).join("\n");
  const written = FR_FIELDS.filter((f) => !fields.includes(f))
    .map((f) => {
      const value = content[f];
      const text = Array.isArray(value) ? value.join("\n") : value;
      return text.trim() ? `<${f}>\n${text.trim()}\n</${f}>` : "";
    })
    .filter(Boolean)
    .join("\n");

  return [
    tag("club_thesis", material.thesis),
    "<company>",
    tag("name", facts.companyName),
    tag("one_liner", facts.oneLiner),
    tag("pitch", facts.pitch),
    tag("founders", facts.founders),
    "</company>",
    "<decision>",
    tag("recommendation", facts.recommendation),
    tag("asked_usd", facts.askedTotal),
    tag("approved_usd", facts.approvedTotal),
    tag("use_of_funds", facts.useOfFundsNarrative),
    tag("asked_items", items(content.askedItems)),
    tag("approved_items", items(content.approvedItems)),
    "</decision>",
    tag("memo", material.memoSections.map((s) => `## ${s.title}\n${s.text.trim()}`).join("\n\n")),
    tag(
      "coffee_chats",
      material.coffeeChats.map((c) => [c.debrief, ...c.notes].filter(Boolean).join("\n")).join("\n\n")
    ),
    tag("member_notes", material.notes.map((n) => `- ${n.trim()}`).join("\n")),
    tag("fund_voter_rationales", material.fundRationales.map((r) => `- ${r}`).join("\n")),
    tag("decline_voter_rationales", material.declineRationales.map((r) => `- ${r}`).join("\n")),
    tag("already_written", written),
    "Draft these fields. Do not repeat what is under already_written.",
    "<fields>",
    ...fields.map((f) => `<field name="${f}" label=${JSON.stringify(FR_FIELD_META[f].label)}>${FIELD_BRIEF[f]}</field>`),
    "</fields>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Keep only the requested fields the model actually filled. */
export function pickDraftFields(
  draft: FundingRequestDraft,
  fields: FundingRequestField[]
): Partial<FundingRequestDraft> {
  const out: Partial<FundingRequestDraft> = {};
  for (const field of fields) {
    if (field === "upside" || field === "concerns") {
      const entries = draft[field].map((s) => s.trim()).filter(Boolean).slice(0, 6);
      if (entries.length > 0) out[field] = entries;
    } else if (draft[field].trim()) {
      out[field] = draft[field].trim();
    }
  }
  return out;
}

// ——— Line items ———

export const lineItemsSchema = z.object({
  items: z.array(z.object({ name: z.string(), amount: z.string() })),
});

export const LINE_ITEMS_SYSTEM = [
  "You extract a budget from a student founder's description of how they will use a grant.",
  "Return one entry per purchasable item with its dollar amount as a plain decimal string (no currency symbol, no commas).",
  "Only include items that have an explicit amount in the text. Do not estimate, split or total anything. If there are no priced items, return an empty list.",
].join("\n");

export const buildLineItemsPrompt = (narrative: string) =>
  `<use_of_funds>\n${narrative.trim()}\n</use_of_funds>\nList the priced items.`;
