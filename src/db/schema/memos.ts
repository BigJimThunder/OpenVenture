import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
  numeric,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organization, member } from "./core";
import { application } from "./pipeline";

/**
 * Memos: templated sections, section-level versioning. The live draft is the
 * set of memo_section rows with versionId IS NULL; "circulate" copies them
 * into an immutable memo_version snapshot. No CRDT, no Tiptap Cloud.
 *
 * Votes: blind until reveal — an APPLICATION invariant. Only
 * getVoteRoundResults() may read vote rows pre-reveal (returns counts only,
 * chair included). Never ship unrevealed votes to the client.
 */

export const memoTemplate = pgTable("memo_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  description: text("description"),
  isDefault: boolean("is_default").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const memoTemplateSection = pgTable("memo_template_section", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => memoTemplate.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  /** Grey placeholder prompt, e.g. "What's the wedge? Why now?" */
  guidance: text("guidance"),
  required: boolean("required").notNull().default(false),
});

export const MEMO_STATUSES = ["draft", "in_review", "circulated", "decided", "archived"] as const;
export type MemoStatus = (typeof MEMO_STATUSES)[number];

export const MEMO_RECOMMENDATIONS = ["fund", "decline", "watch", "more_diligence"] as const;
export type MemoRecommendation = (typeof MEMO_RECOMMENDATIONS)[number];

export const memo = pgTable(
  "memo",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    /** Per-org sequential number behind the human-readable ref (MEM-27). */
    ref: integer("ref").notNull(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => application.id),
    templateId: uuid("template_id").references(() => memoTemplate.id),
    title: text("title").notNull(),
    status: text("status").$type<MemoStatus>().notNull().default("draft"),
    authorMemberId: uuid("author_member_id")
      .notNull()
      .references(() => member.id),
    currentVersionNo: integer("current_version_no").notNull().default(0),
    recommendation: text("recommendation").$type<MemoRecommendation>(),
    proposedAmount: numeric("proposed_amount", { precision: 20, scale: 2 }),
    circulatedAt: timestamp("circulated_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memo_org_ref_idx").on(t.orgId, t.ref),
    index("memo_application_idx").on(t.applicationId),
  ]
);

export const memoVersion = pgTable(
  "memo_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memoId: uuid("memo_id")
      .notNull()
      .references(() => memo.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    createdByMemberId: uuid("created_by_member_id").references(() => member.id),
    changeSummary: text("change_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("memo_version_unique").on(t.memoId, t.versionNo)]
);

export const memoSection = pgTable("memo_section", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoId: uuid("memo_id")
    .notNull()
    .references(() => memo.id, { onDelete: "cascade" }),
  /** NULL = the live working draft; set = immutable snapshot row. */
  versionId: uuid("version_id").references(() => memoVersion.id, { onDelete: "cascade" }),
  templateSectionId: uuid("template_section_id").references(() => memoTemplateSection.id),
  title: text("title").notNull(),
  position: integer("position").notNull().default(0),
  /** Tiptap JSON. */
  contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
  /** Plain-text mirror for FTS + diffing. */
  contentText: text("content_text").notNull().default(""),
  wordCount: integer("word_count").notNull().default(0),
  updatedByMemberId: uuid("updated_by_member_id").references(() => member.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
},
  (t) => [
    index("memo_section_memo_idx").on(t.memoId),
  ]
);

export const memoComment = pgTable("memo_comment", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoId: uuid("memo_id")
    .notNull()
    .references(() => memo.id, { onDelete: "cascade" }),
  sectionId: uuid("section_id").references(() => memoSection.id, { onDelete: "cascade" }),
  parentCommentId: uuid("parent_comment_id"),
  authorMemberId: uuid("author_member_id")
    .notNull()
    .references(() => member.id),
  body: text("body").notNull(),
  mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
  /** {from, to, quotedText} for inline anchoring inside a section. */
  anchor: jsonb("anchor").$type<{ from: number; to: number; quotedText: string }>(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByMemberId: uuid("resolved_by_member_id").references(() => member.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
},
  (t) => [
    index("memo_comment_memo_idx").on(t.memoId),
  ]
);

// ——— IC voting ———

export const VOTE_METHODS = ["conviction", "fund_decline", "both"] as const;
export type VoteMethod = (typeof VOTE_METHODS)[number];

export const VOTE_ROUND_STATUSES = ["draft", "open", "closed", "revealed", "cancelled"] as const;
export type VoteRoundStatus = (typeof VOTE_ROUND_STATUSES)[number];

export const VOTE_OUTCOMES = ["fund", "decline", "revisit", "no_quorum"] as const;
export type VoteOutcome = (typeof VOTE_OUTCOMES)[number];

export const voteRound = pgTable("vote_round", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => application.id),
  memoId: uuid("memo_id").references(() => memo.id),
  meetingId: uuid("meeting_id"),
  title: text("title").notNull(),
  method: text("method").$type<VoteMethod>().notNull().default("both"),
  scaleMin: integer("scale_min").notNull().default(1),
  scaleMax: integer("scale_max").notNull().default(5),
  isBlind: boolean("is_blind").notNull().default(true),
  requireRationale: boolean("require_rationale").notNull().default(true),
  allowAmountSuggestion: boolean("allow_amount_suggestion").notNull().default(true),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  quorum: integer("quorum"),
  status: text("status").$type<VoteRoundStatus>().notNull().default("draft"),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  revealedByMemberId: uuid("revealed_by_member_id").references(() => member.id),
  outcome: text("outcome").$type<VoteOutcome>(),
  outcomeNote: text("outcome_note"),
  decidedByMemberId: uuid("decided_by_member_id").references(() => member.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
},
  (t) => [
    index("vote_round_memo_idx").on(t.memoId),
    index("vote_round_application_idx").on(t.applicationId),
    index("vote_round_org_status_idx").on(t.orgId, t.status),
  ]
);

export const voteEligibility = pgTable(
  "vote_eligibility",
  {
    voteRoundId: uuid("vote_round_id")
      .notNull()
      .references(() => voteRound.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    isRecused: boolean("is_recused").notNull().default(false),
    recusalReason: text("recusal_reason"),
  },
  (t) => [uniqueIndex("vote_eligibility_pk").on(t.voteRoundId, t.memberId)]
);

export const VOTE_DECISIONS = ["fund", "decline", "abstain"] as const;
export type VoteDecision = (typeof VOTE_DECISIONS)[number];

export const vote = pgTable(
  "vote",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voteRoundId: uuid("vote_round_id")
      .notNull()
      .references(() => voteRound.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    decision: text("decision").$type<VoteDecision>(),
    conviction: integer("conviction"),
    suggestedAmount: numeric("suggested_amount", { precision: 20, scale: 2 }),
    rationale: text("rationale"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vote_unique").on(t.voteRoundId, t.memberId)]
);
