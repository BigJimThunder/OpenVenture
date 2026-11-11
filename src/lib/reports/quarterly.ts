import Decimal from "decimal.js";
import { z } from "zod";
import { formatUsd } from "./funding-request";

/**
 * The quarterly letter to the people who fund the pool. Pure — no DB, no
 * model. `composeQuarterlyLetter` turns a quarter's figures into plain
 * declarative sentences; the only prose a person writes is the opening and
 * the what's-next paragraph.
 *
 * `QuarterlyFigures` is derived live while the letter is a draft and frozen
 * into `report.snapshot` at finalize; `QuarterlyContent` is `report.content`.
 */

// ——— Content (report.content) ———

/** Tiptap JSON, as the rich text editor stores it. */
const richDoc = z.record(z.string(), z.unknown()).nullable();

export const QUARTERLY_PROSE_FIELDS = ["opening", "whatsNext"] as const;
export type QuarterlyProseField = (typeof QUARTERLY_PROSE_FIELDS)[number];

const quarterlyShape = {
  /** Empty → "Dear supporters,". */
  salutation: z.string().max(200),
  /** The partners' opening paragraphs (Tiptap JSON). */
  opening: richDoc,
  /** What the club will do next quarter (Tiptap JSON). */
  whatsNext: richDoc,
  /** Empty → "The partners, <club>". */
  signoff: z.string().max(200),
  /** One line on why, per grant id; overrides what the funding request or memo supplies. */
  grantNotes: z.record(z.string(), z.string().max(600)),
  /** Fields holding an unreviewed AI draft. */
  origin: z.partialRecord(z.enum(QUARTERLY_PROSE_FIELDS), z.literal("ai")),
};

export const quarterlyContentSchema = z.object({
  salutation: quarterlyShape.salutation.default(""),
  opening: richDoc.default(null),
  whatsNext: richDoc.default(null),
  signoff: quarterlyShape.signoff.default(""),
  grantNotes: quarterlyShape.grantNotes.default({}),
  origin: quarterlyShape.origin.default({}),
});
export type QuarterlyContent = z.infer<typeof quarterlyContentSchema>;

export const quarterlyPatchSchema = z.object(quarterlyShape).partial();
export type QuarterlyPatch = z.infer<typeof quarterlyPatchSchema>;

/** Never throws: malformed stored content falls back to an empty letter. */
export function parseQuarterlyContent(raw: unknown): QuarterlyContent {
  const parsed = quarterlyContentSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : quarterlyContentSchema.parse({});
}

export const QUARTERLY_PROMPTS: Record<QuarterlyProseField, { label: string; question: string; hints: string[] }> = {
  opening: {
    label: "Opening",
    question: "What happened this quarter that a donor would want to hear first?",
    hints: [
      "One or two short paragraphs. Lead with the thing you would say out loud.",
      "A founder who shipped, a decision that was hard, something the club changed.",
    ],
  },
  whatsNext: {
    label: "What's next",
    question: "What will the club do next quarter, and what do you need from the people reading this?",
    hints: ["Dates and numbers where you have them: the next deadline, how much is left to give."],
  },
};

// ——— Figures (derived; frozen into report.snapshot at finalize) ———

export type QuarterlyGrant = {
  id: string;
  applicationId: string | null;
  companyName: string;
  amount: string;
  useOfFundsLabel: string | null;
  /** The grant's own "what it pays for" narrative. */
  paidFor: string | null;
  /** One line on why, from the funding request or the memo. */
  why: string | null;
  /** ISO date. */
  issuedAt: string | null;
};

export type QuarterlyFigures = {
  fiscalYear: number;
  quarter: number;
  /** ISO; `end` is exclusive. */
  start: string;
  end: string;
  /** ISO; when the figures were read. */
  asOf: string;
  inProgress: boolean;
  pool: {
    name: string;
    budget: string;
    committed: string;
    deployed: string;
    remaining: string;
  } | null;
  grants: QuarterlyGrant[];
  pipeline: {
    received: number;
    funded: number;
    declined: number;
    inReview: number;
    declineReasons: { label: string; count: number }[];
  };
  portfolio: {
    updates: { companyName: string; tierLabel: string; note: string | null; changed: boolean }[];
    standing: { tierLabel: string; count: number }[];
  };
};

