import { z } from "zod";
import { CLUB_VOICE } from "@/lib/ai";

/**
 * "Draft from application": a first pass at each empty memo section, built
 * only from what the club already has on file. Pure — no DB, no model call —
 * so the prompt and the Tiptap conversion are unit-tested.
 *
 * Deliberately NOT in the material: vote rows and demographics. Screening
 * scores arrive as per-criterion averages, never per member.
 */

export const memoDraftSchema = z.object({
  sections: z.array(
    z.object({
      /** Must match one of the requested section titles exactly. */
      title: z.string(),
      paragraphs: z.array(z.string()),
    })
  ),
});
export type MemoDraft = z.infer<typeof memoDraftSchema>;

export type MemoDraftMaterial = {
  companyName: string;
  oneLiner: string | null;
  description: string | null;
  websiteUrl: string | null;
  amountRequested: string | null;
  useOfFunds: string | null;
  pitchSummary: string | null;
  team: {
    applicantName: string | null;
    department: string | null;
    major: string | null;
    classYear: number | null;
    teamSize: number | null;
    teamComposition: string | null;
  };
  /** Averages only. */
  screening: { criterion: string; average: number; scorers: number }[];
  coffeeChats: {
    debrief: string | null;
    verdict: string | null;
    attendeeNotes: string[];
  }[];
  notes: string[];
};

export type MemoDraftSection = { title: string; guidance: string | null };

export const MEMO_DRAFT_SYSTEM = [
  CLUB_VOICE,
  "You are drafting sections of an internal grant memo that members will read before voting.",
  "Write two to four short paragraphs per section. Plain prose: no headings, no bullet characters, no markdown.",
  "Where the material is thin, say what the club still needs to find out rather than padding. End a section with open questions when there are real ones.",
  "Do not recommend a vote outcome and do not state an award amount unless the section's guidance asks for a recommendation — and then frame it as the author's draft view.",
  "Return one entry per requested section, using each section title exactly as given.",
].join("\n");

const tag = (name: string, value: string | number | null | undefined) =>
  value == null || value === "" ? "" : `<${name}>\n${String(value).trim()}\n</${name}>\n`;

export function buildMemoDraftPrompt(
  material: MemoDraftMaterial,
  sections: MemoDraftSection[]
): string {
  const team = [
    material.team.applicantName && `Applicant: ${material.team.applicantName}`,
    material.team.department && `Department: ${material.team.department}`,
    material.team.major && `Major: ${material.team.major}`,
    material.team.classYear && `Class year: ${material.team.classYear}`,
    material.team.teamSize && `Team size: ${material.team.teamSize}`,
    material.team.teamComposition && `Team: ${material.team.teamComposition}`,
  ]
    .filter(Boolean)
    .join("\n");

  const screening = material.screening
    .map((s) => `${s.criterion}: ${s.average.toFixed(1)} / 5 (${s.scorers} scorer${s.scorers === 1 ? "" : "s"})`)
    .join("\n");

  const chats = material.coffeeChats
    .map((c, i) =>
      [
        `Coffee chat ${i + 1}${c.verdict ? ` — verdict: ${c.verdict}` : ""}`,
        c.debrief?.trim(),
        ...c.attendeeNotes.map((n) => `Attendee note: ${n.trim()}`),
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");

  return [
    "<application>",
    tag("company", material.companyName),
    tag("one_liner", material.oneLiner),
    tag("description", material.description),
    tag("website", material.websiteUrl),
    tag("amount_requested_usd", material.amountRequested),
    tag("use_of_funds", material.useOfFunds),
    tag("pitch_summary", material.pitchSummary),
    tag("team", team),
    "</application>",
    tag("screening_averages", screening),
    tag("coffee_chat_debriefs", chats),
    tag("member_notes", material.notes.map((n) => `- ${n.trim()}`).join("\n")),
    "Draft these memo sections:",
    "<sections>",
    ...sections.map(
      (s) => `<section title=${JSON.stringify(s.title)}>${s.guidance?.trim() ?? ""}</section>`
    ),
    "</sections>",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Marker stored on the Tiptap doc; Tiptap drops unknown keys on the first edit. */
export const AI_DRAFT_KEY = "aiDraft";

export function isAiDraft(contentJson: Record<string, unknown> | null | undefined): boolean {
  return contentJson?.[AI_DRAFT_KEY] === true;
}

export function paragraphsToTiptap(paragraphs: string[]): {
  contentJson: Record<string, unknown>;
  contentText: string;
  wordCount: number;
} | null {
  const clean = paragraphs.map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (clean.length === 0) return null;
  const contentText = clean.join("\n\n");
  return {
    contentJson: {
      type: "doc",
      [AI_DRAFT_KEY]: true,
      content: clean.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
    },
    contentText,
    wordCount: contentText.split(/\s+/).filter(Boolean).length,
  };
}

/**
 * Pair model output with the sections we asked for. Titles are matched
 * case-insensitively; anything the model invented, repeated or left blank is
 * dropped.
 */
export function matchDraftToSections<S extends { id: string; title: string }>(
  draft: MemoDraft,
  emptySections: S[]
): { section: S; content: NonNullable<ReturnType<typeof paragraphsToTiptap>> }[] {
  const norm = (t: string) => t.trim().toLowerCase();
  const byTitle = new Map(emptySections.map((s) => [norm(s.title), s]));
  const out: { section: S; content: NonNullable<ReturnType<typeof paragraphsToTiptap>> }[] = [];
  for (const d of draft.sections) {
    const section = byTitle.get(norm(d.title));
    if (!section) continue;
    const content = paragraphsToTiptap(d.paragraphs);
    if (!content) continue;
    byTitle.delete(norm(d.title));
    out.push({ section, content });
  }
  return out;
}
