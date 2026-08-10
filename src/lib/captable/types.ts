import { z } from "zod";

/**
 * Typed cap event payloads. These schemas are the single validation gate
 * between storage (jsonb payloads in cap_event) and the pure engine.
 */

export const StakeholderRef = z.object({
  id: z.string(),
  name: z.string(),
  kind: z
    .enum(["founder", "employee", "advisor", "angel", "fund", "accelerator", "pool", "other"])
    .default("other"),
});

export const FoundingIssuance = z.object({
  kind: z.literal("founding_issuance"),
  stakeholder: StakeholderRef,
  classId: z.string().default("common"),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative().optional(),
});

export const ShareIssuance = z.object({
  kind: z.literal("share_issuance"),
  stakeholder: StakeholderRef,
  classId: z.string(),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative().optional(),
});

export const PoolCreate = z.object({
  kind: z.enum(["pool_create", "pool_increase"]),
  classId: z.string().default("pool"),
  shares: z.number().positive(),
});

export const OptionGrant = z.object({
  kind: z.literal("option_grant"),
  stakeholder: StakeholderRef,
  classId: z.string().default("pool"),
  shares: z.number().positive(),
  strikePrice: z.number().nonnegative().optional(),
});

export const SafeIssue = z.object({
  kind: z.literal("safe_issue"),
  instrumentId: z.string(),
  stakeholder: StakeholderRef,
  principal: z.number().positive(),
  capType: z.enum(["pre_money", "post_money", "uncapped"]),
  valuationCap: z.number().positive().optional(),
  /** 0.20 = 20% discount. */
  discount: z.number().min(0).max(0.99).optional(),
  mfn: z.boolean().default(false),
});

export const NoteIssue = z.object({
  kind: z.literal("note_issue"),
  instrumentId: z.string(),
  stakeholder: StakeholderRef,
  principal: z.number().positive(),
  /** Simple annual interest, e.g. 0.06. */
  interestRate: z.number().min(0).max(1).default(0),
  issueDate: z.string(),
  capType: z.enum(["pre_money", "uncapped"]).default("pre_money"),
  valuationCap: z.number().positive().optional(),
  discount: z.number().min(0).max(0.99).optional(),
});

export const PricedRound = z.object({
  kind: z.literal("priced_round"),
  name: z.string(),
  classId: z.string(),
  preMoneyValuation: z.number().positive(),
  newMoney: z.number().positive(),
  /** e.g. 0.10 → unissued pool equals 10% of post-round FD. */
  targetPoolPctPost: z.number().min(0).max(0.5).optional(),
  participations: z
    .array(z.object({ stakeholder: StakeholderRef, amount: z.number().positive() }))
    .min(1),
  /** Conversion date for note interest accrual. */
  closeDate: z.string().optional(),
});

export const ShareTransfer = z.object({
  kind: z.literal("share_transfer"),
  fromStakeholderId: z.string(),
  toStakeholder: StakeholderRef,
  classId: z.string(),
  shares: z.number().positive(),
  pricePerShare: z.number().nonnegative().optional(),
});

export const StockSplit = z.object({
  kind: z.literal("stock_split"),
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive().default(1),
});

export const CapEventPayload = z.discriminatedUnion("kind", [
  FoundingIssuance,
  ShareIssuance,
  PoolCreate,
  OptionGrant,
  SafeIssue,
  NoteIssue,
  PricedRound,
  ShareTransfer,
  StockSplit,
]);

export type CapEventPayload = z.infer<typeof CapEventPayload>;

export const CapEventInput = z.object({
  seq: z.number().int().nonnegative(),
  effectiveDate: z.string(),
  label: z.string().optional(),
  payload: CapEventPayload,
});

export type CapEventInput = z.infer<typeof CapEventInput>;

// ——— Engine output ———

export type Position = {
  stakeholderId: string;
  stakeholderName: string;
  stakeholderKind: string;
  classId: string;
  shares: string; // decimal string
};

export type CapTableRow = {
  stakeholderId: string;
  name: string;
  kind: string;
  shares: string;
  pct: number; // fully-diluted ownership fraction
  byClass: Record<string, string>;
};

export type OutstandingInstrument = {
  instrumentId: string;
  holder: string;
  type: "safe" | "note";
  principal: string;
  capType: string;
  valuationCap?: string;
  discount?: number;
  mfn?: boolean;
};

export type DerivationStep = {
  label: string;
  /** Human-readable math, e.g. "$45,000 ÷ $6.13/sh = 7,341 shares" */
  math: string;
};

export type CapTableState = {
  engineVersion: string;
  rows: CapTableRow[];
  totalFullyDiluted: string;
  poolUnissued: string;
  outstanding: OutstandingInstrument[];
  pricePerShare?: string;
  lastRoundName?: string;
  /** "Show your work" — appended by each event, most recent round last. */
  derivations: DerivationStep[];
  warnings: string[];
};
