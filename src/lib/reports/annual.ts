import Decimal from "decimal.js";
import { z } from "zod";
import type { JSONContent } from "@tiptap/react";
import type { GrantStatus, MemberRole, OutcomeTier } from "@/db/schema";
import { COMMITTED_STATUSES, summarizePool, type GrantAmountRow } from "@/lib/grants/budget";
import { kAnonymize } from "@/lib/insights/k-anonymize";
import { docToText, isDocEmpty, textToDoc } from "@/lib/rich-text";

/**
 * The annual report: the publication a club hands its donors once a year.
 * Pure — no DB, no model — so the fiscal-year maths, the numbers, the first
 * draft and the "what still needs a human" checklist are unit-tested.
 *
 * Three pieces, kept apart on purpose:
 *  - `AnnualDerived` is everything the app already knows for the fiscal year
 *    (activity numbers, who was on the team, which companies were funded).
 *    It is computed live while the report is a draft and frozen into
 *    `report.snapshot.derived` at finalize.
 *  - `AnnualContent` is what members wrote, chose or overrode. It lives in
 *    `report.content` and is the only thing the builder saves.
 *  - `buildPublication(content, derived)` joins the two into the structure
 *    the reader view, the PDF and the plain-text export all render.
 */

// ——— Fiscal year ———

export type FiscalWindow = { start: Date; end: Date };

/** Fiscal year `fy` starts on the first of `startMonth` (1–12) in calendar year `fy`. */
export function fiscalYearWindow(fiscalYear: number, startMonth: number): FiscalWindow {
  return {
    start: new Date(Date.UTC(fiscalYear, startMonth - 1, 1)),
    end: new Date(Date.UTC(fiscalYear + 1, startMonth - 1, 1)),
  };
}

