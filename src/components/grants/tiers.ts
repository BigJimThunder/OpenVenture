import type { OutcomeTier } from "@/db/schema";

/**
 * The outcome ladder, in order. Plain module (no "use client") so server
 * pages — the LP letter, the outcomes page — can read labels directly.
 */
export const TIER_META: Record<OutcomeTier, { label: string; colorToken: string; blurb: string }> = {
  dormant: { label: "Dormant", colorToken: "cat-10", blurb: "Stopped, or gone quiet" },
  incorporated: { label: "Incorporated", colorToken: "cat-2", blurb: "A legal company exists" },
  launched: { label: "Launched", colorToken: "cat-3", blurb: "Real users can use it" },
  revenue: { label: "Revenue", colorToken: "cat-4", blurb: "Someone has paid" },
  raised_round: { label: "Raised a round", colorToken: "cat-5", blurb: "Outside investors came in" },
  accelerator: { label: "Accelerator", colorToken: "cat-6", blurb: "Accepted to a program" },
  acquired: { label: "Acquired", colorToken: "cat-9", blurb: "Bought by another company" },
};

/** "Meaningful outcome" = revenue or better. The first rung above the line. */
export const FIRST_MEANINGFUL_TIER: OutcomeTier = "revenue";