// ——— Wording ———

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "October 24" / "October 24, 2026" — UTC, so a stored date never slips a day. */
export function longDate(iso: string, withYear = false): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${withYear ? `, ${d.getUTCFullYear()}` : ""}`;
}

/** "July 1 – September 30, 2026" */
export function periodLabel(figures: Pick<QuarterlyFigures, "start" | "end">): string {
  const last = new Date(new Date(figures.end).getTime() - 86_400_000).toISOString();
  return `${longDate(figures.start)} – ${longDate(last, true)}`;
}

/** "no", "one", then numerals. */
export function countWord(n: number): string {
  return n === 0 ? "no" : n === 1 ? "one" : String(n);
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${countWord(n)} ${n === 1 ? singular : pluralForm}`;
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

export function quarterTotal(grants: Pick<QuarterlyGrant, "amount">[]): string {
  return grants.reduce((sum, g) => sum.add(g.amount), new Decimal(0)).toFixed(2);
}

export function averageCheck(grants: Pick<QuarterlyGrant, "amount">[]): string | null {
  if (grants.length === 0) return null;
  return new Decimal(quarterTotal(grants)).div(grants.length).toDecimalPlaces(0).toFixed(0);
}

/** Nothing came in, nothing went out, nobody reported a change. */
export function isQuietQuarter(f: QuarterlyFigures): boolean {
  return (
    f.grants.length === 0 &&
    f.pipeline.received === 0 &&
    f.pipeline.funded === 0 &&
    f.pipeline.declined === 0 &&
    f.portfolio.updates.length === 0
  );
}

function poolSentences(f: QuarterlyFigures): string[] {
  if (!f.pool) {
    return [`No grant pool is set up for FY${f.fiscalYear}, so there is no budget to report against.`];
  }
  const { name, budget, committed, deployed, remaining } = f.pool;
  const paid = new Decimal(deployed);
  const held = new Decimal(committed);
  const out = [`The ${name} is ${formatUsd(budget)}.`];
  if (paid.isZero() && held.isZero()) {
    out.push("None of it has been paid out or committed yet.");
  } else if (held.isZero()) {
    out.push(`We have paid out ${formatUsd(deployed)} of it, which leaves ${formatUsd(remaining)}.`);
  } else if (paid.isZero()) {
    out.push(
      `Nothing has been paid out yet; ${formatUsd(committed)} is committed to approved grants, which leaves ${formatUsd(remaining)}.`
    );
  } else {
    out.push(
      `We have paid out ${formatUsd(deployed)} of it and committed a further ${formatUsd(committed)} to grants that are approved but not yet paid, which leaves ${formatUsd(remaining)}.`
    );
  }
  return out;
}

function issuedSentence(f: QuarterlyFigures): string {
  const n = f.grants.length;
  if (n === 0) return "We issued no grants this quarter.";
  if (n === 1) return `This quarter we issued one grant of ${formatUsd(f.grants[0].amount)}.`;
  return `This quarter we issued ${n} grants totalling ${formatUsd(quarterTotal(f.grants))}, an average of ${formatUsd(averageCheck(f.grants))} each.`;
}

/** "Paid October 24 for a design freelancer for the brand and landing page." */
export function grantSentence(g: QuarterlyGrant): string {
  const when = g.issuedAt ? ` ${longDate(g.issuedAt)}` : "";
  const narrative = g.paidFor?.trim().replace(/\s+/g, " ").replace(/\.$/, "");
  const purpose = narrative
    ? lowerFirst(narrative)
    : g.useOfFundsLabel && g.useOfFundsLabel !== "Other"
      ? g.useOfFundsLabel.toLowerCase()
      : null;
  return purpose ? `Paid${when} for ${purpose}.` : `Paid${when}.`;
}

