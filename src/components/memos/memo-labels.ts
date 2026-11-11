import type { MemoRecommendation, MemoStatus } from "@/db/schema";

export const MEMO_STATUS: Record<
  MemoStatus,
  { label: string; variant: "neutral" | "info" | "warning" | "success" | "outline"; hint: string }
> = {
  draft: { label: "Draft", variant: "neutral", hint: "Being written. Only visible in this list until circulated." },
  in_review: { label: "In review", variant: "info", hint: "Shared for comments before it goes to the club." },
  circulated: { label: "Circulated", variant: "warning", hint: "Sent to the club. Waiting on a vote." },
  decided: { label: "Decided", variant: "success", hint: "The vote is done. Kept as the record." },
  archived: { label: "Archived", variant: "outline", hint: "Abandoned drafts." },
};

export const REC_LABEL: Record<MemoRecommendation, string> = {
  fund: "Fund",
  decline: "Decline",
  watch: "Watch",
  more_diligence: "More diligence",
};
