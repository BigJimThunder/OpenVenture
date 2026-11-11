import type { ApplicationStatus, DeclineReason } from "@/db/schema";

/** Display labels shared by server (activity summaries, prompts) and client. */

export const DECLINE_REASON_LABELS: Record<DeclineReason, string> = {
  too_early: "Too early",
  not_a_fit: "Not a fit",
  budget_exhausted: "Budget exhausted",
  team: "Team concerns",
  unresponsive: "Unresponsive",
  duplicate: "Duplicate",
  outside_criteria: "Outside criteria",
  other: "Other",
};

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  open: "Open",
  on_hold: "On hold",
  funded: "Funded",
  declined: "Declined",
  withdrawn: "Withdrawn",
};