export function currentFiscalYear(startMonth: number, now: Date = new Date()): number {
  return now.getUTCMonth() >= startMonth - 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

/** "2026" for a calendar fiscal year, "2026–27" for one that straddles two. */
export function fiscalYearLabel(fiscalYear: number, startMonth: number): string {
  if (startMonth === 1) return String(fiscalYear);
  return `${fiscalYear}–${String((fiscalYear + 1) % 100).padStart(2, "0")}`;
}

export function inWindow(date: Date | string | null | undefined, window: FiscalWindow): boolean {
  if (!date) return false;
  const t = new Date(date).getTime();
  return t >= window.start.getTime() && t < window.end.getTime();
}

// ——— Derived facts (live while drafting; frozen at finalize) ———

export const STAT_KEYS = [
  "applications",
  "coffeeChats",
  "companiesFunded",
  "dollarsDeployed",
  "poolShare",
  "medianDaysToDecision",
  "memos",
  "votes",
  "meetings",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];

/** Shown in the activity sidebar unless a member hides them. The rest start hidden. */
const DEFAULT_VISIBLE_STATS: readonly StatKey[] = [
  "applications",
  "coffeeChats",
  "companiesFunded",
  "dollarsDeployed",
  "poolShare",
  "medianDaysToDecision",
];

export type DerivedStat = {
  /** Display value ("41", "$5,900", "54%"); null when the app has nothing to compute it from. */
  value: string | null;
  label: string;
};

export type Founder = { name: string; classYear: number | null };

export type DerivedMember = {
  id: string;
  name: string;
  role: MemberRole;
  title: string | null;
  classYear: number | null;
  bio: string | null;
  avatarUrl: string | null;
};

export type DerivedCompany = {
  companyId: string;
  applicationId: string | null;
  name: string;
  oneLiner: string | null;
  logoUrl: string | null;
  founders: Founder[];
  /** Total awarded across committed grants, as a numeric string. */
  grantTotal: string;
  /** "Prototyping", "Hosting and design" — what the money paid for. */
  grantUse: string;
  grantNarrative: string | null;
  /** ISO date of the first grant. */
  grantedAt: string | null;
  /** False for earlier portfolio companies offered as optional spreads. */
  inFiscalYear: boolean;
  outcomeTier: OutcomeTier | null;
  /** Check-in notes recorded since the grant, oldest first. */
  updates: { tier: string; note: string | null; recordedAt: string }[];
  /** Memo author, else the application owner. */
  defaultAuthorId: string | null;
};

export type DerivedUnfunded = {
  applicationId: string;
  name: string;
  oneLiner: string | null;
  founders: Founder[];
  status: "declined" | "withdrawn";
};

export type DerivedMeeting = { title: string; kind: string; date: string };

export type DerivedFact = { id: string; label: string; text: string };

export type AnnualDerived = {
  fiscalYear: number;
  label: string;
  window: { start: string; end: string };
  /** The fiscal year has not ended; every number is "to date". */
  inProgress: boolean;
  computedAt: string;
  org: { name: string; schoolName: string | null; logoUrl: string | null };
  stats: Record<StatKey, DerivedStat>;
  members: DerivedMember[];
  companies: DerivedCompany[];
  unfunded: DerivedUnfunded[];
  meetings: DerivedMeeting[];
  facts: DerivedFact[];
};

export type ActivityRows = {
  applications: { appliedAt: Date; decidedAt: Date | null; status: string }[];
  coffeeChats: { happenedAt: Date | null }[];
  memos: { createdAt: Date }[];
  /** `heldAt` is when the round closed or was revealed. */
  voteRounds: { status: string; heldAt: Date }[];
  grants: {
    companyId: string;
    status: GrantStatus;
    amountAwarded: string;
    approvedAt: Date | null;
    issuedAt: Date | null;
  }[];
  meetings: { status: string; scheduledAt: Date }[];
  /** The grant pool for this fiscal year and every grant drawn from it. */
  pool: { totalBudget: string; rolloverFromPrior: string } | null;
  poolGrants: GrantAmountRow[];
};

const PAID_STATUSES: readonly GrantStatus[] = ["issued", "cashed", "reconciled"];

function formatDollars(amount: Decimal): string {
  const whole = amount.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return `$${whole.toNumber().toLocaleString("en-US")}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function plural(count: number, one: string, many: string) {
  return count === 1 ? one : many;
}

/** When a grant counts toward a fiscal year: the day it was paid, else approved. */
export function grantDate(g: { issuedAt: Date | null; approvedAt: Date | null }): Date | null {
  return g.issuedAt ?? g.approvedAt;
}

/**
 * The activity numbers for one fiscal year. Rows outside the window are
 * ignored here, so callers may over-fetch.
 */
export function computeActivityStats(rows: ActivityRows, window: FiscalWindow): Record<StatKey, DerivedStat> {
  const applications = rows.applications.filter((a) => inWindow(a.appliedAt, window)).length;
  const coffeeChats = rows.coffeeChats.filter((c) => inWindow(c.happenedAt, window)).length;
  const memos = rows.memos.filter((m) => inWindow(m.createdAt, window)).length;
  const votes = rows.voteRounds.filter(
    (v) => (v.status === "closed" || v.status === "revealed") && inWindow(v.heldAt, window)
  ).length;
  const meetings = rows.meetings.filter(
    (m) => m.status === "completed" && inWindow(m.scheduledAt, window)
  ).length;

  const committed = rows.grants.filter(
    (g) => COMMITTED_STATUSES.includes(g.status) && inWindow(grantDate(g), window)
  );
  const companiesFunded = new Set(committed.map((g) => g.companyId)).size;
  const deployed = committed
    .filter((g) => PAID_STATUSES.includes(g.status))
    .reduce((sum, g) => sum.add(g.amountAwarded), new Decimal(0));

  let poolShare: string | null = null;
  if (rows.pool) {
    const summary = summarizePool(rows.pool, rows.poolGrants);
    if (summary.total > 0) {
      poolShare = `${new Decimal(summary.deployed).div(summary.total).mul(100).toDecimalPlaces(0).toNumber()}%`;
    }
  }

  const days = median(
    rows.applications
      .filter(
        (a) =>
          a.decidedAt &&
          (a.status === "funded" || a.status === "declined") &&
          inWindow(a.decidedAt, window)
      )
      .map((a) => Math.max(0, (a.decidedAt!.getTime() - a.appliedAt.getTime()) / 86_400_000))
  );

  return {
    applications: {
      value: String(applications),
      label: plural(applications, "application received", "applications received"),
    },
    coffeeChats: {
      value: String(coffeeChats),
      label: plural(coffeeChats, "coffee chat with a founder", "coffee chats with founders"),
    },
    companiesFunded: {
      value: String(companiesFunded),
      label: plural(companiesFunded, "company funded", "companies funded"),
    },
    dollarsDeployed: { value: formatDollars(deployed), label: "paid out in grants" },
    poolShare: { value: poolShare, label: "of the year's pool deployed" },
    medianDaysToDecision: {
      value: days == null ? null : String(Math.round(days)),
      label: "days from application to decision, at the median",
    },
    memos: {
      value: String(memos),
      label: plural(memos, "investment memo written", "investment memos written"),
    },
    votes: { value: String(votes), label: plural(votes, "vote held", "votes held") },
    meetings: { value: String(meetings), label: plural(meetings, "meeting held", "meetings held") },
  };
}

function sentenceList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Sentences a member can drop into "Limitations & looking forward". Each is
 * a fact from the ledger, never an opinion. Departments pass through
 * `kAnonymize`, so a department with fewer than five applicants is not named.
 */
export function computeFacts(input: {
  label: string;
  inProgress: boolean;
  pool: { totalBudget: string; rolloverFromPrior: string } | null;
  poolGrants: GrantAmountRow[];
  declineReasons: { label: string; count: number }[];
  departments: { label: string; count: number }[];
}): DerivedFact[] {
  const facts: DerivedFact[] = [];
  const soFar = input.inProgress ? " so far" : "";

  if (input.pool) {
    const s = summarizePool(input.pool, input.poolGrants);
    const total = formatDollars(new Decimal(s.total));
    const used = new Decimal(s.deployed).add(s.committed);
    if (s.total > 0 && s.remaining <= 0) {
      facts.push({
        id: "budget",
        label: "Budget",
        text: `We used the entire ${total} pool for ${input.label}.`,
      });
    } else if (s.total > 0) {
      const share = used.div(s.total).mul(100).toDecimalPlaces(0).toNumber();
      facts.push({
        id: "budget",
        label: "Budget",
        text: `We committed ${formatDollars(used)} of the ${total} pool${soFar} (${share}%), leaving ${formatDollars(new Decimal(s.remaining))} unspent.`,
      });
    }
  }

  const declined = input.declineReasons.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const declinedTotal = declined.reduce((n, r) => n + r.count, 0);
  if (declinedTotal > 0) {
    facts.push({
      id: "declines",
      label: "Decline reasons",
      text: `We declined ${declinedTotal} ${plural(declinedTotal, "application", "applications")}${soFar}: ${sentenceList(
        declined.map((r) => `${r.count} ${r.label.toLowerCase()}`)
      )}.`,
    });
  }

  const departments = kAnonymize(input.departments).filter((b) => b.label !== "Not shown (small group)");
  if (departments.length > 0) {
    facts.push({
      id: "departments",
      label: "Applications by department",
      text: `Most of our applications came from ${sentenceList(
        departments.slice(0, 4).map((d) => `${d.label} (${d.count})`)
      )}.`,
    });
  }
  return facts;
}

// ——— Content (report.content) ———

/** Tiptap JSON, as stored by the rich text editor. */
const docSchema = z
  .custom<JSONContent>((v) => typeof v === "object" && v !== null && (v as JSONContent).type === "doc")
  .nullable()
  .default(null);

const id = z.string().min(1).max(64);

/** http(s) only, or empty. The reader renders these with a plain <img>. */
export function isImageUrl(value: string): boolean {
  if (value === "") return true;
  if (value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
const imageUrl = z.string().refine(isImageUrl, "Image links must start with http:// or https://").default("");

const founderSchema = z.object({
  name: z.string().max(120),
  classYear: z.number().int().min(1950).max(2100).nullable().default(null),
});

export const SECTION_IDS = ["team", "mission", "companies", "programs", "looking_forward"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const ESSAY_STATES = ["empty", "starter", "ai", "edited"] as const;
export type EssayState = (typeof ESSAY_STATES)[number];

const photoSchema = z.object({ id, url: imageUrl, caption: z.string().max(200).default("") });

const companySchema = z.object({
  /** The company id. */
  id,
  applicationId: z.string().max(64).nullable().default(null),
  included: z.boolean().default(true),
  authorMemberId: z.string().max(64).nullable().default(null),
  /** Overrides; null means "use what the app knows". */
  oneLiner: z.string().max(400).nullable().default(null),
  founders: z.array(founderSchema).max(8).nullable().default(null),
  grantNote: z.string().max(400).nullable().default(null),
  essay: docSchema,
  /** `starter` = stitched from the memo, untouched; `ai` = unreviewed model draft. */
  essayState: z.enum(ESSAY_STATES).default("empty"),
  /** A second member has read the spread and signed it off. */
  reviewed: z.boolean().default(false),
  progress: docSchema,
  /** True until a member edits the progress text, so a refresh may update it. */
  progressAuto: z.boolean().default(false),
  logoUrl: imageUrl,
  photos: z.array(photoSchema).max(3).default([]),
});
export type AnnualCompany = z.infer<typeof companySchema>;

const statSchema = z.object({
  id,
  key: z.enum([...STAT_KEYS, "custom"]),
  hidden: z.boolean().default(false),
  /** Relabels a computed stat; the whole label for a custom one. */
  label: z.string().max(160).nullable().default(null),
  /** Custom stats only — things the app does not track ("17"). */
  value: z.string().max(40).nullable().default(null),
});
export type AnnualStat = z.infer<typeof statSchema>;

export const annualContentSchema = z.object({
  version: z.literal(1).default(1),
  cover: z
    .object({
      /** Empty = "Annual Report <year>". */
      title: z.string().max(120).default(""),
      subtitle: z.string().max(240).default(""),
      imageUrl,
    })
    .prefault({}),
  /** Order and inclusion of the body sections. */
  sections: z
    .array(
      z.object({
        id: z.enum(SECTION_IDS),
        included: z.boolean().default(true),
        /** Empty = the default section title. */
        title: z.string().max(120).default(""),
      })
    )
    .max(SECTION_IDS.length)
    .default([]),
  team: z
    .object({
      statement: docSchema,
      members: z
        .array(
          z.object({
            /** The member id. */
            id,
            included: z.boolean().default(true),
            /** Report-only overrides of the member profile. */
            title: z.string().max(120).nullable().default(null),
            bio: z.string().max(1200).nullable().default(null),
            photoUrl: imageUrl,
          })
        )
        .max(200)
        .default([]),
    })
    .prefault({}),
  mission: z
    .object({
      blocks: z
        .array(z.object({ id, heading: z.string().max(160).default(""), body: docSchema }))
        .max(8)
        .default([]),
      stats: z.array(statSchema).max(24).default([]),
    })
    .prefault({}),
  companies: z.array(companySchema).max(80).default([]),
  programs: z
    .array(
      z.object({
        id,
        title: z.string().max(160).default(""),
        narrative: docSchema,
        statsTitle: z.string().max(120).default(""),
        stats: z.array(z.string().max(300)).max(40).default([]),
        photoUrl: imageUrl,
        photoCaption: z.string().max(200).default(""),
      })
    )
    .max(12)
    .default([]),
  lookingForward: z
    .object({
      body: docSchema,
      unfunded: z
        .array(
          z.object({
            /** The application id. */
            id,
            included: z.boolean().default(true),
            name: z.string().max(160).nullable().default(null),
            founders: z.array(founderSchema).max(8).nullable().default(null),
            note: z.string().max(1500).default(""),
          })
        )
        .max(40)
        .default([]),
    })
    .prefault({}),
});
export type AnnualContent = z.infer<typeof annualContentSchema>;
export type AnnualTeamMember = AnnualContent["team"]["members"][number];
export type AnnualProgram = AnnualContent["programs"][number];
export type AnnualUnfunded = AnnualContent["lookingForward"]["unfunded"][number];

/**
 * Stored content → current shape. Never throws: unknown or malformed content
 * falls back to an empty report. Also the migration point — older shapes are
 * upgraded here — and it guarantees every section appears exactly once.
 */
export function parseAnnualContent(raw: unknown): AnnualContent {
  const parsed = annualContentSchema.safeParse(raw ?? {});
  const content = parsed.success ? parsed.data : annualContentSchema.parse({});
  const seen = new Set<SectionId>();
  const sections = content.sections.filter((s) => !seen.has(s.id) && seen.add(s.id));
  for (const sectionId of SECTION_IDS) {
    if (!seen.has(sectionId)) sections.push({ id: sectionId, included: true, title: "" });
  }
  return { ...content, sections };
}

/** What the reader needs when a report was finalized: the frozen facts. */
export function parseAnnualSnapshot(raw: unknown): AnnualDerived | null {
  const derived = (raw as { derived?: AnnualDerived } | null)?.derived;
  return derived && typeof derived === "object" && typeof derived.fiscalYear === "number" ? derived : null;
}

// ——— First draft ———

export const PROMPT_RE = /\[add:[^\]]*\]/g;

export function countPrompts(text: string): number {
  return text.match(PROMPT_RE)?.length ?? 0;
}

/** What the club already wrote about a company — the raw material for its essay. */
export type EssayMaterial = {
  companyName: string;
  oneLiner: string | null;
  founders: Founder[];
  pitchSummary: string | null;
  grantUse: string | null;
  grantNarrative: string | null;
  memoSections: { title: string; text: string }[];
  /** Funding request prose, already flattened to labelled paragraphs. */
  fundingRequest: { title: string; text: string }[];
  debriefs: { date: string; text: string }[];
  /** Rationales from REVEALED rounds only, without names. */
  rationales: string[];
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function firstSentences(text: string, max: number, limit = 480): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)/g) ?? (clean ? [clean] : []);
  let out = "";
  for (const s of sentences.slice(0, max)) {
    if (out && out.length + s.length > limit) break;
    out += s;
  }
  return (out || clean.slice(0, limit)).trim();
}

const FOUNDER_SECTION = /founder|team|people|why|thesis|recommend/i;

/**
 * A starting point for "Our thesis on X", stitched from what the club wrote
 * at the time. It is deliberately unfinished: the personal parts are left as
 * visible [add: …] prompts, because nobody but the author can supply them.
 */
export function starterEssay(material: EssayMaterial): string {
  const founder = firstName(material.founders[0]?.name ?? "") || "the founder";
  const paragraphs: string[] = [`[add: how you first met ${founder}, and what you noticed]`];

  const what = material.pitchSummary?.trim() || material.oneLiner?.trim();
  if (what) paragraphs.push(firstSentences(what, 3));

  const sections = material.memoSections.filter((s) => s.text.trim());
  const preferred = sections.filter((s) => FOUNDER_SECTION.test(s.title));
  const fromMemo = (preferred.length > 0 ? preferred : sections).slice(0, 2);
  for (const s of fromMemo) paragraphs.push(firstSentences(s.text, 3));
  if (fromMemo.length === 0) {
    const team = material.fundingRequest.find((f) => /team|summary/i.test(f.title) && f.text.trim());
    if (team) paragraphs.push(firstSentences(team.text, 3));
  }

  const debrief = material.debriefs.find((d) => d.text.trim());
  if (debrief) paragraphs.push(`From our coffee chat: ${firstSentences(debrief.text, 2, 360)}`);

  paragraphs.push(`[add: why you believe in ${founder}, in your own words]`);
  return paragraphs.join("\n\n");
}

const TIER_SENTENCE: Record<OutcomeTier, string> = {
  dormant: "is not being actively worked on right now",
  incorporated: "has incorporated",
  launched: "has launched",
  revenue: "is earning revenue",
  raised_round: "has raised an outside round",
  accelerator: "has been accepted into an accelerator",
  acquired: "has been acquired",
};

/** "Current progress", from the outcome tier and the check-in notes since the grant. */
export function progressFromOutcomes(company: DerivedCompany): string {
  const notes = company.updates
    .map((u) => u.note?.trim())
    .filter((n): n is string => Boolean(n))
    .map((n) => (/[.!?]$/.test(n) ? n : `${n}.`));
  const lead = company.outcomeTier
    ? `Since the grant, ${company.name} ${TIER_SENTENCE[company.outcomeTier]}.`
    : "";
  const text = [lead, ...notes].filter(Boolean).join(" ");
  return text || `[add: what ${company.name} has done since the grant]`;
}

export function unfundedNote(candidate: DerivedUnfunded): string {
  const what = candidate.oneLiner?.trim().replace(/[.!?]+$/, "");
  const lead = what ? `${candidate.name}: ${what}.` : `${candidate.name}.`;
  return `${lead} [add: how we helped, and where they are now]`;
}

const DEFAULT_BLOCKS = [
  { id: "mission", heading: "Our mission" },
  { id: "thesis", heading: "What we look for" },
  { id: "summary", heading: "In summary" },
] as const;

function docOrNull(text: string): JSONContent | null {
  return text.trim() ? textToDoc(text) : null;
}

/**
 * Bring a draft up to date with the data without touching anything a member
 * wrote. New team members, newly funded companies and new "supported but not
 * funded" candidates are appended; nothing is removed; prose is left alone,
 * except progress text nobody has edited yet, which follows the check-ins.
 * Called with an empty content this builds the whole first draft.
 */
export function syncAnnualContent(
  current: AnnualContent,
  derived: AnnualDerived,
  options: {
    materials?: Record<string, EssayMaterial>;
    /** Club settings; only used to prefill blocks that are still empty. */
    mission?: string;
    thesis?: string;
  } = {}
): AnnualContent {
  const content = parseAnnualContent(current);

  // Team: leadership first and included; analysts listed but left out by default.
  const rank: Record<MemberRole, number> = { admin: 0, partner: 1, analyst: 2, read_only: 3 };
  const knownMembers = new Set(content.team.members.map((m) => m.id));
  const newMembers = derived.members
    .filter((m) => !knownMembers.has(m.id) && m.role !== "read_only")
    .sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name))
    .map((m) => ({
      id: m.id,
      included: m.role === "admin" || m.role === "partner",
      title: null,
      bio: null,
      photoUrl: "",
    }));

  // Mission blocks and the activity sidebar.
  const blocks =
    content.mission.blocks.length > 0
      ? content.mission.blocks
      : DEFAULT_BLOCKS.map((b) => ({ ...b, body: null as JSONContent | null }));
  const prefilled = blocks.map((b) => {
    if (!isDocEmpty(b.body)) return b;
    if (b.id === "mission" && options.mission) return { ...b, body: docOrNull(options.mission) };
    if (b.id === "thesis" && options.thesis) return { ...b, body: docOrNull(options.thesis) };
    return b;
  });
  const knownStats = new Set(content.mission.stats.map((s) => s.key));
  const newStats = STAT_KEYS.filter((k) => !knownStats.has(k)).map((key) => ({
    id: key,
    key,
    hidden: !DEFAULT_VISIBLE_STATS.includes(key),
    label: null,
    value: null,
  }));

  // Company spreads.
  const byCompany = new Map(derived.companies.map((c) => [c.companyId, c]));
  const companies = content.companies.map((c) => {
    const d = byCompany.get(c.id);
    if (!d) return c;
    const untouched = c.progressAuto || isDocEmpty(c.progress);
    return {
      ...c,
      applicationId: c.applicationId ?? d.applicationId,
      authorMemberId: c.authorMemberId ?? d.defaultAuthorId,
      ...(untouched ? { progress: textToDoc(progressFromOutcomes(d)), progressAuto: true } : {}),
    };
  });
  const knownCompanies = new Set(companies.map((c) => c.id));
  for (const d of derived.companies) {
    if (knownCompanies.has(d.companyId)) continue;
    const material = options.materials?.[d.companyId];
    companies.push(
      companySchema.parse({
        id: d.companyId,
        applicationId: d.applicationId,
        included: d.inFiscalYear,
        authorMemberId: d.defaultAuthorId,
        essay: material ? textToDoc(starterEssay(material)) : null,
        essayState: material ? "starter" : "empty",
        progress: textToDoc(progressFromOutcomes(d)),
        progressAuto: true,
      })
    );
  }

  const knownUnfunded = new Set(content.lookingForward.unfunded.map((u) => u.id));
  const newUnfunded = derived.unfunded
    .filter((u) => !knownUnfunded.has(u.applicationId))
    .map((u) => ({
      id: u.applicationId,
      included: true,
      name: null,
      founders: null,
      note: unfundedNote(u),
    }));

  return {
    ...content,
    team: { ...content.team, members: [...content.team.members, ...newMembers] },
    mission: { blocks: prefilled, stats: [...content.mission.stats, ...newStats] },
    companies,
    lookingForward: {
      ...content.lookingForward,
      unfunded: [...content.lookingForward.unfunded, ...newUnfunded],
    },
  };
}

// ——— Edits ———

/**
 * One change to the content. Paths walk object keys; inside an array a
 * segment is the `id` of the element, so two members editing different
 * company spreads never overwrite each other.
 */
export type AnnualOp =
  | { op: "set"; path: string[]; value: unknown }
  | { op: "insert"; path: string[]; value: unknown }
  | { op: "remove"; path: string[] }
  | { op: "move"; path: string[]; by: -1 | 1 };

export const annualOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.array(z.string().max(64)).min(1).max(6), value: z.unknown() }),
  z.object({ op: z.literal("insert"), path: z.array(z.string().max(64)).min(1).max(6), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.array(z.string().max(64)).min(2).max(6) }),
  z.object({
    op: z.literal("move"),
    path: z.array(z.string().max(64)).min(2).max(6),
    by: z.union([z.literal(-1), z.literal(1)]),
  }),
]);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

type Node = Record<string, unknown> | unknown[];

function child(node: unknown, segment: string): unknown {
  if (FORBIDDEN_KEYS.has(segment)) throw new Error("Bad path");
  if (Array.isArray(node)) return node.find((el) => (el as { id?: unknown } | null)?.id === segment);
  if (node && typeof node === "object" && Object.hasOwn(node, segment)) {
    return (node as Record<string, unknown>)[segment];
  }
  return undefined;
}

function walk(root: unknown, path: string[]): unknown {
  return path.reduce(child, root);
}

/**
 * Apply edits and return new content. Throws on a path that does not exist —
 * the save action turns that into a validation error rather than guessing.
 * The result is re-validated against the schema by the caller.
 */
export function applyAnnualOps(content: AnnualContent, ops: AnnualOp[]): AnnualContent {
  const next = structuredClone(content) as unknown as Node;
  for (const op of ops) {
    const parentPath = op.path.slice(0, -1);
    const last = op.path[op.path.length - 1];
    if (FORBIDDEN_KEYS.has(last)) throw new Error("Bad path");

    if (op.op === "insert") {
      const target = walk(next, op.path);
      if (!Array.isArray(target)) throw new Error(`Not a list: ${op.path.join(".")}`);
      target.push(op.value);
      continue;
    }

    const parent = walk(next, parentPath);
    if (parent == null || typeof parent !== "object") {
      throw new Error(`Nothing at ${parentPath.join(".")}`);
    }
    if (Array.isArray(parent)) {
      const index = parent.findIndex((el) => (el as { id?: unknown } | null)?.id === last);
      if (index < 0) throw new Error(`Nothing at ${op.path.join(".")}`);
      if (op.op === "set") parent[index] = op.value;
      else if (op.op === "remove") parent.splice(index, 1);
      else {
        const to = index + op.by;
        if (to >= 0 && to < parent.length) parent.splice(to, 0, ...parent.splice(index, 1));
      }
      continue;
    }
    if (op.op !== "set") throw new Error(`Not a list item: ${op.path.join(".")}`);
    (parent as Record<string, unknown>)[last] = op.value;
  }
  return next as unknown as AnnualContent;
}

/** What the author of a spread may change without being a partner. */
const AUTHOR_FIELDS = new Set([
  "essay",
  "essayState",
  "progress",
  "progressAuto",
  "oneLiner",
  "founders",
  "grantNote",
  "logoUrl",
  "photos",
]);

/**
 * Analysts edit the spreads they are the author of, and nothing else.
 * Partners and admins may apply any op; this guard is for everyone below.
 */
export function opAllowedForAuthor(op: AnnualOp, content: AnnualContent, memberId: string): boolean {
  if (op.op !== "set" || op.path.length !== 3 || op.path[0] !== "companies") return false;
  const company = content.companies.find((c) => c.id === op.path[1]);
  return company?.authorMemberId === memberId && AUTHOR_FIELDS.has(op.path[2]);
}

// ——— The publication (content × derived) ———

export const SECTION_TITLES: Record<SectionId, string> = {
  team: "The Team",
  mission: "Mission, Thesis & Activity",
  companies: "Our Theses",
  programs: "Programs & Events",
  looking_forward: "Limitations & Looking Forward",
};

export const DEFAULT_TITLES: Record<MemberRole, string> = {
  admin: "Officer",
  partner: "Partner",
  analyst: "Analyst",
  read_only: "Advisor",
};

export function formatFounder(f: Founder): string {
  return f.classYear ? `${f.name} ’${String(f.classYear % 100).padStart(2, "0")}` : f.name;
}

export type PublicationStat = { id: string; value: string; label: string };

export type PublicationCompany = {
  id: string;
  name: string;
  oneLiner: string;
  founders: Founder[];
  logoUrl: string;
  grantLine: string;
  author: { name: string; title: string } | null;
  essay: JSONContent | null;
  progress: JSONContent | null;
  photos: { id: string; url: string; caption: string }[];
};

export type Publication = {
  orgName: string;
  schoolName: string | null;
  label: string;
  inProgress: boolean;
  cover: { title: string; subtitle: string; imageUrl: string };
  /** Included sections in reading order. */
  sections: { id: SectionId; title: string }[];
  team: {
    statement: JSONContent | null;
    members: { id: string; name: string; title: string; bio: string; photoUrl: string }[];
  };
  mission: {
    blocks: { id: string; heading: string; body: JSONContent | null }[];
    stats: PublicationStat[];
  };
  companies: PublicationCompany[];
  programs: {
    id: string;
    title: string;
    narrative: JSONContent | null;
    statsTitle: string;
    stats: string[];
    photoUrl: string;
    photoCaption: string;
  }[];
  lookingForward: {
    body: JSONContent | null;
    unfunded: { id: string; name: string; founders: Founder[]; note: string }[];
  };
};

export function resolveStats(content: AnnualContent, derived: AnnualDerived): PublicationStat[] {
  const stats: PublicationStat[] = [];
  for (const s of content.mission.stats) {
    if (s.hidden) continue;
    if (s.key === "custom") {
      if (s.value?.trim()) stats.push({ id: s.id, value: s.value.trim(), label: s.label?.trim() ?? "" });
      continue;
    }
    const d = derived.stats[s.key];
    if (d?.value != null) stats.push({ id: s.id, value: d.value, label: s.label?.trim() || d.label });
  }
  return stats;
}

function grantLine(company: DerivedCompany, note: string | null): string {
  const amount = formatDollars(new Decimal(company.grantTotal || 0));
  const use = note?.trim() || company.grantNarrative?.trim() || company.grantUse;
  return use ? `${amount} grant · ${use.replace(/[.]+$/, "")}` : `${amount} grant`;
}

export function resolveMember(
  entry: AnnualTeamMember,
  member: DerivedMember | undefined
): { id: string; name: string; title: string; bio: string; photoUrl: string } | null {
  if (!member) return null;
  return {
    id: entry.id,
    name: member.name,
    title: entry.title?.trim() || member.title?.trim() || DEFAULT_TITLES[member.role],
    bio: entry.bio?.trim() || member.bio?.trim() || "",
    photoUrl: entry.photoUrl || member.avatarUrl || "",
  };
}

export function buildPublication(rawContent: AnnualContent, derived: AnnualDerived): Publication {
  const content = parseAnnualContent(rawContent);
  const members = new Map(derived.members.map((m) => [m.id, m]));
  const companies = new Map(derived.companies.map((c) => [c.companyId, c]));
  const unfunded = new Map(derived.unfunded.map((u) => [u.applicationId, u]));

  const team = content.team.members
    .filter((m) => m.included)
    .map((m) => resolveMember(m, members.get(m.id)))
    .filter((m) => m !== null);

  const spreads: PublicationCompany[] = [];
  for (const c of content.companies) {
    const d = companies.get(c.id);
    if (!c.included || !d) continue;
    const author = c.authorMemberId ? members.get(c.authorMemberId) : undefined;
    const authorEntry = content.team.members.find((m) => m.id === c.authorMemberId);
    spreads.push({
      id: c.id,
      name: d.name,
      oneLiner: c.oneLiner?.trim() || d.oneLiner?.trim() || "",
      founders: c.founders ?? d.founders,
      logoUrl: c.logoUrl || d.logoUrl || "",
      grantLine: grantLine(d, c.grantNote),
      author: author
        ? {
            name: firstName(author.name),
            title: authorEntry?.title?.trim() || author.title?.trim() || DEFAULT_TITLES[author.role],
          }
        : null,
      essay: isDocEmpty(c.essay) ? null : c.essay,
      progress: isDocEmpty(c.progress) ? null : c.progress,
      photos: c.photos.filter((p) => p.url),
    });
  }

  const sections = content.sections
    .filter((s) => s.included)
    .filter((s) => {
      if (s.id === "companies") return spreads.length > 0;
      if (s.id === "programs") return content.programs.some((p) => p.title.trim() || !isDocEmpty(p.narrative));
      return true;
    })
    .map((s) => ({ id: s.id, title: s.title.trim() || SECTION_TITLES[s.id] }));

  return {
    orgName: derived.org.name,
    schoolName: derived.org.schoolName,
    label: derived.label,
    inProgress: derived.inProgress,
    cover: {
      title: content.cover.title.trim() || `Annual Report ${derived.label}`,
      subtitle: content.cover.subtitle.trim(),
      imageUrl: content.cover.imageUrl,
    },
    sections,
    team: { statement: isDocEmpty(content.team.statement) ? null : content.team.statement, members: team },
    mission: {
      blocks: content.mission.blocks.filter((b) => !isDocEmpty(b.body)),
      stats: resolveStats(content, derived),
    },
    companies: spreads,
    programs: content.programs.filter((p) => p.title.trim() || !isDocEmpty(p.narrative)),
    lookingForward: {
      body: isDocEmpty(content.lookingForward.body) ? null : content.lookingForward.body,
      unfunded: content.lookingForward.unfunded
        .filter((u) => u.included && u.note.trim())
        .map((u) => {
          const d = unfunded.get(u.id);
          return {
            id: u.id,
            name: u.name?.trim() || d?.name || "",
            founders: u.founders ?? d?.founders ?? [],
            note: u.note.trim(),
          };
        })
        .filter((u) => u.name),
    },
  };
}

/** The whole report as Markdown — for assistants (MCP), search and pasting elsewhere. */
export function publicationToMarkdown(pub: Publication): string {
  const out: string[] = [`# ${pub.orgName} — ${pub.cover.title}`];
  if (pub.cover.subtitle) out.push(pub.cover.subtitle);
  for (const section of pub.sections) {
    if (section.id !== "companies") out.push(`## ${section.title}`);
    if (section.id === "team") {
      if (pub.team.statement) out.push(docToText(pub.team.statement));
      for (const m of pub.team.members) out.push(`**${m.name}**, ${m.title}${m.bio ? ` — ${m.bio}` : ""}`);
    } else if (section.id === "mission") {
      if (pub.mission.stats.length > 0) {
        out.push(pub.mission.stats.map((s) => `- ${s.value} ${s.label}`).join("\n"));
      }
      for (const b of pub.mission.blocks) out.push(`### ${b.heading}`, docToText(b.body));
    } else if (section.id === "companies") {
      for (const c of pub.companies) {
        out.push(`## Our thesis on ${c.name}`);
        const facts = [c.oneLiner, c.founders.map(formatFounder).join(" & "), c.grantLine].filter(Boolean);
        out.push(facts.join(" · "));
        if (c.author) out.push(`By ${c.author.name}, ${c.author.title}`);
        if (c.essay) out.push(docToText(c.essay));
        if (c.progress) out.push("### Current progress", docToText(c.progress));
      }
    } else if (section.id === "programs") {
      for (const p of pub.programs) {
        out.push(`### ${p.title}`);
        if (p.narrative) out.push(docToText(p.narrative));
        if (p.stats.length > 0) out.push(p.stats.map((s) => `- ${s}`).join("\n"));
      }
    } else {
      if (pub.lookingForward.body) out.push(docToText(pub.lookingForward.body));
      for (const u of pub.lookingForward.unfunded) {
        out.push(`**${u.name}** (${u.founders.map(formatFounder).join(" & ")}) — ${u.note}`);
      }
    }
  }
  return out.filter(Boolean).join("\n\n");
}

/** Two sentences for the email that announces the report. */
export function annualSummary(content: AnnualContent, derived: AnnualDerived): string {
  const s = derived.stats;
  const spreads = content.companies.filter((c) => c.included).length;
  const period = derived.inProgress ? `So far in ${derived.label}` : `In ${derived.label}`;
  const first = `${period} we received ${s.applications.value} ${s.applications.label.replace(" received", "")}, funded ${s.companiesFunded.value} ${plural(Number(s.companiesFunded.value), "company", "companies")} and paid out ${s.dollarsDeployed.value} in grants.`;
  const second =
    spreads > 0
      ? `The report has a short essay on ${spreads === 1 ? "the company" : `each of the ${spreads} companies`} we backed and why, and what we would do differently next year.`
      : "";
  return [first, second].filter(Boolean).join(" ");
}

// ——— Completion ———

export type SpreadStatus = "needs_essay" | "draft" | "reviewed";

export function spreadStatus(company: AnnualCompany): SpreadStatus {
  if (isDocEmpty(company.essay) || company.essayState === "starter" || company.essayState === "empty") {
    return "needs_essay";
  }
  return company.reviewed ? "reviewed" : "draft";
}

export type MissingItem = {
  /** Where the builder should jump: a section id, "cover", or "company:<id>". */
  target: string;
  kind: "essay" | "review" | "bio" | "prose" | "prompt" | "note";
  text: string;
};

export type SectionState = "ready" | "started" | "empty";

export type AnnualProgress = {
  sections: Record<SectionId, { state: SectionState; included: boolean }>;
  ready: number;
  total: number;
  missing: MissingItem[];
  /** "3 essays, 2 bios, looking forward" */
  summary: string;
};

function sectionState(missing: number, started: boolean): SectionState {
  if (missing === 0) return "ready";
  return started ? "started" : "empty";
}

/**
 * Per-section completion and the list of things only a human can supply.
 * Excluded sections, members, companies and candidates ask for nothing.
 */
export function annualProgress(rawContent: AnnualContent, derived: AnnualDerived): AnnualProgress {
  const content = parseAnnualContent(rawContent);
  const included = new Map(content.sections.map((s) => [s.id, s.included]));
  const members = new Map(derived.members.map((m) => [m.id, m]));
  const companies = new Map(derived.companies.map((c) => [c.companyId, c]));
  const missing: MissingItem[] = [];
  const counts: Record<SectionId, number> = { team: 0, mission: 0, companies: 0, programs: 0, looking_forward: 0 };
  const started: Record<SectionId, boolean> = {
    team: false,
    mission: false,
    companies: false,
    programs: false,
    looking_forward: false,
  };
  const add = (section: SectionId, item: MissingItem) => {
    counts[section]++;
    if (included.get(section)) missing.push(item);
  };

  // Team
  if (isDocEmpty(content.team.statement)) {
    add("team", { target: "team", kind: "prose", text: "Write the team statement" });
  } else started.team = true;
  const noBio = content.team.members
    .filter((m) => m.included)
    .map((m) => resolveMember(m, members.get(m.id)))
    .filter((m) => m !== null && !m.bio);
  if (noBio.length > 0) {
    add("team", {
      target: "team",
      kind: "bio",
      text: `${noBio.length} ${plural(noBio.length, "bio", "bios")} missing: ${noBio.map((m) => m!.name).join(", ")}`,
    });
  }
  if (content.team.members.some((m) => m.included && resolveMember(m, members.get(m.id))?.bio)) started.team = true;

  // Mission
  for (const b of content.mission.blocks) {
    const text = docToText(b.body);
    if (!text.trim()) {
      add("mission", { target: "mission", kind: "prose", text: `Mission: “${b.heading || "Untitled"}” is empty` });
    } else {
      started.mission = true;
      const prompts = countPrompts(text);
      if (prompts > 0) {
        add("mission", {
          target: "mission",
          kind: "prompt",
          text: `Mission: ${prompts} [add: …] ${plural(prompts, "prompt", "prompts")} left in “${b.heading}”`,
        });
      }
    }
  }

  // Company spreads
  for (const c of content.companies) {
    const d = companies.get(c.id);
    if (!c.included || !d) continue;
    const target = `company:${c.id}`;
    const status = spreadStatus(c);
    const essayPrompts = countPrompts(docToText(c.essay));
    const progressText = docToText(c.progress);
    if (status !== "needs_essay") started.companies = true;
    if (status === "needs_essay") {
      add("companies", { target, kind: "essay", text: `${d.name}: the essay is not written yet` });
    } else if (essayPrompts > 0) {
      add("companies", {
        target,
        kind: "prompt",
        text: `${d.name}: ${essayPrompts} [add: …] ${plural(essayPrompts, "prompt", "prompts")} left in the essay`,
      });
    } else if (status === "draft") {
      add("companies", { target, kind: "review", text: `${d.name}: the essay needs a second read` });
    }
    if (!progressText.trim() || countPrompts(progressText) > 0) {
      add("companies", { target, kind: "prose", text: `${d.name}: say what has happened since the grant` });
    }
  }

  // Programs
  const programs = content.programs;
  if (programs.length === 0) {
    add("programs", {
      target: "programs",
      kind: "prose",
      text: "Programs & events: add one, or leave the section out",
    });
  }
  for (const p of programs) {
    if (!isDocEmpty(p.narrative)) started.programs = true;
    else {
      add("programs", {
        target: "programs",
        kind: "prose",
        text: `Programs: “${p.title || "Untitled"}” has no narrative`,
      });
    }
  }

  // Looking forward
  const lfText = docToText(content.lookingForward.body);
  if (!lfText.trim()) {
    add("looking_forward", {
      target: "looking_forward",
      kind: "prose",
      text: "Write “Limitations & looking forward”",
    });
  } else started.looking_forward = true;
  for (const u of content.lookingForward.unfunded) {
    if (!u.included) continue;
    if (!u.note.trim() || countPrompts(u.note) > 0) {
      const name = u.name?.trim() || derived.unfunded.find((d) => d.applicationId === u.id)?.name || "A company";
      add("looking_forward", {
        target: "looking_forward",
        kind: "note",
        text: `${name}: finish the note, or leave it out`,
      });
    }
  }

  const sections = Object.fromEntries(
    SECTION_IDS.map((sectionId) => [
      sectionId,
      { state: sectionState(counts[sectionId], started[sectionId]), included: included.get(sectionId) ?? true },
    ])
  ) as AnnualProgress["sections"];
  const counted = SECTION_IDS.filter((s) => sections[s].included);

  const essays = missing.filter((m) => m.kind === "essay").length;
  const reviews = missing.filter((m) => m.kind === "review").length;
  const bios = noBio.length;
  const prompts = missing.filter((m) => m.kind === "prompt").length;
  const parts = [
    essays > 0 ? `${essays} ${plural(essays, "essay", "essays")}` : "",
    reviews > 0 ? `${reviews} ${plural(reviews, "review", "reviews")}` : "",
    included.get("team") && bios > 0 ? `${bios} ${plural(bios, "bio", "bios")}` : "",
    prompts > 0 ? `${prompts} unfinished ${plural(prompts, "prompt", "prompts")}` : "",
    included.get("looking_forward") && !lfText.trim() ? "looking forward" : "",
  ].filter(Boolean);

  return {
    sections,
    ready: counted.filter((s) => sections[s].state === "ready").length,
    total: counted.length,
    missing,
    summary: parts.join(", "),
  };
}

/** Raw material for a programs section: the year's meetings of one kind, as a list. */
export function meetingsAsStats(meetings: DerivedMeeting[], kind: string): string[] {
  const month = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return meetings
    .filter((m) => m.kind === kind)
    .map((m) => `${m.title} (${month.format(new Date(m.date))})`);
}
