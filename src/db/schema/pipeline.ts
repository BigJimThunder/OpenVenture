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
} from "drizzle-orm/pg-core";
import { organization, member } from "./core";

/**
 * Intake & pipeline.
 * An Application is what came in through the club's website form (via the
 * ingest endpoint or CSV import); it promotes to / links a Company record.
 * The default pipeline mirrors the club's real process:
 *   Applied → Screening → Coffee Chat → Pitched Group → Decision → Funded | Declined
 */

// Stage kinds survive renames — funnel metrics group by kind, never by name.
export const STAGE_KINDS = ["active", "won", "lost", "parked"] as const;
export type StageKind = (typeof STAGE_KINDS)[number];

export const pipelineStage = pgTable("pipeline_stage", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  /** Fractional position for cheap reordering without reindexing. */
  position: numeric("position", { precision: 12, scale: 6 }).notNull(),
  kind: text("kind").$type<StageKind>().notNull().default("active"),
  colorToken: text("color_token").notNull().default("cat-1"),
  /** Warn when an application sits in this stage longer than this. */
  slaDays: integer("sla_days"),
  /** Club rule: e.g. Coffee Chat requires 2 attendees. */
  minAttendees: integer("min_attendees"),
  requiresMemo: boolean("requires_memo").notNull().default(false),
  requiresVote: boolean("requires_vote").notNull().default(false),
  isEntryStage: boolean("is_entry_stage").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sector = pgTable("sector", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  colorToken: text("color_token").notNull().default("cat-2"),
  position: integer("position").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const SOURCE_KINDS = [
  "inbound_form",
  "referral",
  "event",
  "class",
  "campus_org",
  "member_sourced",
  "accelerator",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const dealSource = pgTable("deal_source", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  kind: text("kind").$type<SourceKind>().notNull().default("other"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const COMPANY_STATUSES = ["prospect", "active", "portfolio", "inactive"] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];

/** Outcome tiers — the grant-world replacement for MOIC. Order matters. */
export const OUTCOME_TIERS = [
  "dormant",
  "incorporated",
  "launched",
  "revenue",
  "raised_round",
  "accelerator",
  "acquired",
] as const;
export type OutcomeTier = (typeof OUTCOME_TIERS)[number];

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    domain: text("domain"),
    logoUrl: text("logo_url"),
    oneLiner: text("one_liner"),
    description: text("description"),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    status: text("status").$type<CompanyStatus>().notNull().default("prospect"),
    /** Latest outcome tier for grantees; history lives in outcome_update. */
    outcomeTier: text("outcome_tier").$type<OutcomeTier>(),
    outcomeUpdatedAt: timestamp("outcome_updated_at", { withTimezone: true }),
    /** Provenance per auto-filled field: {field: {provider, confidence, url, fetchedAt}} */
    fieldSources: jsonb("field_sources").$type<Record<string, unknown>>().notNull().default({}),
    /** Human-edited fields that enrichment must never overwrite. */
    lockedFields: jsonb("locked_fields").$type<string[]>().notNull().default([]),
    custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("company_org_domain_idx").on(t.orgId, t.domain)]
);

export const companySector = pgTable(
  "company_sector",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    sectorId: uuid("sector_id")
      .notNull()
      .references(() => sector.id, { onDelete: "cascade" }),
  },
  (t) => [uniqueIndex("company_sector_pk").on(t.companyId, t.sectorId)]
);

export const contact = pgTable("contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  companyId: uuid("company_id").references(() => company.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  title: text("title"),
  isFounder: boolean("is_founder").notNull().default(true),
  isPrimary: boolean("is_primary").notNull().default(false),
  linkedinUrl: text("linkedin_url"),
  notes: text("notes"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const APPLICATION_STATUSES = ["open", "on_hold", "funded", "declined", "withdrawn"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const DECLINE_REASONS = [
  "too_early",
  "not_a_fit",
  "budget_exhausted",
  "team",
  "unresponsive",
  "duplicate",
  "outside_criteria",
  "other",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export const TEAM_COMPOSITIONS = ["solo", "cofounded"] as const;
export const TEAM_STUDENT_MIX = ["all_students", "mixed", "non_students"] as const;

export const application = pgTable("application", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => company.id),
  stageId: uuid("stage_id")
    .notNull()
    .references(() => pipelineStage.id),
  /** Fractional kanban position within the stage column. */
  position: numeric("position", { precision: 12, scale: 6 }).notNull().default("0"),
  status: text("status").$type<ApplicationStatus>().notNull().default("open"),
  ownerMemberId: uuid("owner_member_id").references(() => member.id),
  sourcedByMemberId: uuid("sourced_by_member_id").references(() => member.id),
  sourceId: uuid("source_id").references(() => dealSource.id),
  sourceDetail: text("source_detail"),

  // — grant ask, straight off the application form —
  amountRequested: numeric("amount_requested", { precision: 20, scale: 2 }),
  useOfFundsNarrative: text("use_of_funds_narrative"),
  pitchSummary: text("pitch_summary"),

  // — academic/team fields (analytics; low sensitivity, displayable) —
  applicantName: text("applicant_name"),
  applicantEmail: text("applicant_email"),
  department: text("department"),
  major: text("major"),
  school: text("school"),
  classYear: integer("class_year"),
  teamSize: integer("team_size"),
  teamComposition: text("team_composition"),
  teamStudentMix: text("team_student_mix"),
  /** Campus source: which org, event, dorm, class brought them in. */
  campusSource: text("campus_source"),
  howHeard: text("how_heard"),

  // — decision —
  declineReason: text("decline_reason").$type<DeclineReason>(),
  declineNote: text("decline_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  nextStep: text("next_step"),
  nextStepDue: timestamp("next_step_due", { withTimezone: true }),

  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
  enteredStageAt: timestamp("entered_stage_at", { withTimezone: true }).notNull().defaultNow(),
  custom: jsonb("custom").$type<Record<string, unknown>>().notNull().default({}),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Optional self-reported founder demographics. Write-once, aggregate-read ONLY.
 * Never joined into per-application views, admin UI, or CSV export. Every
 * aggregation passes through kAnonymize(minCellSize) — see src/lib/insights.
 * Deliberately keyed to the application with no name/email on the row itself.
 */
export const applicationDemographics = pgTable("application_demographics", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" })
    .unique(),
  gender: text("gender"),
  raceEthnicity: text("race_ethnicity"),
  firstGeneration: boolean("first_generation"),
  international: boolean("international"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Dedicated table (not just activity) — funnel/velocity analytics query it hard. */
export const stageHistory = pgTable("stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" }),
  fromStageId: uuid("from_stage_id").references(() => pipelineStage.id),
  toStageId: uuid("to_stage_id")
    .notNull()
    .references(() => pipelineStage.id),
  movedByMemberId: uuid("moved_by_member_id").references(() => member.id),
  movedAt: timestamp("moved_at", { withTimezone: true }).notNull().defaultNow(),
  secondsInPrevStage: integer("seconds_in_prev_stage"),
  note: text("note"),
});

// ——— Screening scorecard ———

export const screeningCriterion = pgTable("screening_criterion", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  label: text("label").notNull(),
  description: text("description"),
  position: integer("position").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const screeningScore = pgTable(
  "screening_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => screeningCriterion.id),
    scoredByMemberId: uuid("scored_by_member_id")
      .notNull()
      .references(() => member.id),
    /** 1–5 */
    score: integer("score").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("screening_score_unique").on(t.applicationId, t.criterionId, t.scoredByMemberId),
  ]
);

// ——— Coffee chats: the club's two-member gate before a group pitch ———

export const COFFEE_CHAT_VERDICTS = ["advance", "decline", "undecided"] as const;
export type CoffeeChatVerdict = (typeof COFFEE_CHAT_VERDICTS)[number];

export const coffeeChat = pgTable("coffee_chat", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  location: text("location"),
  happenedAt: timestamp("happened_at", { withTimezone: true }),
  debrief: text("debrief"),
  verdict: text("verdict").$type<CoffeeChatVerdict>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coffeeChatAttendee = pgTable(
  "coffee_chat_attendee",
  {
    coffeeChatId: uuid("coffee_chat_id")
      .notNull()
      .references(() => coffeeChat.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    /** Each attendee independently records whether they'd advance the company. */
    verdict: text("verdict").$type<CoffeeChatVerdict>(),
    note: text("note"),
  },
  (t) => [uniqueIndex("coffee_chat_attendee_pk").on(t.coffeeChatId, t.memberId)]
);

// ——— Notes, files, outcome history ———

export const applicationNote = pgTable("application_note", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" }),
  authorMemberId: uuid("author_member_id")
    .notNull()
    .references(() => member.id),
  body: text("body").notNull(),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const FILE_KINDS = ["deck", "one_pager", "budget", "receipt", "legal", "other"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const file = pgTable("file", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  applicationId: uuid("application_id").references(() => application.id, { onDelete: "set null" }),
  companyId: uuid("company_id").references(() => company.id, { onDelete: "set null" }),
  blobUrl: text("blob_url").notNull(),
  pathname: text("pathname").notNull(),
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  kind: text("kind").$type<FileKind>().notNull().default("other"),
  uploadedByMemberId: uuid("uploaded_by_member_id").references(() => member.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Quarterly check-in history per grantee — powers time-to-outcome charts. */
export const outcomeUpdate = pgTable("outcome_update", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => company.id, { onDelete: "cascade" }),
  tier: text("tier").notNull(),
  note: text("note"),
  recordedByMemberId: uuid("recorded_by_member_id").references(() => member.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