function pipelineSentences(f: QuarterlyFigures): string[] {
  const p = f.pipeline;
  const out: string[] = [];
  out.push(
    p.received === 0
      ? "No applications came in this quarter."
      : `We received ${plural(p.received, "application")} this quarter.`
  );
  if (p.funded > 0 || p.declined > 0) {
    const decided = [
      p.funded > 0 ? `funded ${countWord(p.funded)}` : null,
      p.declined > 0 ? `declined ${countWord(p.declined)}` : null,
    ].filter((s): s is string => s !== null);
    out.push(`We ${joinList(decided)}.`);
  } else if (p.received > 0) {
    out.push("We have not decided any of them yet.");
  }
  if (p.inReview > 0) {
    out.push(`${p.inReview === 1 ? "One application is" : `${p.inReview} applications are`} still in review.`);
  }
  const reasons = p.declineReasons.filter((r) => r.count > 0).slice(0, 3);
  if (p.declined > 1 && reasons.length > 0) {
    out.push(
      `The ${reasons.length === 1 ? "most common reason" : "most common reasons"} for declining ${
        reasons.length === 1 ? "was" : "were"
      } ${joinList(reasons.map((r) => `${r.label.toLowerCase()} (${r.count})`))}.`
    );
  } else if (p.declined === 1 && reasons.length === 1) {
    out.push(`The reason recorded for the decline was ${reasons[0].label.toLowerCase()}.`);
  }
  return out;
}

function portfolioSentences(f: QuarterlyFigures): string[] {
  const out: string[] = [];
  for (const u of f.portfolio.updates) {
    const lead = u.changed
      ? `${u.companyName} moved to ${u.tierLabel.toLowerCase()}.`
      : `${u.companyName} checked in, still at ${u.tierLabel.toLowerCase()}.`;
    out.push(u.note?.trim() ? `${lead} ${sentence(u.note)}` : lead);
  }
  if (f.portfolio.updates.length === 0) {
    out.push("No grantee changed stage this quarter, and we recorded no check-ins.");
  }
  const standing = f.portfolio.standing.filter((s) => s.count > 0);
  const total = standing.reduce((n, s) => n + s.count, 0);
  if (total > 0) {
    out.push(
      `Of the ${plural(total, "company", "companies")} we have funded, ${joinList(
        standing.map((s) => `${countWord(s.count)} ${s.count === 1 ? "is" : "are"} at ${s.tierLabel.toLowerCase()}`)
      )}.`
    );
  }
  return out;
}

export type QuarterlyLetter = {
  /** "FY2026 Q2 · October 1 – December 31, 2026" */
  period: string;
  /** Set while the quarter is still running. */
  toDateNote: string | null;
  /** A quiet quarter gets one honest paragraph instead of the sections. */
  quiet: string | null;
  deployment: string;
  grants: { id: string; companyName: string; amount: string; sentence: string; why: string | null }[];
  pipeline: string;
  portfolio: string[];
  table: { label: string; value: string }[];
};

