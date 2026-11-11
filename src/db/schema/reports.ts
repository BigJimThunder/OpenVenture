import { pgTable, text, timestamp, uuid, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { organization, member } from "./core";
import { application } from "./pipeline";

/**
 * Reports the club writes and sends up: the funding request for one company,
 * the quarterly LP letter, and the annual report.
 *
 * Numbers in a report are never stored here — they are recomputed from live
 * data every time a draft renders, and frozen into `snapshot` only when the
 * report is finalized (so a sent report can't silently change afterwards).
 * `content` holds what a human wrote or approved: prose, line items,
 * section order, which companies to feature.
 */
export const REPORT_KINDS = ["funding_request", "quarterly", "annual"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_STATUSES = ["draft", "final", "sent"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const report = pgTable(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    kind: text("kind").$type<ReportKind>().notNull(),
    /**
     * Identifies the report within its kind: the application id for a funding
     * request, "FY2026-Q2" for a quarterly letter, "FY2026" for an annual report.
     */
    periodKey: text("period_key").notNull(),
    /** Set for funding requests. */
    applicationId: uuid("application_id").references(() => application.id),
    title: text("title").notNull(),
    status: text("status").$type<ReportStatus>().notNull().default("draft"),
    /** Human-authored content; shape is per kind (see src/lib/reports/*). */
    content: jsonb("content").$type<Record<string, unknown>>().notNull().default({}),
    /** Derived numbers frozen at finalize time. Null while drafting. */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
    createdByMemberId: uuid("created_by_member_id").references(() => member.id),
    updatedByMemberId: uuid("updated_by_member_id").references(() => member.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByMemberId: uuid("finalized_by_member_id").references(() => member.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Who it was sent to (emails), for the record. */
    sentTo: jsonb("sent_to").$type<string[]>(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("report_org_kind_period_idx").on(t.orgId, t.kind, t.periodKey)]
);

/**
 * Personal access tokens. A member creates one to let their own AI assistant
 * (or a script) act as them through the MCP endpoint. Only the SHA-256 hash is
 * stored; the token is shown once. A token carries the member's role and never
 * more — and a `read` token can't write even if the member can.
 */
export const API_TOKEN_SCOPES = ["read", "write"] as const;
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];

export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organization.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    name: text("name").notNull(),
    /** SHA-256 hex of the full token. */
    tokenHash: text("token_hash").notNull(),
    /** First characters of the token, for recognising it in a list. */
    prefix: text("prefix").notNull(),
    scope: text("scope").$type<ApiTokenScope>().notNull().default("read"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("api_token_hash_idx").on(t.tokenHash)]
);
