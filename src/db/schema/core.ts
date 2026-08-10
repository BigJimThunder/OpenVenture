import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  jsonb,
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
});

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
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ——— Club membership (separate from auth: alumni keep records after their
//     auth account is gone; a member can exist before first login) ———

export const MEMBER_ROLES = ["admin", "partner", "analyst", "read_only"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ["invited", "active", "alumni", "removed"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

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
  offboardedAt: timestamp("offboarded_at", { withTimezone: true }),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
});
