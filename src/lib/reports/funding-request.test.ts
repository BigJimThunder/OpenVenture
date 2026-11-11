import { describe, expect, it } from "vitest";
import {
  composeFounders,
  composeRecommendation,
  finalizeBlockers,
  formatItemAmount,
  formatUsd,
  fundingRequestEmailBody,
  fundingRequestPatchSchema,
  normalizeAmount,
  parseFundingRequestContent,
  parseLineItems,
  prefillFundingRequest,
  reconcileItems,
  summarizeBallots,
  sumItems,
  voteLine,
  yearInSchool,
  type FundingRequestFacts,
} from "./funding-request";

const facts = (over: Partial<FundingRequestFacts> = {}): FundingRequestFacts => ({
  applicationId: "app",
  clubName: "LTF Ventures",
  companyName: "Super Machines",
  oneLiner: null,
  pitch: null,
  founders: "Marshall Schneider (3rd year)",
  decision: "fund",
  askedTotal: "1370.00",
  approvedTotal: "1370.00",
  approvedSource: "grant",
  useOfFundsLabel: "Hardware",
  useOfFundsNarrative: "Materials for lab experiments.",
  recommendation: "Receive $1,370 for materials for lab experiments",
  vote: null,
  memo: null,
  preparedBy: "Priya",
  preparedAt: "2026-11-11T00:00:00.000Z",
  ...over,
});

describe("money", () => {
  it("formats whole dollars without cents and keeps cents otherwise", () => {
    expect(formatUsd("1370.00")).toBe("$1,370");
    expect(formatUsd("58.5")).toBe("$58.50");
    expect(formatUsd("1234567.89")).toBe("$1,234,567.89");
    expect(formatUsd(null)).toBe("—");
    expect(formatItemAmount("260.00")).toBe("260");
    expect(formatItemAmount("58.50")).toBe("58.50");
  });

  it("normalizes typed amounts and refuses non-money", () => {
    expect(normalizeAmount("$1,370")).toBe("1370.00");
    expect(normalizeAmount("58.5")).toBe("58.50");
    expect(normalizeAmount("abc")).toBe("");
    expect(normalizeAmount("-4")).toBe("");
  });

  it("sums without float drift", () => {
    expect(sumItems([{ amount: "0.10" }, { amount: "0.20" }, { amount: "" }])).toBe("0.30");
    const owner = ["260", "58.50", "7.90", "29.90", "25.90", "27.90", "21.90", "658", "280"];
    expect(sumItems(owner.map((amount) => ({ amount })))).toBe("1370.00");
  });

  it("reconciles items against the headline figure", () => {
    expect(reconcileItems([], "1370", "the grant is").state).toBe("empty");
    expect(reconcileItems([{ amount: "1370" }], "1370.00", "the grant is").state).toBe("match");
    expect(reconcileItems([{ amount: "10" }], null, "the grant is").state).toBe("no_total");
    const off = reconcileItems([{ amount: "1000" }, { amount: "340" }], "1370.00", "the grant is");
    expect(off).toMatchObject({
      state: "mismatch",
      message: "Items add up to $1,340; the grant is $1,370.",
    });
  });
});

