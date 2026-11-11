import type { UseOfFunds } from "@/db/schema";

/** Plain module so server pages (the LP letter) can read the labels too. */
export const USE_OF_FUNDS_LABELS: Record<UseOfFunds, string> = {
  incorporation: "Incorporation",
  legal: "Legal",
  api_credits: "API credits",
  hosting: "Hosting",
  hardware: "Hardware",
  design: "Design",
  marketing: "Marketing",
  travel: "Travel",
  prototyping: "Prototyping",
  other: "Other",
};
