import { describe, expect, it } from "vitest";
import { ESSAY_SYSTEM, UNFUNDED_NOTE_SYSTEM, essayPrompt, essayQuestions, unfundedNotePrompt } from "./annual-report";
import type { EssayMaterial } from "@/lib/reports/annual";

const material: EssayMaterial = {
  companyName: "LabMate",
  oneLiner: "Shared inventory for university wet labs",
  founders: [{ name: "Maya Okonkwo", classYear: 2027 }],
  pitchSummary: "Labs lose reagents because nobody knows what is in the freezer.",
  grantUse: "Prototyping",
  grantNarrative: "Barcode scanners and labels",
  memoSections: [{ title: "Founder", text: "Maya ran inventory for her own lab for two years." }],
  fundingRequest: [{ title: "Team", text: "One founder, full time on this." }],
  debriefs: [{ date: "2026-09-01T00:00:00.000Z", text: "She showed us the spreadsheet she replaced." }],
  rationales: ["Knows the problem cold.", "Distribution is the open question."],
};

describe("essayPrompt", () => {
  const prompt = essayPrompt({
    orgName: "Cardinal Ventures",
    author: { name: "Sofia Alvarez", title: "Partner" },
    material,
  });

  it("gives the model the club's own words, each kind in its own block", () => {
    expect(prompt).toContain("Essay author: Sofia Alvarez, Partner");
    expect(prompt).toContain("Founders: Maya Okonkwo ’27");
    expect(prompt).toContain("<investment_memo>\nFounder:\nMaya ran inventory");
    expect(prompt).toContain("<funding_request>\nTeam:\nOne founder");
    expect(prompt).toContain("<coffee_chat_debriefs>\n2026-09-01:\nShe showed us");
    expect(prompt).toContain("<member_rationales_after_reveal>\nKnows the problem cold.");
    expect(prompt).toContain("The grant paid for: Barcode scanners and labels");
  });

  it("leaves out blocks there is no material for", () => {
    const thin = essayPrompt({
      orgName: "Cardinal Ventures",
      author: null,
      material: { ...material, memoSections: [], fundingRequest: [], debriefs: [], rationales: [], pitchSummary: null },
    });
    expect(thin).not.toContain("<investment_memo>");
    expect(thin).not.toContain("<member_rationales_after_reveal>");
    expect(thin).toContain("Essay author: (not chosen yet)");
  });

  it("tells the model to leave personal details as prompts and to stay off votes and money", () => {
    expect(ESSAY_SYSTEM).toContain("[add: how you first met Maya]");
    expect(ESSAY_SYSTEM).toContain("Never invent an anecdote");
    expect(ESSAY_SYSTEM).toContain("Do not mention votes, scores, conviction, or the grant amount");
  });
});

describe("unfundedNotePrompt", () => {
  it("carries only the company, founders and debriefs, and never the decline reason", () => {
    const prompt = unfundedNotePrompt({
      name: "Solara Labs",
      oneLiner: "DIY solar balcony kits for renters",
      founders: [{ name: "Ben Ito", classYear: null }],
      debriefs: ["Met twice; introduced them to the housing office."],
    });
    expect(prompt).toContain("Company: Solara Labs");
    expect(prompt).toContain("Founders: Ben Ito");
    expect(prompt).toContain("introduced them to the housing office");
    expect(prompt.toLowerCase()).not.toContain("decline");
    expect(UNFUNDED_NOTE_SYSTEM).toContain("Never state or imply why the application was declined");
  });
});

describe("essayQuestions", () => {
  it("asks about the founder by name", () => {
    expect(essayQuestions("Maya", "LabMate")[0]).toBe("How did you first meet Maya, and what did you notice?");
  });
});