describe("parseLineItems", () => {
  it("reads one item per line in the obvious shapes", () => {
    const text = [
      "- Raspberry Pi 5 (4GB) – $260",
      "2. Camera Module 3: 58.50",
      "• Bentsai B10 Mini Printer ($658)",
      "$280 for the black cartridge",
      "SanDisk Ultra microSD 32GB  $27.90",
      "Dual-Band USB WiFi Adapter ..... 29.90",
    ].join("\n");
    expect(parseLineItems(text)).toEqual([
      { name: "Raspberry Pi 5 (4GB)", amount: "260.00" },
      { name: "Camera Module 3", amount: "58.50" },
      { name: "Bentsai B10 Mini Printer", amount: "658.00" },
      { name: "The black cartridge", amount: "280.00" },
      { name: "SanDisk Ultra microSD 32GB", amount: "27.90" },
      { name: "Dual-Band USB WiFi Adapter", amount: "29.90" },
    ]);
  });

  it("handles thousands separators and semicolon lists", () => {
    expect(parseLineItems("Legal filing - $1,250; Registered agent - $125")).toEqual([
      { name: "Legal filing", amount: "1250.00" },
      { name: "Registered agent", amount: "125.00" },
    ]);
  });

  it("leaves prose alone", () => {
    expect(parseLineItems("API credits and hosting through the pilot semester.")).toEqual([]);
    expect(parseLineItems("We plan to launch in 2027")).toEqual([]);
    expect(parseLineItems("")).toEqual([]);
    expect(parseLineItems(null)).toEqual([]);
  });
});

describe("founders", () => {
  const nov2026 = new Date(2026, 10, 11);
  it("turns a class year into a year in school", () => {
    expect(yearInSchool(2028, nov2026)).toBe("3rd year");
    expect(yearInSchool(2027, nov2026)).toBe("4th year");
    expect(yearInSchool(2030, nov2026)).toBe("1st year");
    expect(yearInSchool(2028, new Date(2027, 2, 1))).toBe("3rd year");
    expect(yearInSchool(2025, nov2026)).toBe("Class of 2025");
    expect(yearInSchool(null, nov2026)).toBeNull();
  });

  it("composes the founders line", () => {
    expect(
      composeFounders(
        [
          { name: "Marshall Schneider", classYear: 2028 },
          { name: "Kyle Young", classYear: 2028, school: "UCLA" },
          { name: "Sam Lee" },
        ],
        nov2026
      )
    ).toBe("Marshall Schneider (3rd year), Kyle Young (3rd year at UCLA), Sam Lee");
    expect(composeFounders([{ name: "Avery Lee", classYear: 2029, department: "Biology" }], nov2026)).toBe(
      "Avery Lee (2nd year, Biology)"
    );
  });
});

describe("composeRecommendation", () => {
  const base = { approvedTotal: "1370.00", useOfFundsLabel: "Hardware", useOfFundsNarrative: null };
  it("uses a short narrative as the purpose", () => {
    expect(
      composeRecommendation({ ...base, decision: "fund", useOfFundsNarrative: "Materials for lab experiments." })
    ).toBe("Receive $1,370 for materials for lab experiments");
  });
  it("falls back to the category, then to the bare amount", () => {
    expect(composeRecommendation({ ...base, decision: "fund" })).toBe("Receive $1,370 for hardware");
    expect(composeRecommendation({ ...base, decision: "fund", useOfFundsLabel: "Other" })).toBe("Receive $1,370");
  });
  it("is honest when there is no decision or the club declined", () => {
    expect(composeRecommendation({ ...base, decision: "pending", approvedTotal: null })).toContain("[add:");
    expect(composeRecommendation({ ...base, decision: "decline" })).toBe("Do not fund");
  });
});

describe("ballots", () => {
  it("summarizes revealed ballots", () => {
    const vote = summarizeBallots([
      { decision: "fund", conviction: 4 },
      { decision: "fund", conviction: 3 },
      { decision: "decline", conviction: 2 },
      { decision: "abstain", conviction: null },
    ]);
    expect(vote).toEqual({ fund: 2, decline: 1, abstain: 1, averageConviction: "3.0" });
    expect(voteLine(vote)).toBe("2 fund · 1 decline · 1 abstain · average conviction 3.0");
    expect(voteLine({ fund: 9, decline: 4, abstain: 0, averageConviction: null })).toBe("9 fund · 4 decline");
  });
});

