import Decimal from "decimal.js";
import type { CapEventInput, CapEventPayload } from "@/lib/captable/types";

/**
 * Presentation helpers for the Lab. Nothing here computes a cap table — the
 * engine does that. These only turn engine output and ledger payloads into
 * words, and keep one color per stakeholder across every view.
 */

export const POOL_ID = "__pool__";

export const KIND_LABELS: Record<CapEventPayload["kind"], string> = {
  founding_issuance: "Founding shares",
  share_issuance: "Shares issued",
  pool_create: "Option pool",
  pool_increase: "Pool increase",
  option_grant: "Option grant",
  safe_issue: "SAFE",
  note_issue: "Convertible note",
  priced_round: "Priced round",
  share_transfer: "Transfer",
  stock_split: "Stock split",
};

export const shares = (n: number | string) =>
  Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const dollars = (n: number | string) =>
  Number(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const pct = (fraction: number, digits = 2) => `${(fraction * 100).toFixed(digits)}%`;

/**
 * Percentage-point change between two engine-computed ownership fractions,
 * for the before/after column. A display diff of two outputs, done in
 * decimal so 0.1 + 0.2 never shows up as 0.30000000000000004.
 */
export function pointChange(before: number | undefined, after: number) {
  const delta = new Decimal(after).sub(before ?? 0).mul(100);
  const rounded = delta.toDecimalPlaces(2);
  const direction = rounded.isZero() ? "flat" : rounded.isPositive() ? "up" : "down";
  const sign = { flat: "", up: "+", down: "−" }[direction];
  return { direction, label: `${sign}${rounded.abs().toFixed(2)} pp` } as const;
}

const capTypeLabel = { post_money: "post-money", pre_money: "pre-money", uncapped: "uncapped" } as const;

/** One plain-English line per ledger event. */
export function describeEvent(p: CapEventPayload): string {
  switch (p.kind) {
    case "founding_issuance":
    case "share_issuance":
      return `${shares(p.shares)} ${p.classId} shares to ${p.stakeholder.name}`;
    case "pool_create":
    case "pool_increase":
      return `${shares(p.shares)} shares set aside for future hires`;
    case "option_grant":
      return `${shares(p.shares)} options to ${p.stakeholder.name}, out of the pool`;
    case "safe_issue":
      return [
        `${dollars(p.principal)} from ${p.stakeholder.name}`,
        p.valuationCap ? `${dollars(p.valuationCap)} ${capTypeLabel[p.capType]} cap` : "uncapped",
        p.discount ? `${Math.round(p.discount * 100)}% discount` : null,
        p.mfn ? "MFN" : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "note_issue":
      return [
        `${dollars(p.principal)} from ${p.stakeholder.name}`,
        `${(p.interestRate * 100).toFixed(1).replace(/\.0$/, "")}% interest`,
        p.valuationCap ? `${dollars(p.valuationCap)} cap` : "uncapped",
        p.discount ? `${Math.round(p.discount * 100)}% discount` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "priced_round":
      return [
        `${dollars(p.newMoney)} at ${dollars(p.preMoneyValuation)} pre-money`,
        p.targetPoolPctPost ? `pool topped up to ${Math.round(p.targetPoolPctPost * 100)}%` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "share_transfer":
      return `${shares(p.shares)} ${p.classId} shares to ${p.toStakeholder.name}`;
    case "stock_split":
      return `${p.numerator}-for-${p.denominator}: every share becomes ${p.numerator}`;
  }
}

const HOLDER_COLORS = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--cat-5)",
  "var(--cat-6)",
  "var(--cat-7)",
  "var(--cat-8)",
  "var(--cat-9)",
];
const NEUTRAL = "var(--cat-10)";

/**
 * A stable color per stakeholder, assigned in the order they first appear in
 * the ledger — so a holder keeps their color when a round reshuffles the
 * ranking. The unissued pool is always slate; past nine holders the rest
 * share slate too rather than inventing hues.
 */
export function holderColors(events: CapEventInput[], extraIds: string[] = []) {
  const order: string[] = [];
  const see = (id: string) => {
    if (id !== POOL_ID && !order.includes(id)) order.push(id);
  };
  for (const e of events) {
    const p = e.payload;
    if ("stakeholder" in p) see(p.stakeholder.id);
    if (p.kind === "share_transfer") see(p.toStakeholder.id);
    if (p.kind === "priced_round") p.participations.forEach((x) => see(x.stakeholder.id));
  }
  extraIds.forEach(see);
  return (id: string) => {
    if (id === POOL_ID) return NEUTRAL;
    const i = order.indexOf(id);
    return i >= 0 && i < HOLDER_COLORS.length ? HOLDER_COLORS[i] : NEUTRAL;
  };
}
