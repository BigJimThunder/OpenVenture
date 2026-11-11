import { describe, expect, it } from "vitest";
import {
  buildMemoDraftPrompt,
  isAiDraft,
  matchDraftToSections,
  paragraphsToTiptap,
  type MemoDraftMaterial,
} from "./memo-draft";

const material: MemoDraftMaterial = {
  companyName: "Lumen Labs",
  oneLiner: "Cheap spectrometers for teaching labs",
  description: null,
  websiteUrl: null,
  amountRequested: "1500.00",
  useOfFunds: "Prototype parts",
  pitchSummary: null,
  team: {
    applicantName: "Ada Park",
    department: "Physics",
    major: null,
    classYear: 2027,
    teamSize: 2,
    teamComposition: null,
  },
  screening: [{ criterion: "Team", average: 4.25, scorers: 4 }],
  coffeeChats: [{ debrief: "Sharp on the hardware.", verdict: "advance", attendeeNotes: ["Would fund"] }],
  notes: ["Met at demo day"],
};

describe("buildMemoDraftPrompt", () => {
  const prompt = buildMemoDraftPrompt(material, [
    { title: "Team", guidance: "Who are they?" },
    { title: "Risks", guidance: null },
  ]);

  it("includes the application, averaged scores, debriefs and the requested sections", () => {
    expect(prompt).toContain("<company>\nLumen Labs\n</company>");
    expect(prompt).toContain("Team: 4.3 / 5 (4 scorers)");
    expect(prompt).toContain("Coffee chat 1 — verdict: advance");
    expect(prompt).toContain("Attendee note: Would fund");
    expect(prompt).toContain('<section title="Team">Who are they?</section>');
    expect(prompt).toContain('<section title="Risks"></section>');
  });

  it("omits fields the club doesn't have instead of sending empty tags", () => {
    expect(prompt).not.toContain("<description>");
    expect(prompt).not.toContain("<website>");
  });
});

describe("paragraphsToTiptap", () => {
  it("builds a marked Tiptap doc with a plain-text mirror and word count", () => {
    const out = paragraphsToTiptap(["  First   one. ", "", "Second."]);
    expect(out?.contentText).toBe("First one.\n\nSecond.");
    expect(out?.wordCount).toBe(3);
    expect(isAiDraft(out?.contentJson)).toBe(true);
    expect(out?.contentJson.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "First one." }] },
      { type: "paragraph", content: [{ type: "text", text: "Second." }] },
    ]);
  });

  it("returns null when there is nothing to insert", () => {
    expect(paragraphsToTiptap(["  ", ""])).toBeNull();
  });
});

describe("matchDraftToSections", () => {
  const sections = [
    { id: "a", title: "Team" },
    { id: "b", title: "Risks" },
  ];

  it("matches by title, ignoring case, and drops invented, duplicate and blank sections", () => {
    const matched = matchDraftToSections(
      {
        sections: [
          { title: "team", paragraphs: ["Two physics students."] },
          { title: "Team", paragraphs: ["A second take."] },
          { title: "Market", paragraphs: ["Not asked for."] },
          { title: "Risks", paragraphs: [" "] },
        ],
      },
      sections
    );
    expect(matched.map((m) => m.section.id)).toEqual(["a"]);
    expect(matched[0].content.contentText).toBe("Two physics students.");
  });
});