describe("content", () => {
  it("falls back to an empty request on malformed content", () => {
    expect(parseFundingRequestContent({ upside: "not a list" }).upside).toEqual([]);
    expect(parseFundingRequestContent(null).rationaleFunding).toBe("");
  });

  it("a patch carries only what was sent", () => {
    expect(fundingRequestPatchSchema.parse({ team: "x" })).toEqual({ team: "x" });
  });

  it("prefills from the memo, the application and the founder's budget", () => {
    const content = prefillFundingRequest({
      memoSections: [
        { title: "Summary", text: "Tracks stock for CNC shops." },
        { title: "Team", text: "Two third-years." },
        { title: "Product & Traction", text: "Spoke to six shops." },
        { title: "Risks", text: "- Every shop is different\n- Hardware lead times" },
        { title: "Recommendation", text: "Fund the starter kit." },
      ],
      oneLiner: "ignored when the memo has a summary",
      pitch: null,
      useOfFundsNarrative: "Pi 5 - $260\nCamera - $58.50",
      cut: false,
    });
    expect(content.summary).toBe("Tracks stock for CNC shops.");
    expect(content.feasibility).toBe("Spoke to six shops.");
    expect(content.concerns).toEqual(["Every shop is different", "Hardware lead times"]);
    expect(content.rationaleFunding).toBe("Fund the starter kit.");
    expect(content.origin).toMatchObject({ summary: "memo", team: "memo", concerns: "memo" });
    expect(content.askedItems.map((i) => i.amount)).toEqual(["260.00", "58.50"]);
    expect(content.approvedItems).toHaveLength(2);
    expect(content.rationaleCuts).toBe("N/A");
  });

  it("uses the application when there is no memo, and leaves the cut rationale to a person", () => {
    const content = prefillFundingRequest({
      memoSections: [],
      oneLiner: "Stock tracking for CNC shops.",
      pitch: "Cameras and bar codes.",
      useOfFundsNarrative: "Hardware.",
      cut: true,
    });
    expect(content.summary).toBe("Stock tracking for CNC shops.\n\nCameras and bar codes.");
    expect(content.origin.summary).toBe("application");
    expect(content.rationaleCuts).toBe("");
    expect(content.askedItems).toEqual([]);
  });
});

describe("finalizeBlockers", () => {
  const ready = parseFundingRequestContent({
    rationaleFunding: "They have thought about this for a year.",
    rationaleCuts: "N/A",
    summary: "Stock tracking.",
    team: "Two third-years.",
    upside: ["Team fit - they have the experience."],
    concerns: ["Shops differ."],
  });

  it("is empty when everything required is there", () => {
    expect(finalizeBlockers(facts(), ready)).toEqual([]);
  });

  it("requires a reason when we approved less than the ask", () => {
    const cut = facts({ approvedTotal: "1000.00" });
    expect(finalizeBlockers(cut, ready).join(" ")).toContain("approved less");
    expect(finalizeBlockers(cut, { ...ready, rationaleCuts: "We left out the printer." })).toEqual([]);
  });

  it("blocks on empty fields, unreviewed drafts and a missing decision", () => {
    const blockers = finalizeBlockers(facts({ decision: "pending", approvedTotal: null }), {
      ...ready,
      team: " ",
      upside: [],
      origin: { summary: "ai", value: "ai", team: "memo" },
    });
    expect(blockers).toEqual(
      expect.arrayContaining([
        "No fund decision is recorded yet. Record the decision first.",
        "There is no approved amount yet. Propose the grant first.",
        "Team is empty.",
        "Add at least one area of upside.",
      ])
    );
    expect(blockers.at(-1)).toContain("2 AI drafts are unreviewed: Company summary, Value");
  });
});

describe("email", () => {
  it("escapes member text and shows both totals", () => {
    const html = fundingRequestEmailBody(
      facts(),
      parseFundingRequestContent({
        summary: "<script>alert(1)</script>",
        askedItems: [{ id: "a", name: "Pi & camera", amount: "260.00" }],
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Pi &amp; camera");
    expect(html).toContain("Asked: $1,370");
    expect(html).toContain("Approved: $1,370");
  });
});
