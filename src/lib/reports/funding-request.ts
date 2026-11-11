import Decimal from "decimal.js";
import { z } from "zod";

/**
 * The funding request: the one- or two-page memo the club sends up for
 * sign-off once it has decided to fund a company. Pure — no DB, no model —
 * so the parsing, the arithmetic and the wording are unit-tested.
 *
 * Two halves, kept apart on purpose:
 *  - `FundingRequestFacts` is everything the app already knows (company,
 *    founders, the ask, the award, the vote). It is derived live while the
 *    request is a draft and frozen into `report.snapshot` at finalize.
 *  - `FundingRequestContent` is what a member wrote or approved. It lives in
 *    `report.content`.
 */

// ——— Content (report.content) ———

export const lineItemSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(200),
  /** Dollars as a numeric string ("58.50"); empty while the row is being typed. */
  amount: z.string().max(20),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const FR_PROSE_FIELDS = [
  "rationaleFunding",
  "rationaleCuts",
  "summary",
  "team",
  "feasibility",
  "impact",
  "value",
] as const;
export const FR_LIST_FIELDS = ["upside", "concerns"] as const;
export const FR_FIELDS = [...FR_PROSE_FIELDS, ...FR_LIST_FIELDS] as const;
export type FundingRequestProseField = (typeof FR_PROSE_FIELDS)[number];
export type FundingRequestListField = (typeof FR_LIST_FIELDS)[number];
export type FundingRequestField = (typeof FR_FIELDS)[number];

/**
 * Where a field's current text came from, until a member edits or accepts it.
 * `ai` text is an unreviewed draft and blocks finalize; `memo` and
 * `application` text is the club's own words carried over, shown with a quiet
 * provenance note.
 */
export const FR_ORIGINS = ["ai", "memo", "application"] as const;
export type FundingRequestOrigin = (typeof FR_ORIGINS)[number];

const prose = z.string().max(6000);
const list = z.array(z.string().max(2000)).max(12);

/** Field shapes without defaults — a patch must not invent the fields it leaves out. */
const contentShape = {
  /** Overrides the composed founders line when non-empty. */
  founders: z.string().max(400),
  /** Overrides the composed recommendation sentence when non-empty. */
  recommendation: z.string().max(400),
  askedItems: z.array(lineItemSchema).max(60),
  approvedItems: z.array(lineItemSchema).max(60),
  rationaleFunding: prose,
  rationaleCuts: prose,
  summary: prose,
  team: prose,
  feasibility: prose,
  impact: prose,
  value: prose,
  upside: list,
  concerns: list,
  origin: z.partialRecord(z.enum(FR_FIELDS), z.enum(FR_ORIGINS)),
};

export const fundingRequestContentSchema = z.object({
  founders: contentShape.founders.default(""),
  recommendation: contentShape.recommendation.default(""),
  askedItems: contentShape.askedItems.default([]),
  approvedItems: contentShape.approvedItems.default([]),
  rationaleFunding: prose.default(""),
  rationaleCuts: prose.default(""),
  summary: prose.default(""),
  team: prose.default(""),
  feasibility: prose.default(""),
  impact: prose.default(""),
  value: prose.default(""),
  upside: list.default([]),
  concerns: list.default([]),
  origin: contentShape.origin.default({}),
});
export type FundingRequestContent = z.infer<typeof fundingRequestContentSchema>;

/** What the save action accepts: any subset of the content. */
export const fundingRequestPatchSchema = z.object(contentShape).partial();
export type FundingRequestPatch = z.infer<typeof fundingRequestPatchSchema>;

/** Never throws: unknown or malformed stored content falls back to an empty request. */
export function parseFundingRequestContent(raw: unknown): FundingRequestContent {
  const parsed = fundingRequestContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : fundingRequestContentSchema.parse({});
}

// ——— Facts (derived; frozen into report.snapshot at finalize) ———

