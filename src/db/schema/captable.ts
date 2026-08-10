import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  jsonb,
  numeric,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, member } from "./core";
import { company } from "./pipeline";

/**
 * Cap Table Lab — a modeling sandbox decoupled from club money (the club
 * takes no equity). Immutable, ordered event ledger folded by the pure
 * engine in src/lib/captable/engine.ts. Rows here are storage; ALL math
 * lives in the engine. Snapshots are cache only.
 */

export const CAP_TABLE_SOURCES = ["manual", "founder_provided", "preset", "estimated"] as const;
export type CapTableSource = (typeof CAP_TABLE_SOURCES)[number];

export const capTable = pgTable("cap_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  /** Optional — Lab scenarios don't need a company. */
  companyId: uuid("company_id").references(() => company.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("USD"),
  source: text("source").$type<CapTableSource>().notNull().default("manual"),
  /** Scenario clones point at their base table. */
  isScenario: boolean("is_scenario").notNull().default(false),
  parentCapTableId: uuid("parent_cap_table_id"),
  notes: text("notes"),
  createdByMemberId: uuid("created_by_member_id").references(() => member.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const SECURITY_KINDS = ["common", "preferred", "option_pool"] as const;
export type SecurityKind = (typeof SECURITY_KINDS)[number];

export const securityClass = pgTable("security_class", {
  id: uuid("id").primaryKey().defaultRandom(),
  capTableId: uuid("cap_table_id")
    .notNull()
    .references(() => capTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<SecurityKind>().notNull(),
  position: integer("position").notNull().default(0),
  originalIssuePrice: numeric("original_issue_price", { precision: 20, scale: 10 }),
  liquidationMultiple: numeric("liquidation_multiple", { precision: 6, scale: 3 }).default("1"),
  seniorityRank: integer("seniority_rank"),
});

export const STAKEHOLDER_KINDS = [
  "founder",
  "employee",
  "advisor",
  "angel",
  "fund",
  "accelerator",
  "pool",
  "other",
] as const;
export type StakeholderKind = (typeof STAKEHOLDER_KINDS)[number];

export const stakeholder = pgTable("stakeholder", {
  id: uuid("id").primaryKey().defaultRandom(),
  capTableId: uuid("cap_table_id")
    .notNull()
    .references(() => capTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").$type<StakeholderKind>().notNull().default("other"),
  email: text("email"),
});

/**
 * The event ledger. `seq` is the authoritative fold order; `payload` is the
 * typed event body validated by the engine's Zod schemas (CapEventSchema).
 * A jsonb payload here (vs typed child tables) keeps the Lab flexible for
 * scenarios; the engine is the single validation gate either way.
 */
export const CAP_EVENT_KINDS = [
  "founding_issuance",
  "share_issuance",
  "pool_create",
  "pool_increase",
  "option_grant",
  "safe_issue",
  "note_issue",
  "priced_round",
  "share_transfer",
  "stock_split",
] as const;
export type CapEventKind = (typeof CAP_EVENT_KINDS)[number];

export const capEvent = pgTable(
  "cap_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    capTableId: uuid("cap_table_id")
      .notNull()
      .references(() => capTable.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    effectiveDate: timestamp("effective_date", { withTimezone: true }).notNull(),
    kind: text("kind").$type<CapEventKind>().notNull(),
    label: text("label"),
    /** Scenario-only events render dashed in the UI. */
    isProjected: boolean("is_projected").notNull().default(false),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdByMemberId: uuid("created_by_member_id").references(() => member.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cap_event_seq_unique").on(t.capTableId, t.seq)]
);

/** Cache only — deleted and recomputed on any event write. */
export const capTableSnapshot = pgTable("cap_table_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  capTableId: uuid("cap_table_id")
    .notNull()
    .references(() => capTable.id, { onDelete: "cascade" }),
  throughSeq: integer("through_seq").notNull(),
  engineVersion: text("engine_version").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
});
