import { describe, expect, it } from "vitest";
import {
  averageCheck,
  composeQuarterlyLetter,
  countWord,
  firstSentences,
  grantSentence,
  isQuietQuarter,
  parseQuarterlyContent,
  periodLabel,
  plural,
  quarterlyEmailBody,
  quarterlyPatchSchema,
  quarterTotal,
  type QuarterlyFigures,
  type QuarterlyGrant,
} from "./quarterly";

const grant = (over: Partial<QuarterlyGrant> = {}): QuarterlyGrant => ({
  id: "g1",
  applicationId: "a1",
  companyName: "GreenPlate",
  amount: "1650.00",
  useOfFundsLabel: "Design",
  paidFor: "A design freelancer for the brand and landing page.",
  why: "The founders had a working pilot in two dining halls.",
  issuedAt: "2026-10-24T15:00:00.000Z",
  ...over,
});

const figures = (over: Partial<QuarterlyFigures> = {}): QuarterlyFigures => ({
  fiscalYear: 2026,
  quarter: 2,
  start: "2026-10-01T00:00:00.000Z",
  end: "2027-01-01T00:00:00.000Z",
  asOf: "2026-11-11T12:00:00.000Z",
  inProgress: false,
  pool: { name: "FY2026 Pool", budget: "10000.00", committed: "1150.00", deployed: "5900.00", remaining: "2950.00" },
  grants: [grant(), grant({ id: "g2", companyName: "LabMate", amount: "2350.00", paidFor: null, why: null })],
  pipeline: {
    received: 12,
    funded: 2,
    declined: 5,
    inReview: 7,
    declineReasons: [
      { label: "Too early", count: 3 },
      { label: "Not a fit", count: 2 },
    ],
  },
  portfolio: {
    updates: [
      { companyName: "AquaSense", tierLabel: "Revenue", note: "First paying lab signed in October", changed: true },
      { companyName: "SplitStay", tierLabel: "Launched", note: null, changed: false },
    ],
    standing: [
      { tierLabel: "Revenue", count: 1 },
      { tierLabel: "Launched", count: 3 },
    ],
  },
  ...over,
});

const quiet = (over: Partial<QuarterlyFigures> = {}) =>
  figures({
    grants: [],
    pipeline: { received: 0, funded: 0, declined: 0, inReview: 0, declineReasons: [] },
    portfolio: { updates: [], standing: [] },
    ...over,
  });

describe("wording helpers", () => {
  it("counts in words up to one, numerals after", () => {
    expect(countWord(0)).toBe("no");
    expect(countWord(1)).toBe("one");
    expect(countWord(12)).toBe("12");
    expect(plural(1, "application")).toBe("one application");
    expect(plural(3, "company", "companies")).toBe("3 companies");
    expect(plural(0, "grant")).toBe("no grants");
  });

  it("labels the period without slipping a day", () => {
    expect(periodLabel(figures())).toBe("October 1 – December 31, 2026");
  });

  it("totals and averages with decimals, not floats", () => {
    expect(quarterTotal([{ amount: "0.10" }, { amount: "0.20" }])).toBe("0.30");
    expect(averageCheck([{ amount: "1650.00" }, { amount: "2350.00" }])).toBe("2000");
    expect(averageCheck([])).toBeNull();
  });

  it("keeps the first sentence or two of a rationale", () => {
    expect(firstSentences("Strong team. They ship. " + "And a lot more words follow here. ".repeat(12))).toBe(
      "Strong team. They ship."
    );
    expect(firstSentences(`Short. ${"A very long second sentence ".repeat(12)}.`)).toBe("Short.");
    expect(firstSentences("No full stop")).toBe("No full stop.");
    expect(firstSentences("  ")).toBeNull();
  });
});

describe("grantSentence", () => {
  it("uses the narrative, then the category, then just the date", () => {
    expect(grantSentence(grant())).toBe("Paid October 24 for a design freelancer for the brand and landing page.");
    expect(grantSentence(grant({ paidFor: null }))).toBe("Paid October 24 for design.");
    expect(grantSentence(grant({ paidFor: null, useOfFundsLabel: "Other" }))).toBe("Paid October 24.");
    expect(grantSentence(grant({ paidFor: null, useOfFundsLabel: null, issuedAt: null }))).toBe("Paid.");
  });
});

