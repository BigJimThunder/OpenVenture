import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  numeric,
} from "drizzle-orm/pg-core";
import { organization, member } from "./core";
import { application, company, file } from "./pipeline";

/**
 * Grants — the club's money module. Non-dilutive grants from an annual pool
 * (~$10k/yr, checks of $200–$4,000). No equity, so no allocations/ownership.
 * Derived, never stored: remaining = pool.totalBudget − Σ(issued) − Σ(committed).
 */

export const grantPool = pgTable("grant_pool", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  name: text("name").notNull(),
  /** e.g. 2026 for FY2026–27; display uses org.fiscalYearStartMonth. */
  fiscalYear: integer("fiscal_year").notNull(),
  totalBudget: numeric("total_budget", { precision: 20, scale: 2 }).notNull(),
  rolloverFromPrior: numeric("rollover_from_prior", { precision: 20, scale: 2 })
    .notNull()
    .default("0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const USE_OF_FUNDS = [
  "incorporation",
  "legal",
  "api_credits",
  "hosting",
  "hardware",
  "design",
  "marketing",
  "travel",
  "prototyping",
  "other",
] as const;
export type UseOfFunds = (typeof USE_OF_FUNDS)[number];

export const GRANT_STATUSES = [
  "proposed",
  "approved",
  "issued",
  "cashed",
  "reconciled",
  "cancelled",
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

export const PAYMENT_METHODS = ["check", "ach", "venmo", "zelle", "reimbursement", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const grant = pgTable("grant", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  poolId: uuid("pool_id")
    .notNull()
    .references(() => grantPool.id),
  applicationId: uuid("application_id").references(() => application.id),
  companyId: uuid("company_id")
    .notNull()
    .references(() => company.id),
  status: text("status").$type<GrantStatus>().notNull().default("proposed"),
  amountRequested: numeric("amount_requested", { precision: 20, scale: 2 }),
  amountAwarded: numeric("amount_awarded", { precision: 20, scale: 2 }).notNull(),
  useOfFunds: text("use_of_funds").$type<UseOfFunds>().notNull().default("other"),
  useOfFundsNarrative: text("use_of_funds_narrative"),
  /** Optional milestone the grant is contingent on. */
  milestone: text("milestone"),
  paymentMethod: text("payment_method").$type<PaymentMethod>(),
  paymentRef: text("payment_ref"),
  /** Links back to the decision trail. */
  memoId: uuid("memo_id"),
  voteRoundId: uuid("vote_round_id"),
  approvedByMemberId: uuid("approved_by_member_id").references(() => member.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  cashedAt: timestamp("cashed_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const receipt = pgTable("receipt", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organization.id),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => grant.id, { onDelete: "cascade" }),
  fileId: uuid("file_id").references(() => file.id),
  amount: numeric("amount", { precision: 20, scale: 2 }).notNull(),
  vendor: text("vendor"),
  description: text("description"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedByMemberId: uuid("verified_by_member_id").references(() => member.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});
