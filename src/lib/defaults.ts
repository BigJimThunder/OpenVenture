/**
 * First-run defaults — what a brand-new deployment gets so it's usable
 * within 60 seconds of first login. The pipeline mirrors the real process
 * of a grant-making club, not a generic VC funnel.
 */

export const DEFAULT_STAGES = [
  { name: "Applied", slug: "applied", kind: "active", colorToken: "cat-10", isEntryStage: true, position: "1" },
  { name: "Screening", slug: "screening", kind: "active", colorToken: "cat-2", slaDays: 7, position: "2" },
  { name: "Coffee Chat", slug: "coffee-chat", kind: "active", colorToken: "cat-3", slaDays: 14, minAttendees: 2, position: "3" },
  { name: "Pitched Group", slug: "pitched-group", kind: "active", colorToken: "cat-9", requiresMemo: true, position: "4" },
  { name: "Decision", slug: "decision", kind: "active", colorToken: "cat-5", requiresVote: true, position: "5" },
  { name: "Funded", slug: "funded", kind: "won", colorToken: "cat-4", position: "6" },
  { name: "Declined", slug: "declined", kind: "lost", colorToken: "cat-7", position: "7" },
] as const;

export const DEFAULT_SECTORS = [
  { name: "AI / ML", slug: "ai-ml", colorToken: "cat-1" },
  { name: "Consumer", slug: "consumer", colorToken: "cat-2" },
  { name: "Fintech", slug: "fintech", colorToken: "cat-3" },
  { name: "Health", slug: "health", colorToken: "cat-4" },
  { name: "Climate", slug: "climate", colorToken: "cat-5" },
  { name: "Ed Tech", slug: "edtech", colorToken: "cat-6" },
  { name: "Dev Tools", slug: "devtools", colorToken: "cat-7" },
  { name: "Marketplace", slug: "marketplace", colorToken: "cat-8" },
  { name: "Hardware", slug: "hardware", colorToken: "cat-9" },
  { name: "Other", slug: "other", colorToken: "cat-10" },
] as const;

export const DEFAULT_SCREENING_CRITERIA = [
  { label: "Founder is a current student or recent alum", position: 1 },
  { label: "Clear, specific use of funds", position: 2 },
  { label: "Ask is within our check range", position: 3 },
  { label: "Evidence of momentum (users, waitlist, prototype)", position: 4 },
  { label: "Team can execute on the plan", position: 5 },
] as const;

export const DEFAULT_MEMO_SECTIONS = [
  { title: "Summary", guidance: "One paragraph: who they are, what they're building, what they're asking for.", position: 1, required: true },
  { title: "Team", guidance: "Who are the founders? Why are they the right people for this?", position: 2, required: true },
  { title: "Product & Traction", guidance: "What exists today? Users, revenue, waitlist, demos.", position: 3, required: true },
  { title: "Use of Funds", guidance: "Exactly what will our grant pay for, and what does it unlock?", position: 4, required: true },
  { title: "Risks", guidance: "What would make this fail? What are we uncertain about?", position: 5, required: true },
  { title: "Recommendation", guidance: "Fund or decline, the amount, and why.", position: 6, required: true },
] as const;

export const DEFAULT_ONBOARDING_TASKS = [
  { title: "Read the club thesis & criteria", kind: "read", position: 1, estimatedMinutes: 20 },
  { title: "Read two past investment memos", kind: "read", position: 2, estimatedMinutes: 40 },
  { title: "Shadow a coffee chat", kind: "meet", position: 3, estimatedMinutes: 45 },
  { title: "Complete the Cap Table Lab intro scenario", kind: "do", position: 4, estimatedMinutes: 30 },
  { title: "Own your first application end-to-end", kind: "do", position: 5 },
] as const;

export const DEFAULT_SOURCES = [
  { name: "Website form", kind: "inbound_form" },
  { name: "Member referral", kind: "member_sourced" },
  { name: "Pitch event", kind: "event" },
  { name: "Class / professor", kind: "class" },
  { name: "Campus org", kind: "campus_org" },
  { name: "Other", kind: "other" },
] as const;

/** Used when the admin's browser doesn't report a timezone during setup. */
export const DEFAULT_TIMEZONE = "America/New_York";
