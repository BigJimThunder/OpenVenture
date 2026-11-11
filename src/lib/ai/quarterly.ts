import { z } from "zod";
import { CLUB_VOICE } from "@/lib/ai";
import type { QuarterlyLetter, QuarterlyProseField } from "@/lib/reports/quarterly";
import { REPORT_VOICE } from "./funding-request";

/**
 * Drafts for the two paragraphs of the quarterly letter that a person writes.
 * The material is the letter's own composed sentences and figures table —
 * aggregate numbers and company names, nothing per-member and no vote rows.
 */

export const quarterlyDraftSchema = z.object({
  opening: z.string(),
  whatsNext: z.string(),
});
export type QuarterlyDraft = z.infer<typeof quarterlyDraftSchema>;

export const QUARTERLY_SYSTEM = [
  CLUB_VOICE,
  REPORT_VOICE,
  "You are drafting two short passages of the club's quarterly letter to the donors and advisors who fund its grant pool. The rest of the letter is already written from the figures.",
  "opening: one or two short paragraphs saying what happened this quarter that a donor would want to hear first. Start with the fact, not with a greeting or a statement about the letter.",
  "whatsNext: one short paragraph on what the club will do next quarter. Where the material gives no plan, write bracketed prompts such as \"[add: the next application deadline]\" rather than guessing.",
  "Use only the quarter's material. Do not repeat the figures table. Separate paragraphs with a blank line. Return an empty string for a passage you were not asked for.",
].join("\n");

export function buildQuarterlyPrompt(input: {
  clubName: string;
  mission: string;
  letter: QuarterlyLetter;
  fields: QuarterlyProseField[];
  /** Plain text of what the partners already wrote in the other passage. */
  alreadyWritten: string;
}): string {
  const { letter } = input;
  return [
    `<club name=${JSON.stringify(input.clubName)}>${input.mission.trim()}</club>`,
    `<period>${letter.period}</period>`,
    letter.toDateNote ? `<note>${letter.toDateNote}</note>` : "",
    letter.quiet
      ? `<quarter>\n${letter.quiet}\n</quarter>`
      : [
          `<deployment>\n${letter.deployment}\n</deployment>`,
          `<grants>\n${letter.grants
            .map((g) => `${g.companyName}, ${g.amount}. ${g.sentence}${g.why ? ` ${g.why}` : ""}`)
            .join("\n")}\n</grants>`,
          `<pipeline>\n${letter.pipeline}\n</pipeline>`,
          `<portfolio>\n${letter.portfolio.join("\n")}\n</portfolio>`,
        ].join("\n"),
    `<figures>\n${letter.table.map((r) => `${r.label}: ${r.value}`).join("\n")}\n</figures>`,
    input.alreadyWritten.trim() ? `<already_written>\n${input.alreadyWritten.trim()}\n</already_written>` : "",
    `Draft: ${input.fields.join(", ")}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