/** Numbers → sentences. Deterministic: the same figures always read the same. */
export function composeQuarterlyLetter(
  f: QuarterlyFigures,
  grantNotes: Record<string, string> = {}
): QuarterlyLetter {
  const last = new Date(new Date(f.end).getTime() - 86_400_000).toISOString();
  const quiet = isQuietQuarter(f);
  const total = quarterTotal(f.grants);
  const average = averageCheck(f.grants);

  const table: { label: string; value: string }[] = [];
  if (f.pool) {
    table.push(
      { label: `${f.pool.name} budget`, value: formatUsd(f.pool.budget) },
      { label: "Paid out to date", value: formatUsd(f.pool.deployed) },
      { label: "Committed, not yet paid", value: formatUsd(f.pool.committed) },
      { label: "Remaining", value: formatUsd(f.pool.remaining) }
    );
  }
  table.push(
    { label: "Grants issued this quarter", value: String(f.grants.length) },
    { label: "Dollars issued this quarter", value: formatUsd(total) }
  );
  if (average) table.push({ label: "Average check", value: formatUsd(average) });
  table.push(
    { label: "Applications received", value: String(f.pipeline.received) },
    { label: "Funded", value: String(f.pipeline.funded) },
    { label: "Declined", value: String(f.pipeline.declined) },
    { label: "In review", value: String(f.pipeline.inReview) }
  );

  return {
    period: `FY${f.fiscalYear} Q${f.quarter} · ${periodLabel(f)}`,
    toDateNote: f.inProgress
      ? `This quarter runs to ${longDate(last)}; the figures here are as of ${longDate(f.asOf)}.`
      : null,
    quiet: quiet
      ? [
          "This was a quiet quarter: no applications came in, no grants went out, and no grantee reported a change.",
          ...poolSentences(f),
        ].join(" ")
      : null,
    deployment: [...poolSentences(f), issuedSentence(f)].join(" "),
    grants: f.grants.map((g) => ({
      id: g.id,
      companyName: g.companyName,
      amount: formatUsd(g.amount),
      sentence: grantSentence(g),
      why: grantNotes[g.id]?.trim() || g.why?.trim() || null,
    })),
    pipeline: pipelineSentences(f).join(" "),
    portfolio: portfolioSentences(f),
    table,
  };
}

/** The first sentence or two of a longer rationale — enough for one line in the letter. */
export function firstSentences(text: string | null | undefined, maxChars = 240): string | null {
  const clean = text?.trim().replace(/\s+/g, " ");
  if (!clean) return null;
  const parts = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? [clean];
  let out = "";
  for (const part of parts) {
    if (out && (out + part).length > maxChars) break;
    out += part;
  }
  return sentence(out.trim().slice(0, maxChars * 2));
}

// ——— Email ———

const esc = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const P = 'style="margin:0 0 14px;font-size:15px;line-height:1.65;color:#27272a"';
const paragraphs = (text: string) =>
  text
    .trim()
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p ${P}>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

/** The letter as an email body (trusted HTML for `emailLayout`): everything escaped here. */
export function quarterlyEmailBody(input: {
  letter: QuarterlyLetter;
  salutation: string;
  /** Plain text of the partners' paragraphs (docToText). */
  opening: string;
  whatsNext: string;
  signoff: string;
}): string {
  const { letter } = input;
  const body = letter.quiet
    ? [`<p ${P}>${esc(letter.quiet)}</p>`]
    : [
        `<p ${P}>${esc(letter.deployment)}</p>`,
        ...letter.grants.map(
          (g) =>
            `<p ${P}><strong>${esc(g.companyName)}, ${esc(g.amount)}.</strong> ${esc(g.sentence)}${g.why ? ` ${esc(g.why)}` : ""}</p>`
        ),
        `<p ${P}>${esc(letter.pipeline)}</p>`,
        `<p ${P}>${esc(letter.portfolio.join(" "))}</p>`,
      ];
  const rows = letter.table
    .map(
      (r) =>
        `<tr><td style="padding:5px 12px 5px 0;font-size:13px;color:#52525b;border-top:1px solid #ececf0">${esc(r.label)}</td><td style="padding:5px 0;font-size:13px;color:#18181b;text-align:right;border-top:1px solid #ececf0">${esc(r.value)}</td></tr>`
    )
    .join("");
  return [
    `<p style="margin:0 0 14px;font-size:12px;color:#71717a">${esc(letter.period)}</p>`,
    `<p ${P}>${esc(input.salutation)}</p>`,
    paragraphs(input.opening),
    ...body,
    paragraphs(input.whatsNext),
    `<p ${P}>${esc(input.signoff)}</p>`,
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:18px 0 0">${rows}</table>`,
  ].join("\n");
}

export const DEFAULT_SALUTATION = "Dear supporters,";
export const defaultSignoff = (clubName: string) => `The partners, ${clubName}`;
