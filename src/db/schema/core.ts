import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Conventions (see /docs/architecture.md):
 * - UUID PKs generated app-side (uuidv7 preferred) so records sort by creation.
 * - Soft delete via archived_at — never hard delete; officer handover means
 *   someone always deletes something they shouldn't.
 * - org_id on every top-level table from day 1: multi-tenancy insurance.
 *   Costs nothing now; makes a later migration a config change, not a rewrite.
 * - text + CHECK-style unions (enforced in Drizzle types + Zod) instead of
 *   pgEnum for anything a club might change; lookup tables for configurables.
 */

export const organization = pgTable("organization", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  schoolName: text("school_name"),
  logoUrl: text("logo_url"),
  /** Signup restricted to these email domains, e.g. ["university.edu"]. Empty = no restriction. */
  allowedEmailDomains: jsonb("allowed_email_domains").$type<string[]>().notNull().default([]),
  fiscalYearStartMonth: integer("fiscal_year_start_month").notNull().default(7),
  timezone: text("timezone").notNull().default("America/New_York"),
  currency: text("currency").notNull().default("USD"),
  slackWebhookUrl: text("slack_webhook_url"),
  /** HMAC secret for the write-only application ingest endpoint. */
  ingestSecret: text("ingest_secret"),
  settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ——— Better Auth owns these four tables (names must match its Drizzle adapter) ———

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
},
  (t) => [
    index("session_user_idx").on(t.userId),
  ]
);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
},
  (t) => [
    index("account_user_idx").on(t.userId),
  ]
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
},
  (t) => [
    index("verification_identifier_idx").on(t.identifier),
  ]
);

// ——— Club membership (separate from auth: alumni keep records after their
//     auth account is gone; a member can exist before first login) ———

export const MEMBER_ROLES = ["admin", "partner", "analyst", "read_only"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["invited", "active", "alumni", "removed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/** Scheduled email a member can opt out of. */
export const EMAIL_CATEGORIES = ["digest", "reminders"] as const;
export type EmailCategory = (typeof EMAIL_CATEGORIES)[number];
export type EmailPrefs = Partial<Record<EmailCategory, boolean>> & {
  /** Set when the mail provider reports this address as undeliverable. */
  undeliverableSince?: string;
};

export const member = pgTable("member", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  /** Nullable until first login links the auth user. */
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").$type<MemberRole>().notNull().default("analyst"),
  status: text("status").$type<MemberStatus>().notNull().default("invited"),
  title: text("title"),
  classYear: integer("class_year"),
  cohort: text("cohort"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  linkedinUrl: text("linkedin_url"),
  /** Opt-in to appear on the club-visible investor-analysis leaderboard. */
  insightsOptIn: boolean("insights_opt_in").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * When the member finished the first-run welcome flow (confirmed their
   * profile). Null = send them through /start on their next visit.
   */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  major: text("major"),
  offboardedAt: timestamp("offboarded_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  /**
   * What this member has switched off for themselves. Absent = on. Sign-in
   * mail and mail a person sent on purpose are never subject to this.
   */
  emailPrefs: jsonb("email_prefs").$type<EmailPrefs>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
},
  (t) => [
    index("member_user_idx").on(t.userId),
    index("member_org_email_idx").on(t.orgId, t.email),
  ]
);

export const invitation = pgTable("invitation", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  email: text("email").notNull(),
  role: text("role").$type<MemberRole>().notNull().default("analyst"),
  cohort: text("cohort"),
  classYear: integer("class_year"),
  tokenHash: text("token_hash").notNull(),
  invitedByMemberId: uuid("invited_by_member_id").references(() => member.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ——— Activity: the append-only audit/feed table every module writes to.
//     Written from inside the authedAction wrapper so it can't be forgotten. ———

export const ACTOR_TYPES = ["member", "system", "integration"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const activity = pgTable("activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  actorMemberId: uuid("actor_member_id").references(() => member.id),
  actorType: text("actor_type").$type<ActorType>().notNull().default("member"),
  /** e.g. 'application.stage_changed', 'memo.circulated', 'grant.issued' */
  verb: text("verb").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  entityLabel: text("entity_label"),
  secondaryEntityType: text("secondary_entity_type"),
  secondaryEntityId: uuid("secondary_entity_id"),
  /** Prerendered human sentence so the feed renders without N+1 joins. */
  summary: text("summary").notNull(),
  /** {field: {from, to}} for changed fields only. Keep student PII out. */
  diff: jsonb("diff").$type<Record<string, { from: unknown; to: unknown }>>(),
},
  (t) => [
    index("activity_entity_idx").on(t.orgId, t.entityType, t.entityId, t.occurredAt),
    index("activity_org_time_idx").on(t.orgId, t.occurredAt),
    index("activity_org_verb_idx").on(t.orgId, t.verb),
  ]
);

// ——— Notification log: what the app has already sent on its own.
//     Scheduled jobs run daily and must be idempotent — a (kind, key) pair is
//     claimed here before sending, so a retried or overlapping run never
//     double-emails. Also the audit trail behind Settings → Automations. ———

export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    /** e.g. 'weekly_digest', 'sla_nudge', 'vote_reminder', 'founder_received' */
    kind: text("kind").notNull(),
    /** Dedupe key within the kind, e.g. `${memberId}:2026-W46` or an application id. */
    key: text("key").notNull(),
    /** Who it went to (email or 'slack'); null for jobs with no recipient. */
    recipient: text("recipient"),
    summary: text("summary"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notification_log_unique").on(t.orgId, t.kind, t.key),
    index("notification_log_time_idx").on(t.orgId, t.kind, t.sentAt),
  ]
);

/**
 * One row per run of the scheduled jobs, so "did the reminders go out?" has
 * an answer that doesn't require reading server logs.
 */
export const JOB_TRIGGERS = ["schedule", "admin", "assistant"] as const;
export type JobTrigger = (typeof JOB_TRIGGERS)[number];

export const jobRun = pgTable(
  "job_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull().default("daily"),
    trigger: text("trigger").$type<JobTrigger>().notNull().default("schedule"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Null while running; false if any job reported an error. */
    ok: boolean("ok"),
    emails: integer("emails").notNull().default(0),
    failures: integer("failures").notNull().default(0),
    /** The full per-job report (counts and error messages; never content). */
    report: jsonb("report").$type<Record<string, unknown>>(),
  },
  (t) => [index("job_run_started_idx").on(t.kind, t.startedAt)]
);
