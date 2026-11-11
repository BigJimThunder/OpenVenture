import { describe, expect, it } from "vitest";
import { docToText, textToDoc } from "@/lib/rich-text";
import {
  annualContentSchema,
  annualProgress,
  annualSummary,
  applyAnnualOps,
  buildPublication,
  computeActivityStats,
  computeFacts,
  countPrompts,
  currentFiscalYear,
  fiscalYearLabel,
  fiscalYearPhase,
  fiscalYearWindow,
  isImageUrl,
  meetingsAsStats,
  opAllowedForAuthor,
  parseAnnualContent,
  parseRecipients,
  progressFromOutcomes,
  publicationToMarkdown,
  spreadStatus,
  syncAnnualContent,
  type ActivityRows,
  type AnnualDerived,
  type DerivedCompany,
  type EssayMaterial,
} from "./annual";

const d = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe("fiscal year", () => {
  it("starts on the first of the start month and runs twelve months", () => {
    const w = fiscalYearWindow(2026, 7);
    expect(w.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2027-07-01T00:00:00.000Z");
  });

  it("puts a date before the start month in the previous fiscal year", () => {
    expect(currentFiscalYear(7, d("2026-06-30"))).toBe(2025);
    expect(currentFiscalYear(7, d("2026-07-01"))).toBe(2026);
    expect(currentFiscalYear(1, d("2026-03-01"))).toBe(2026);
  });

  it("knows whether a year is ahead, running or closed", () => {
    expect(fiscalYearPhase(2026, 7, d("2026-06-30"))).toBe("upcoming");
    expect(fiscalYearPhase(2026, 7, d("2026-11-11"))).toBe("running");
    expect(fiscalYearPhase(2026, 7, d("2027-07-01"))).toBe("ended");
  });

  it("labels a straddling year with both years and a calendar year with one", () => {
    expect(fiscalYearLabel(2026, 7)).toBe("2026–27");
    expect(fiscalYearLabel(2099, 9)).toBe("2099–00");
    expect(fiscalYearLabel(2026, 1)).toBe("2026");
  });
});

const window = fiscalYearWindow(2026, 7);

const rows: ActivityRows = {
  applications: [
    { appliedAt: d("2026-08-01"), decidedAt: d("2026-08-11"), status: "funded" },
    { appliedAt: d("2026-09-01"), decidedAt: d("2026-09-21"), status: "declined" },
    { appliedAt: d("2026-10-01"), decidedAt: null, status: "open" },
    // Applied last year, decided this year: not "received", but counts toward the median.
    { appliedAt: d("2026-06-01"), decidedAt: d("2026-07-01"), status: "declined" },
    { appliedAt: d("2025-09-01"), decidedAt: d("2025-10-01"), status: "funded" },
  ],
  coffeeChats: [{ happenedAt: d("2026-08-05") }, { happenedAt: null }, { happenedAt: d("2026-01-05") }],
  memos: [{ createdAt: d("2026-08-08") }, { createdAt: d("2025-08-08") }],
  voteRounds: [
    { status: "revealed", heldAt: d("2026-08-10") },
    { status: "open", heldAt: d("2026-11-10") },
    { status: "closed", heldAt: d("2026-09-20") },
  ],
  grants: [
    { companyId: "a", status: "reconciled", amountAwarded: "1900.00", approvedAt: d("2026-07-20"), issuedAt: d("2026-07-31") },
    { companyId: "a", status: "issued", amountAwarded: "100.50", approvedAt: d("2026-09-01"), issuedAt: d("2026-09-02") },
    { companyId: "b", status: "approved", amountAwarded: "1150.00", approvedAt: d("2026-10-30"), issuedAt: null },
    { companyId: "c", status: "proposed", amountAwarded: "2400.00", approvedAt: null, issuedAt: null },
    { companyId: "d", status: "reconciled", amountAwarded: "2650.00", approvedAt: d("2026-05-20"), issuedAt: d("2026-06-01") },
  ],
  meetings: [
    { status: "completed", scheduledAt: d("2026-09-11") },
    { status: "scheduled", scheduledAt: d("2026-11-13") },
  ],
  pool: { totalBudget: "10000.00", rolloverFromPrior: "0.00" },
  poolGrants: [
    { status: "reconciled", amountAwarded: "1900.00" },
    { status: "issued", amountAwarded: "100.50" },
    { status: "approved", amountAwarded: "1150.00" },
  ],
};

describe("computeActivityStats", () => {
  const stats = computeActivityStats(rows, window);

  it("counts only what happened inside the fiscal year", () => {
    expect(stats.applications.value).toBe("3");
    expect(stats.coffeeChats.value).toBe("1");
    expect(stats.coffeeChats.label).toBe("coffee chat with a founder");
    expect(stats.memos.value).toBe("1");
    expect(stats.meetings.value).toBe("1");
  });

  it("counts a vote only once the round has closed", () => {
    expect(stats.votes.value).toBe("2");
  });

  it("counts funded companies once, ignores proposals, and sums paid grants without float drift", () => {
    expect(stats.companiesFunded.value).toBe("2");
    expect(stats.dollarsDeployed.value).toBe("$2,001");
  });

  it("reports the share of the pool that has actually been paid", () => {
    expect(stats.poolShare.value).toBe("20%");
  });

  it("takes the median over applications decided in the year", () => {
    // 10, 20 and 30 days.
    expect(stats.medianDaysToDecision.value).toBe("20");
  });

  it("leaves a stat empty rather than inventing a zero when there is nothing to compute it from", () => {
    const empty = computeActivityStats({ ...rows, applications: [], pool: null, poolGrants: [] }, window);
    expect(empty.poolShare.value).toBeNull();
    expect(empty.medianDaysToDecision.value).toBeNull();
    expect(empty.applications.value).toBe("0");
  });
});

describe("computeFacts", () => {
  const base = {
    label: "2026–27",
    inProgress: false,
    pool: { totalBudget: "10000.00", rolloverFromPrior: "850.00" },
    poolGrants: [
      { status: "reconciled" as const, amountAwarded: "5900.00" },
      { status: "approved" as const, amountAwarded: "1150.00" },
    ],
    declineReasons: [
      { label: "Too early", count: 3 },
      { label: "Team concerns", count: 1 },
    ],
    departments: [
      { label: "Computer Science", count: 7 },
      { label: "Economics", count: 5 },
      { label: "Classics", count: 2 },
    ],
  };

  it("states the budget from the ledger", () => {
    const fact = computeFacts(base).find((f) => f.id === "budget")!;
    expect(fact.text).toBe("We committed $7,050 of the $10,850 pool (65%), leaving $3,800 unspent.");
  });

  it("says so when the whole pool was used", () => {
    const fact = computeFacts({ ...base, poolGrants: [{ status: "issued", amountAwarded: "10850.00" }] })[0];
    expect(fact.text).toBe("We used the entire $10,850 pool for 2026–27.");
  });

  it("breaks declines down by reason", () => {
    expect(computeFacts(base).find((f) => f.id === "declines")!.text).toBe(
      "We declined 4 applications: 3 too early and 1 team concerns."
    );
  });

  it("never names a department with fewer than five applicants", () => {
    const text = computeFacts(base).find((f) => f.id === "departments")!.text;
    expect(text).toContain("Computer Science (7)");
    expect(text).not.toContain("Classics");
    expect(computeFacts({ ...base, departments: [{ label: "Classics", count: 4 }] }).some((f) => f.id === "departments")).toBe(false);
  });
});

const company = (over: Partial<DerivedCompany> = {}): DerivedCompany => ({
  companyId: "co-1",
  applicationId: "app-1",
  name: "LabMate",
  oneLiner: "Shared inventory for university wet labs",
  logoUrl: null,
  founders: [{ name: "Maya Okonkwo", classYear: 2027 }],
  grantTotal: "2350.00",
  grantUse: "Prototyping",
  grantNarrative: null,
  grantedAt: "2026-09-19T00:00:00.000Z",
  inFiscalYear: true,
  outcomeTier: "raised_round",
  updates: [{ tier: "raised_round", note: "Closed a $150k pre-seed", recordedAt: "2026-10-20T00:00:00.000Z" }],
  defaultAuthorId: "m-analyst",
  ...over,
});

const derived = (over: Partial<AnnualDerived> = {}): AnnualDerived => ({
  fiscalYear: 2026,
  label: "2026–27",
  window: { start: window.start.toISOString(), end: window.end.toISOString() },
  inProgress: false,
  computedAt: "2027-07-02T00:00:00.000Z",
  org: { name: "Cardinal Ventures", schoolName: null, logoUrl: null },
  stats: computeActivityStats(rows, window),
  members: [
    { id: "m-admin", name: "Priya Raman", role: "admin", title: "President", classYear: 2027, bio: "Runs the fund.", avatarUrl: null },
    { id: "m-partner", name: "Sofia Alvarez", role: "partner", title: null, classYear: 2028, bio: null, avatarUrl: null },
    { id: "m-analyst", name: "Daniel Park", role: "analyst", title: null, classYear: 2029, bio: null, avatarUrl: null },
    { id: "m-reader", name: "Alex Fontaine", role: "read_only", title: null, classYear: null, bio: null, avatarUrl: null },
  ],
  companies: [company(), company({ companyId: "co-old", name: "SplitStay", inFiscalYear: false, outcomeTier: null, updates: [] })],
  unfunded: [
    { applicationId: "app-9", name: "Solara Labs", oneLiner: "DIY solar balcony kits for renters.", founders: [{ name: "Ben Ito", classYear: null }], status: "declined" },
  ],
  meetings: [
    { title: "Pitch practice", kind: "training", date: "2026-09-11T22:00:00.000Z" },
    { title: "Weekly", kind: "general", date: "2026-09-18T22:00:00.000Z" },
  ],
  facts: [],
  ...over,
});

const material: EssayMaterial = {
  companyName: "LabMate",
  oneLiner: "Shared inventory for university wet labs",
  founders: [{ name: "Maya Okonkwo", classYear: 2027 }],
  pitchSummary: "Labs lose reagents because nobody knows what is in the freezer. LabMate tracks it.",
  grantUse: "Prototyping",
  grantNarrative: null,
  memoSections: [
    { title: "Market", text: "There are 400 wet labs on campus." },
    { title: "Recommendation", text: "Fund $2,350 for the team." },
    { title: "Founder", text: "Maya ran inventory for her own lab for two years. She built the first version in a weekend. It is used daily. A fourth sentence." },
  ],
  fundingRequest: [],
  debriefs: [{ date: "2026-09-01T00:00:00.000Z", text: "She showed us the spreadsheet she replaced. Three labs had asked for access." }],
  rationales: [],
};

describe("first draft", () => {
  const first = syncAnnualContent(parseAnnualContent({}), derived(), {
    materials: { "co-1": material },
    mission: "We fund student founders.",
    thesis: "",
  });

  it("puts leadership on the team page, lists analysts without including them, and skips read-only members", () => {
    expect(first.team.members.map((m) => [m.id, m.included])).toEqual([
      ["m-admin", true],
      ["m-partner", true],
      ["m-analyst", false],
    ]);
  });

  it("prefills the mission from club settings and leaves the rest for a human", () => {
    expect(docToText(first.mission.blocks[0].body)).toBe("We fund student founders.");
    expect(first.mission.blocks[1].body).toBeNull();
  });

  it("includes this year's companies and offers earlier ones", () => {
    expect(first.companies.map((c) => [c.id, c.included])).toEqual([
      ["co-1", true],
      ["co-old", false],
    ]);
    expect(first.companies[0].authorMemberId).toBe("m-analyst");
  });

  it("stitches an essay starter from the memo and debrief, with prompts where only the author knows", () => {
    const essay = docToText(first.companies[0].essay);
    expect(first.companies[0].essayState).toBe("starter");
    expect(essay).toContain("[add: how you first met Maya, and what you noticed]");
    expect(essay).toContain("Maya ran inventory for her own lab for two years.");
    expect(essay).not.toContain("A fourth sentence");
    expect(essay).not.toContain("400 wet labs");
    expect(essay).not.toContain("$2,350");
    expect(essay).toContain("From our coffee chat: She showed us the spreadsheet she replaced.");
    expect(countPrompts(essay)).toBe(2);
    expect(spreadStatus(first.companies[0])).toBe("needs_essay");
  });

  it("writes current progress from the outcome tier and check-in notes", () => {
    expect(docToText(first.companies[0].progress)).toBe(
      "Since the grant, LabMate has raised an outside round. Closed a $150k pre-seed."
    );
    expect(progressFromOutcomes(company({ outcomeTier: null, updates: [] }))).toBe(
      "[add: what LabMate has done since the grant]"
    );
  });

  it("suggests companies we supported but did not fund", () => {
    expect(first.lookingForward.unfunded[0].note).toBe(
      "DIY solar balcony kits for renters. [add: how we helped, and where they are now]"
    );
  });

  it("refreshing adds what is new and never touches what a member wrote", () => {
    const edited = applyAnnualOps(first, [
      { op: "set", path: ["companies", "co-1", "essay"], value: textToDoc("I met Maya in the lab.") },
      { op: "set", path: ["companies", "co-1", "essayState"], value: "edited" },
      { op: "set", path: ["companies", "co-1", "progress"], value: textToDoc("Our own words.") },
      { op: "set", path: ["companies", "co-1", "progressAuto"], value: false },
      { op: "set", path: ["team", "members", "m-analyst", "included"], value: true },
    ]);
    const later = derived({
      companies: [
        company({ updates: [{ tier: "raised_round", note: "A newer note", recordedAt: "2027-01-01T00:00:00.000Z" }] }),
        company({ companyId: "co-old", name: "SplitStay", inFiscalYear: false, outcomeTier: "launched", updates: [] }),
        company({ companyId: "co-2", name: "GreenPlate" }),
      ],
      members: [...derived().members, { id: "m-new", name: "Zed New", role: "partner", title: null, classYear: null, bio: null, avatarUrl: null }],
    });
    const synced = syncAnnualContent(edited, later);
    expect(docToText(synced.companies[0].essay)).toBe("I met Maya in the lab.");
    expect(docToText(synced.companies[0].progress)).toBe("Our own words.");
    // Untouched, auto-written progress follows the data.
    expect(docToText(synced.companies[1].progress)).toBe("Since the grant, SplitStay has launched.");
    expect(synced.companies.map((c) => c.id)).toEqual(["co-1", "co-old", "co-2"]);
    expect(synced.team.members.find((m) => m.id === "m-analyst")!.included).toBe(true);
    expect(synced.team.members.at(-1)).toMatchObject({ id: "m-new", included: true });
    expect(synced.mission.stats).toHaveLength(first.mission.stats.length);
  });
});

describe("content parsing", () => {
  it("never throws and always yields every section once", () => {
    expect(parseAnnualContent(null).sections.map((s) => s.id)).toEqual([
      "team",
      "mission",
      "companies",
      "programs",
      "looking_forward",
    ]);
    expect(parseAnnualContent({ sections: "nope" }).companies).toEqual([]);
    const reordered = parseAnnualContent({
      sections: [
        { id: "mission", included: false },
        { id: "mission", included: true },
      ],
    });
    expect(reordered.sections.map((s) => s.id)).toEqual(["mission", "team", "companies", "programs", "looking_forward"]);
    expect(reordered.sections[0].included).toBe(false);
  });

  it("reads supporter emails however they were typed", () => {
    expect(parseRecipients("Dean@Example.edu, donor@example.com;\n donor@example.com not-an-email")).toEqual([
      "dean@example.edu",
      "donor@example.com",
    ]);
    expect(parseRecipients("")).toEqual([]);
  });

  it("accepts only http(s) image links", () => {
    expect(isImageUrl("https://example.com/a.png")).toBe(true);
    expect(isImageUrl("")).toBe(true);
    expect(isImageUrl("javascript:alert(1)")).toBe(false);
    expect(isImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isImageUrl("/local.png")).toBe(false);
    expect(annualContentSchema.safeParse({ cover: { imageUrl: "javascript:alert(1)" } }).success).toBe(false);
  });
});

describe("applyAnnualOps", () => {
  const base = syncAnnualContent(parseAnnualContent({}), derived());

  it("addresses list items by id, so edits to different spreads do not collide", () => {
    const next = applyAnnualOps(base, [
      { op: "set", path: ["companies", "co-old", "included"], value: true },
      { op: "move", path: ["companies", "co-old"], by: -1 },
      { op: "insert", path: ["programs"], value: { id: "p1", title: "Demo day" } },
      { op: "set", path: ["cover", "subtitle"], value: "Year two" },
    ]);
    expect(next.companies.map((c) => c.id)).toEqual(["co-old", "co-1"]);
    expect(next.companies[0].included).toBe(true);
    expect(annualContentSchema.parse(next).programs[0].title).toBe("Demo day");
    expect(next.cover.subtitle).toBe("Year two");
    expect(base.companies[0].id).toBe("co-1");
  });

  it("removes items and ignores a move past either end", () => {
    const next = applyAnnualOps(base, [
      { op: "move", path: ["companies", "co-1"], by: -1 },
      { op: "remove", path: ["lookingForward", "unfunded", "app-9"] },
    ]);
    expect(next.companies[0].id).toBe("co-1");
    expect(next.lookingForward.unfunded).toEqual([]);
  });

  it("refuses paths that do not exist or reach for the prototype", () => {
    expect(() => applyAnnualOps(base, [{ op: "set", path: ["companies", "nope", "essay"], value: null }])).toThrow();
    expect(() => applyAnnualOps(base, [{ op: "set", path: ["__proto__", "polluted"], value: 1 }])).toThrow();
    expect(() => applyAnnualOps(base, [{ op: "set", path: ["cover", "constructor"], value: 1 }])).toThrow();
    expect(() => applyAnnualOps(base, [{ op: "insert", path: ["cover"], value: 1 }])).toThrow();
  });

  it("lets an analyst change only the spreads they author", () => {
    const set = (path: string[]) => ({ op: "set" as const, path, value: null });
    expect(opAllowedForAuthor(set(["companies", "co-1", "essay"]), base, "m-analyst")).toBe(true);
    expect(opAllowedForAuthor(set(["companies", "co-1", "essay"]), base, "m-partner")).toBe(false);
    expect(opAllowedForAuthor(set(["companies", "co-1", "reviewed"]), base, "m-analyst")).toBe(false);
    expect(opAllowedForAuthor(set(["companies", "co-1", "authorMemberId"]), base, "m-analyst")).toBe(false);
    expect(opAllowedForAuthor(set(["companies", "co-1"]), base, "m-analyst")).toBe(false);
    expect(opAllowedForAuthor(set(["team", "statement"]), base, "m-analyst")).toBe(false);
    expect(opAllowedForAuthor({ op: "remove", path: ["companies", "co-1"] }, base, "m-analyst")).toBe(false);
  });
});

describe("completion", () => {
  const first = syncAnnualContent(parseAnnualContent({}), derived(), { materials: { "co-1": material } });

  it("names exactly what still needs a human", () => {
    const p = annualProgress(first, derived());
    expect(p.ready).toBe(0);
    expect(p.total).toBe(5);
    expect(p.summary).toBe("1 essay, 1 bio, looking forward");
    expect(p.missing.map((m) => m.text)).toEqual([
      "Write the team statement",
      "1 bio missing: Sofia Alvarez",
      "Mission: “Our mission” is empty",
      "Mission: “What we look for” is empty",
      "Mission: “In summary” is empty",
      "LabMate: the essay is not written yet",
      "Programs & events: add one, or leave the section out",
      "Write “Limitations & looking forward”",
      "Solara Labs: finish the note, or leave it out",
    ]);
    expect(p.missing.find((m) => m.kind === "essay")!.target).toBe("company:co-1");
  });

  it("walks an essay from starter, to draft with prompts left, to needing a second read, to done", () => {
    const withDraft = applyAnnualOps(first, [
      { op: "set", path: ["companies", "co-1", "essay"], value: textToDoc("I met Maya [add: where].") },
      { op: "set", path: ["companies", "co-1", "essayState"], value: "ai" },
    ]);
    expect(spreadStatus(withDraft.companies[0])).toBe("draft");
    expect(annualProgress(withDraft, derived()).missing.map((m) => m.text)).toContain(
      "LabMate: 1 [add: …] prompt left in the essay"
    );

    const clean = applyAnnualOps(withDraft, [
      { op: "set", path: ["companies", "co-1", "essay"], value: textToDoc("I met Maya in the lab.") },
    ]);
    expect(annualProgress(clean, derived()).missing.map((m) => m.text)).toContain(
      "LabMate: the essay needs a second read"
    );

    const reviewed = applyAnnualOps(clean, [{ op: "set", path: ["companies", "co-1", "reviewed"], value: true }]);
    expect(spreadStatus(reviewed.companies[0])).toBe("reviewed");
    expect(annualProgress(reviewed, derived()).sections.companies.state).toBe("ready");
  });

  it("asks nothing of sections, people and companies that were left out", () => {
    const trimmed = applyAnnualOps(first, [
      { op: "set", path: ["sections", "programs", "included"], value: false },
      { op: "set", path: ["team", "members", "m-partner", "included"], value: false },
      { op: "set", path: ["companies", "co-1", "included"], value: false },
      { op: "set", path: ["lookingForward", "unfunded", "app-9", "included"], value: false },
    ]);
    const p = annualProgress(trimmed, derived());
    expect(p.total).toBe(4);
    expect(p.sections.companies.state).toBe("ready");
    expect(p.missing.some((m) => /LabMate|Sofia|Solara|Programs/.test(m.text))).toBe(false);
  });
});

describe("publication", () => {
  const content = applyAnnualOps(
    syncAnnualContent(parseAnnualContent({}), derived(), { materials: { "co-1": material }, mission: "We fund students." }),
    [
      { op: "set", path: ["team", "members", "m-partner", "bio"], value: "Report-only bio." },
      { op: "set", path: ["mission", "stats", "applications", "label"], value: "founders applied" },
      { op: "insert", path: ["mission", "stats"], value: { id: "c1", key: "custom", value: "17", label: "founders in our incubator" } },
      { op: "insert", path: ["mission", "stats"], value: { id: "c2", key: "custom", value: " ", label: "blank" } },
      { op: "set", path: ["companies", "co-1", "founders"], value: [{ name: "Maya O.", classYear: 2027 }] },
      { op: "set", path: ["companies", "co-1", "photos"], value: [{ id: "ph", url: "", caption: "none" }] },
    ]
  );
  const pub = buildPublication(annualContentSchema.parse(content), derived());

  it("applies report-only overrides over profile data", () => {
    expect(pub.team.members.map((m) => [m.name, m.title, m.bio])).toEqual([
      ["Priya Raman", "President", "Runs the fund."],
      ["Sofia Alvarez", "Partner", "Report-only bio."],
    ]);
    expect(pub.companies[0].founders).toEqual([{ name: "Maya O.", classYear: 2027 }]);
    expect(pub.companies[0].author).toEqual({ name: "Daniel", title: "Analyst" });
    expect(pub.companies[0].grantLine).toBe("$2,350 grant · Prototyping");
    expect(pub.companies[0].photos).toEqual([]);
  });

  it("shows visible stats with relabels and custom entries, and drops what has no value", () => {
    expect(pub.mission.stats[0]).toEqual({ id: "applications", value: "3", label: "founders applied" });
    expect(pub.mission.stats.at(-1)).toEqual({ id: "c1", value: "17", label: "founders in our incubator" });
    expect(pub.mission.stats.some((s) => s.id === "memos")).toBe(false);
  });

  it("builds the contents from the sections that actually have something in them", () => {
    expect(pub.sections.map((s) => s.id)).toEqual(["team", "mission", "companies", "looking_forward"]);
    expect(pub.companies.map((c) => c.name)).toEqual(["LabMate"]);
    expect(pub.cover.title).toBe("Annual Report 2026–27");
  });

  it("exports as Markdown and summarizes for the email", () => {
    const md = publicationToMarkdown(pub);
    expect(md).toContain("# Cardinal Ventures — Annual Report 2026–27");
    expect(md).toContain("## Our thesis on LabMate");
    expect(md).toContain("- 17 founders in our incubator");
    expect(annualSummary(content, derived())).toBe(
      "In 2026–27 we received 3 applications, funded 2 companies and paid out $2,001 in grants. The report has a short essay on the company we backed and why, and what we would do differently next year."
    );
  });

  it("lists a year's meetings of one kind as raw material", () => {
    expect(meetingsAsStats(derived().meetings, "training")).toEqual(["Pitch practice (Sep 11)"]);
  });
});