describe("composeQuarterlyLetter", () => {
  it("writes the deployment paragraph from the pool and the quarter's grants", () => {
    const letter = composeQuarterlyLetter(figures());
    expect(letter.period).toBe("FY2026 Q2 · October 1 – December 31, 2026");
    expect(letter.deployment).toBe(
      "The FY2026 Pool is $10,000. We have paid out $5,900 of it and committed a further $1,150 to grants that are approved but not yet paid, which leaves $2,950. This quarter we issued 2 grants totalling $4,000, an average of $2,000 each."
    );
    expect(letter.quiet).toBeNull();
    expect(letter.toDateNote).toBeNull();
  });

  it("handles one grant, no grants, and nothing committed", () => {
    expect(composeQuarterlyLetter(figures({ grants: [grant()] })).deployment).toContain(
      "This quarter we issued one grant of $1,650."
    );
    expect(composeQuarterlyLetter(figures({ grants: [] })).deployment).toContain("We issued no grants this quarter.");
    const pool = { name: "FY2026 Pool", budget: "10000.00", committed: "0.00", deployed: "0.00", remaining: "10000.00" };
    expect(composeQuarterlyLetter(figures({ pool })).deployment).toContain(
      "None of it has been paid out or committed yet."
    );
    expect(composeQuarterlyLetter(figures({ pool: { ...pool, deployed: "500.00", remaining: "9500.00" } })).deployment).toContain(
      "We have paid out $500 of it, which leaves $9,500."
    );
    expect(composeQuarterlyLetter(figures({ pool: null })).deployment).toContain("No grant pool is set up for FY2026");
  });

  it("writes the pipeline paragraph with singular and plural forms", () => {
    expect(composeQuarterlyLetter(figures()).pipeline).toBe(
      "We received 12 applications this quarter. We funded 2 and declined 5. 7 applications are still in review. The most common reasons for declining were too early (3) and not a fit (2)."
    );
    const one = composeQuarterlyLetter(
      figures({
        pipeline: { received: 1, funded: 0, declined: 1, inReview: 1, declineReasons: [{ label: "Too early", count: 1 }] },
      })
    );
    expect(one.pipeline).toBe(
      "We received one application this quarter. We declined one. One application is still in review. The reason recorded for the decline was too early."
    );
    const undecided = composeQuarterlyLetter(
      figures({ pipeline: { received: 3, funded: 0, declined: 0, inReview: 3, declineReasons: [] } })
    );
    expect(undecided.pipeline).toBe(
      "We received 3 applications this quarter. We have not decided any of them yet. 3 applications are still in review."
    );
  });

  it("writes portfolio moves, check-ins and the standing line", () => {
    expect(composeQuarterlyLetter(figures()).portfolio).toEqual([
      "AquaSense moved to revenue. First paying lab signed in October.",
      "SplitStay checked in, still at launched.",
      "Of the 4 companies we have funded, one is at revenue and 3 are at launched.",
    ]);
    expect(
      composeQuarterlyLetter(figures({ portfolio: { updates: [], standing: [{ tierLabel: "Launched", count: 1 }] } }))
        .portfolio
    ).toEqual([
      "No grantee changed stage this quarter, and we recorded no check-ins.",
      "Of the one company we have funded, one is at launched.",
    ]);
  });

  it("lets a partner's note override the pulled reason for a grant", () => {
    const letter = composeQuarterlyLetter(figures(), { g2: "They needed a bench to test on." });
    expect(letter.grants[0]).toMatchObject({ companyName: "GreenPlate", amount: "$1,650", why: grant().why });
    expect(letter.grants[1].why).toBe("They needed a bench to test on.");
  });

  it("says a quiet quarter was quiet instead of dressing up zeros", () => {
    expect(isQuietQuarter(quiet())).toBe(true);
    expect(isQuietQuarter(figures())).toBe(false);
    const letter = composeQuarterlyLetter(quiet());
    expect(letter.quiet).toMatch(/^This was a quiet quarter: no applications came in, no grants went out/);
    expect(letter.quiet).toContain("which leaves $2,950");
    expect(letter.table.find((r) => r.label === "Average check")).toBeUndefined();
  });

  it("notes when the quarter is still running", () => {
    expect(composeQuarterlyLetter(figures({ inProgress: true })).toDateNote).toBe(
      "This quarter runs to December 31; the figures here are as of November 11."
    );
  });

  it("builds the figures table with formatted money", () => {
    const table = composeQuarterlyLetter(figures()).table;
    expect(table).toContainEqual({ label: "FY2026 Pool budget", value: "$10,000" });
    expect(table).toContainEqual({ label: "Dollars issued this quarter", value: "$4,000" });
    expect(table).toContainEqual({ label: "Average check", value: "$2,000" });
    expect(table).toContainEqual({ label: "In review", value: "7" });
  });
});

describe("content and email", () => {
  it("parses stored content defensively and keeps patches partial", () => {
    expect(parseQuarterlyContent({ opening: 5 }).opening).toBeNull();
    expect(parseQuarterlyContent(undefined).grantNotes).toEqual({});
    expect(quarterlyPatchSchema.parse({ salutation: "Dear Dana," })).toEqual({ salutation: "Dear Dana," });
  });

  it("escapes what partners wrote", () => {
    const html = quarterlyEmailBody({
      letter: composeQuarterlyLetter(figures()),
      salutation: "Dear supporters,",
      opening: "We funded <b>two</b> teams.\n\nBoth shipped.",
      whatsNext: "",
      signoff: "The partners",
    });
    expect(html).toContain("&lt;b&gt;two&lt;/b&gt;");
    expect(html).toContain("GreenPlate, $1,650.");
    expect(html.match(/Both shipped\./g)).toHaveLength(1);
  });
});