export type FundingRequestFacts = {
  applicationId: string;
  clubName: string;
  companyName: string;
  oneLiner: string | null;
  pitch: string | null;
  /** "Founders: Avery Lee (2nd year, Electrical Engineering), …" without the label. */
  founders: string;
  decision: "fund" | "decline" | "pending";
  askedTotal: string | null;
  approvedTotal: string | null;
  /** Where the approved figure comes from; `ballots` is the median of revealed fund ballots. */
  approvedSource: "grant" | "memo" | "ballots" | null;
  useOfFundsLabel: string | null;
  useOfFundsNarrative: string | null;
  /** Composed from the decision; content.recommendation overrides it. */
  recommendation: string;
  /** Present only once the round is revealed. */
  vote: { fund: number; decline: number; abstain: number; averageConviction: string | null } | null;
  memo: { id: string; authorName: string; date: string } | null;
  preparedBy: string | null;
  /** ISO date the request was started. */
  preparedAt: string;
};

// ——— Money ———

function dec(value: string | null | undefined): Decimal | null {
  if (value == null) return null;
  const clean = value.replace(/[$,\s]/g, "");
  if (clean === "") return null;
  try {
    const d = new Decimal(clean);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

/** "$1,370" for whole dollars, "$58.50" otherwise. Decimal throughout. */
export function formatUsd(value: string | null | undefined): string {
  const d = dec(value);
  if (!d) return "—";
  const fixed = d.abs().toFixed(d.isInteger() ? 0 : 2);
  const [whole, cents] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${d.isNegative() ? "-" : ""}$${grouped}${cents ? `.${cents}` : ""}`;
}

/** A line-item amount the way the memo's table shows it: "260", "58.50". */
export function formatItemAmount(value: string): string {
  const d = dec(value);
  if (!d) return "";
  return formatUsd(d.toFixed(2)).replace("$", "");
}

/** What a member typed → a stored amount ("58.5" → "58.50"), or "" when it isn't money. */
export function normalizeAmount(input: string): string {
  const d = dec(input);
  return d && d.gte(0) && d.lt(10_000_000) ? d.toDecimalPlaces(2).toFixed(2) : "";
}

export function sumItems(items: Pick<LineItem, "amount">[]): string {
  return items
    .reduce((sum, item) => sum.add(dec(item.amount) ?? 0), new Decimal(0))
    .toFixed(2);
}

export type Reconciliation =
  | { state: "empty" | "match" | "no_total" }
  | { state: "mismatch"; itemsTotal: string; total: string; message: string };

/**
 * Do the itemised rows add up to the headline figure? `noun` finishes the
 * sentence: "the grant is" / "the founder asked for".
 */
export function reconcileItems(
  items: Pick<LineItem, "amount">[],
  total: string | null,
  noun: string
): Reconciliation {
  const priced = items.filter((i) => dec(i.amount));
  if (priced.length === 0) return { state: "empty" };
  const target = dec(total);
  if (!target) return { state: "no_total" };
  const itemsTotal = sumItems(priced);
  if (new Decimal(itemsTotal).eq(target)) return { state: "match" };
  return {
    state: "mismatch",
    itemsTotal,
    total: target.toFixed(2),
    message: `Items add up to ${formatUsd(itemsTotal)}; ${noun} ${formatUsd(target.toFixed(2))}.`,
  };
}

export function isCut(facts: Pick<FundingRequestFacts, "askedTotal" | "approvedTotal">): boolean {
  const asked = dec(facts.askedTotal);
  const approved = dec(facts.approvedTotal);
  return Boolean(asked && approved && approved.lt(asked));
}

// ——— Line items out of a use-of-funds narrative ———

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?`;
const TRAILING = new RegExp(String.raw`^(.+?)\s*(?:[-–—:=|\t]+|\.{2,})\s*\$?\s?${AMOUNT}$`);
const TRAILING_DOLLAR = new RegExp(String.raw`^(.+?)\s+\$\s?${AMOUNT}$`);
const TRAILING_PAREN = new RegExp(String.raw`^(.+?)\s*\(\s*\$\s?${AMOUNT}\s*\)$`);
const LEADING = new RegExp(String.raw`^\$\s?${AMOUNT}\s*(?:[-–—:]+|for|on|toward|towards)\s+(.+)$`, "i");

function toAmount(whole: string, cents: string | undefined): string {
  return new Decimal(`${whole.replace(/,/g, "")}.${cents ?? "0"}`).toFixed(2);
}

function parseLine(raw: string): { name: string; amount: string } | null {
  const line = raw
    .trim()
    .replace(/^(?:[-*•–·▪◦]|\d{1,2}[.)])\s+/, "")
    .replace(/[.;,]$/, "")
    .trim();
  if (!line) return null;
  for (const pattern of [TRAILING_PAREN, TRAILING, TRAILING_DOLLAR]) {
    const m = line.match(pattern);
    if (m) {
      const name = m[1].replace(/[\s:–—-]+$/, "").trim();
      // A bare year or quantity is not a price: "Launch in 2027" has no separator and no "$".
      if (name.length >= 2 && /[a-z]/i.test(name)) return { name, amount: toAmount(m[2], m[3]) };
    }
  }
  const lead = line.match(LEADING);
  if (lead) {
    const name = lead[3].trim();
    if (name.length >= 2) return { name: name[0].toUpperCase() + name.slice(1), amount: toAmount(lead[1], lead[2]) };
  }
  return null;
}

/**
 * The obvious cases only: one item per line (or per semicolon) written as
 * "Raspberry Pi 5 – $260", "Camera module: 58.50", "Printer ($658)" or
 * "$280 for the cartridge". Anything subtler is left for a person or the model.
 */
export function parseLineItems(text: string | null | undefined): { name: string; amount: string }[] {
  if (!text) return [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const parts = lines.filter((l) => l.trim()).length > 1 ? lines : text.split(/;|\n/);
  return parts
    .map(parseLine)
    .filter((item): item is { name: string; amount: string } => item !== null && item.amount !== "0.00");
}

let itemSeq = 0;
/** Row ids only need to be unique within one request. */
export function newItemId(): string {
  itemSeq += 1;
  return `i${Date.now().toString(36)}${itemSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function toLineItems(items: { name: string; amount: string }[]): LineItem[] {
  return items.map((item) => ({ id: newItemId(), name: item.name, amount: normalizeAmount(item.amount) }));
}

// ——— Founders ———

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/** "3rd year" during a four-year degree; "Class of 2031" outside it. */
export function yearInSchool(classYear: number | null | undefined, now: Date): string | null {
  if (!classYear) return null;
  // The academic year that contains `now` ends in this calendar year.
  const academicYearEnd = now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  const year = 4 - (classYear - academicYearEnd);
  return year >= 1 && year <= 4 ? `${ORDINALS[year - 1]} year` : `Class of ${classYear}`;
}

export type FounderInput = {
  name: string;
  classYear?: number | null;
  school?: string | null;
  department?: string | null;
};

/** "Marshall Schneider (3rd year), Kyle Young (3rd year at UCLA)" */
export function composeFounders(founders: FounderInput[], now: Date): string {
  return founders
    .filter((f) => f.name.trim())
    .map((f) => {
      const year = yearInSchool(f.classYear, now);
      const place = f.school?.trim() ? `at ${f.school.trim()}` : null;
      const detail = [[year, place].filter(Boolean).join(" "), f.department?.trim()].filter(Boolean).join(", ");
      return detail ? `${f.name.trim()} (${detail})` : f.name.trim();
    })
    .join(", ");
}

// ——— Recommendation ———

/** "Receive $1,370 for materials for lab experiments" */
export function composeRecommendation(input: {
  decision: FundingRequestFacts["decision"];
  approvedTotal: string | null;
  useOfFundsLabel: string | null;
  useOfFundsNarrative: string | null;
}): string {
  if (input.decision === "decline") return "Do not fund";
  if (input.decision === "pending" && !input.approvedTotal) {
    return "[add: the recommendation — no decision is recorded yet]";
  }
  const amount = input.approvedTotal ? formatUsd(input.approvedTotal) : "[add: amount]";
  const narrative = input.useOfFundsNarrative?.trim().replace(/\s+/g, " ").replace(/\.$/, "") ?? "";
  // A short narrative reads as the purpose; a long one belongs in the details below.
  const purpose =
    narrative && narrative.length <= 90 && !narrative.includes(". ")
      ? // Mid-sentence casing; an acronym ("API credits") keeps its capital.
        /^[A-Z]{2,}/.test(narrative)
        ? narrative
        : narrative[0].toLowerCase() + narrative.slice(1)
      : input.useOfFundsLabel && input.useOfFundsLabel !== "Other"
        ? input.useOfFundsLabel.toLowerCase()
        : null;
  return purpose ? `Receive ${amount} for ${purpose}` : `Receive ${amount}`;
}

export function recommendationOf(facts: FundingRequestFacts, content: FundingRequestContent): string {
  return content.recommendation.trim() || facts.recommendation;
}

export function foundersOf(facts: FundingRequestFacts, content: FundingRequestContent): string {
  return content.founders.trim() || facts.founders;
}

// ——— Vote footer ———

/** "9 fund · 4 decline · average conviction 3.4" — revealed ballots only. */
export function summarizeBallots(
  ballots: { decision: string | null; conviction: number | null }[]
): NonNullable<FundingRequestFacts["vote"]> {
  const count = (d: string) => ballots.filter((b) => b.decision === d).length;
  const convictions = ballots.map((b) => b.conviction).filter((c): c is number => c != null);
  return {
    fund: count("fund"),
    decline: count("decline"),
    abstain: count("abstain"),
    averageConviction: convictions.length
      ? convictions
          .reduce((sum, c) => sum.add(c), new Decimal(0))
          .div(convictions.length)
          .toFixed(1)
      : null,
  };
}

export function voteLine(vote: NonNullable<FundingRequestFacts["vote"]>): string {
  return [
    `${vote.fund} fund`,
    `${vote.decline} decline`,
    vote.abstain > 0 ? `${vote.abstain} abstain` : null,
    vote.averageConviction ? `average conviction ${vote.averageConviction}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ——— Prefill from what the club already wrote ———

const MEMO_SECTION_MAP: { field: FundingRequestField; match: RegExp }[] = [
  { field: "summary", match: /summary|overview|what (it|they)|company/i },
  { field: "team", match: /team|founder/i },
  { field: "feasibility", match: /product|traction|feasib|progress|build/i },
  { field: "impact", match: /use of funds|budget|impact|spend/i },
  { field: "value", match: /market|value|problem|opportunit|customer/i },
  { field: "concerns", match: /risk|concern|open question/i },
  { field: "rationaleFunding", match: /recommend|rationale|why/i },
];

/**
 * A memo's recommendation usually opens with the verdict ("Fund $1,800.").
 * The request states the amount itself, and it may differ, so keep the reason.
 */
export function stripVerdict(text: string): string {
  return text.replace(/^\s*(?:we\s+)?(?:recommend|fund|approve)\b[^.]*\$[\d,.]*\d\.\s+/i, "").trim();
}

/** Paragraphs or list lines → list entries, bullets and numbering stripped. */
export function textToList(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d{1,2}[.)])\s+/, "").trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * The first draft of a request, before anyone types: memo sections mapped onto
 * the request's fields, the company description as the summary when there is
 * no memo, and the founder's own budget as the line items when it parses.
 */
export function prefillFundingRequest(input: {
  memoSections: { title: string; text: string }[];
  oneLiner: string | null;
  pitch: string | null;
  useOfFundsNarrative: string | null;
  cut: boolean;
}): FundingRequestContent {
  const content = fundingRequestContentSchema.parse({});
  for (const section of input.memoSections) {
    const target = MEMO_SECTION_MAP.find((m) => m.match.test(section.title))?.field;
    if (!target) continue;
    const text = target === "rationaleFunding" ? stripVerdict(section.text) : section.text.trim();
    if (!text) continue;
    if (target === "upside" || target === "concerns") {
      if (content[target].length === 0) {
        content[target] = textToList(text);
        content.origin[target] = "memo";
      }
    } else if (!content[target]) {
      content[target] = text.slice(0, 6000);
      content.origin[target] = "memo";
    }
  }
  if (!content.summary) {
    const fromApplication = [input.oneLiner, input.pitch]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join("\n\n");
    if (fromApplication) {
      content.summary = fromApplication;
      content.origin.summary = "application";
    }
  }
  const items = toLineItems(parseLineItems(input.useOfFundsNarrative));
  if (items.length >= 2) {
    content.askedItems = items;
    if (!input.cut) content.approvedItems = items.map((item) => ({ ...item, id: newItemId() }));
  }
  if (!input.cut) content.rationaleCuts = "N/A";
  return content;
}

// ——— Field copy ———

export const FR_FIELD_META: Record<
  FundingRequestField,
  { label: string; documentLabel: string; questions: string[] }
> = {
  rationaleFunding: {
    label: "Why we are funding this",
    documentLabel: "Rationales for providing certain funding ask",
    questions: [
      "What did the founder say or show that convinced the room?",
      "What does this money let them do that they cannot do now?",
    ],
  },
  rationaleCuts: {
    label: "Why we cut the ask",
    documentLabel: "Rationales for cutting down funding ask",
    questions: [
      "Which items did we leave out, and why?",
      "What would the founder need to show to get the rest?",
    ],
  },
  summary: {
    label: "Company summary",
    documentLabel: "Company summary",
    questions: [
      "What does the company do first, in one sentence a donor would follow?",
      "Who is it for, and what changes for them?",
      "Where do the founders want it to end up?",
    ],
  },
  team: {
    label: "Team",
    documentLabel: "Team",
    questions: [
      "Who are the founders, and what are they studying?",
      "What have they built or done that bears on this problem?",
      "How do they know each other?",
    ],
  },
  feasibility: {
    label: "Feasibility",
    documentLabel: "Feasibility",
    questions: [
      "What have they already done — users spoken to, prototype, pilot?",
      "Can they build the next step with what this grant buys?",
    ],
  },
  impact: {
    label: "High impact",
    documentLabel: "High Impact",
    questions: [
      "What does this specific check move them from and to?",
      "Why does a small amount matter at this stage?",
    ],
  },
  value: {
    label: "Value",
    documentLabel: "Value",
    questions: [
      "How big is the problem — a number, with where it came from?",
      "What do the people with the problem do today?",
    ],
  },
  upside: {
    label: "Areas of upside",
    documentLabel: "Areas of Upside",
    questions: ["If this works, what made it work?", "What did fund voters point to?"],
  },
  concerns: {
    label: "Areas of concern",
    documentLabel: "Areas of concern / If this fails, why?",
    questions: ["If this fails, what is the most likely reason?", "What did decline voters point to?"],
  },
};

/** The four arrow bullets under the company summary, in the memo's order. */
export const FR_BULLET_FIELDS = ["team", "feasibility", "impact", "value"] as const;

// ——— Finalize ———

const REQUIRED_PROSE: FundingRequestProseField[] = ["rationaleFunding", "summary", "team"];

/** Plain-language reasons the request can't be finalized yet. Empty = ready. */
export function finalizeBlockers(facts: FundingRequestFacts, content: FundingRequestContent): string[] {
  const out: string[] = [];
  if (facts.decision !== "fund") {
    out.push(
      facts.decision === "decline"
        ? "The club declined this company, so there is nothing to request."
        : "No fund decision is recorded yet. Record the decision first."
    );
  }
  if (!dec(facts.approvedTotal)) out.push("There is no approved amount yet. Propose the grant first.");
  for (const field of REQUIRED_PROSE) {
    if (!content[field].trim()) out.push(`${FR_FIELD_META[field].label} is empty.`);
  }
  if (isCut(facts) && (!content.rationaleCuts.trim() || /^n\/?a\.?$/i.test(content.rationaleCuts.trim()))) {
    out.push("We approved less than the founder asked for. Say why under “Why we cut the ask”.");
  }
  if (content.upside.filter((s) => s.trim()).length === 0) out.push("Add at least one area of upside.");
  if (content.concerns.filter((s) => s.trim()).length === 0) out.push("Add at least one area of concern.");
  const drafts = FR_FIELDS.filter((f) => content.origin[f] === "ai");
  if (drafts.length > 0) {
    out.push(
      `${drafts.length === 1 ? "One AI draft is" : `${drafts.length} AI drafts are`} unreviewed: ${drafts
        .map((f) => FR_FIELD_META[f].label)
        .join(", ")}. Edit or accept ${drafts.length === 1 ? "it" : "them"}.`
    );
  }
  return out;
}

// ——— Email ———

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const P = 'style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#27272a"';
const paragraphs = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p ${P}>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

function itemsTable(items: LineItem[]): string {
  const rows = items.filter((i) => i.name.trim() || dec(i.amount));
  if (rows.length === 0) return "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:8px 0 0">${rows
    .map(
      (i) =>
        `<tr><td style="padding:4px 8px 4px 0;font-size:13px;color:#27272a;border-top:1px solid #ececf0">${esc(i.name)}</td><td style="padding:4px 0;font-size:13px;color:#27272a;text-align:right;white-space:nowrap;border-top:1px solid #ececf0">${esc(formatItemAmount(i.amount))}</td></tr>`
    )
    .join("")}</table>`;
}

/** The memo as an email body (trusted HTML for `emailLayout`): everything escaped here. */
export function fundingRequestEmailBody(
  facts: FundingRequestFacts,
  content: FundingRequestContent,
  opts: { note?: string; approverName?: string } = {}
): string {
  const cell = "vertical-align:top;width:50%;padding:10px 12px;border:1px solid #d4d4d8";
  const label = (text: string) => `<strong style="color:#18181b">${esc(text)}</strong>`;
  const numbered = (items: string[]) =>
    `<ol style="margin:6px 0 0;padding-left:20px;font-size:14px;line-height:1.6;color:#27272a">${items
      .filter((s) => s.trim())
      .map((s) => `<li style="margin:0 0 6px">${esc(s)}</li>`)
      .join("")}</ol>`;
  const bullets = FR_BULLET_FIELDS.filter((f) => content[f].trim())
    .map(
      (f) =>
        `<p ${P}>${label(`${FR_FIELD_META[f].documentLabel}:`)} ${esc(content[f].trim()).replace(/\n+/g, "<br>")}</p>`
    )
    .join("");

  return [
    opts.note?.trim() ? paragraphs(opts.note) : "",
    opts.note?.trim() ? '<hr style="border:0;border-top:1px solid #e4e4e7;margin:16px 0">' : "",
    `<p style="margin:0 0 12px;font-size:13px;color:#71717a">Founders: ${esc(foundersOf(facts, content) || "—")}</p>`,
    `<p ${P}>${label("Recommendation:")} ${esc(recommendationOf(facts, content))}</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 16px">
      <tr>
        <td style="${cell}"><div style="font-size:14px;text-align:center">${label(`Asked: ${formatUsd(facts.askedTotal)}`)}</div>${itemsTable(content.askedItems)}</td>
        <td style="${cell}"><div style="font-size:14px;text-align:center">${label(`Approved: ${formatUsd(facts.approvedTotal)}`)}</div>${itemsTable(content.approvedItems)}</td>
      </tr>
      <tr>
        <td style="${cell}"><div style="font-size:13px;margin:0 0 6px">${label(FR_FIELD_META.rationaleFunding.documentLabel + ":")}</div>${paragraphs(content.rationaleFunding || "—")}</td>
        <td style="${cell}"><div style="font-size:13px;margin:0 0 6px">${label(FR_FIELD_META.rationaleCuts.documentLabel + ":")}</div>${paragraphs(content.rationaleCuts || "N/A")}</td>
      </tr>
    </table>`,
    `<p ${P}>${label("Company summary:")}</p>`,
    paragraphs(content.summary || "—"),
    bullets,
    `<p style="margin:16px 0 0;font-size:14px">${label(FR_FIELD_META.upside.documentLabel + ":")}</p>`,
    numbered(content.upside),
    `<p style="margin:16px 0 0;font-size:14px">${label(FR_FIELD_META.concerns.documentLabel + ":")}</p>`,
    numbered(content.concerns),
    facts.vote
      ? `<p style="margin:18px 0 0;font-size:12px;color:#71717a">Club vote: ${esc(voteLine(facts.vote))}</p>`
      : "",
  ].join("\n");
}
