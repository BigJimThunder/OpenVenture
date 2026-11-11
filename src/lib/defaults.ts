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

/**
 * The default onboarding track. Required items come before a new member gets
 * into the app, so only things that can be done from the welcome flow are
 * required; anything that needs the app, or another person, is optional.
 */
export const PROCESS_DOC_TASK_TITLE = "How we decide: the pipeline in five minutes";

export const DEFAULT_CONFIDENTIALITY_TEXT = `What founders tell us stays inside the club. I won't share applications, memos, financials or anything said in a coffee chat with anyone outside it.

Votes are blind. I won't ask how anyone voted, or say how I did, before a partner reveals the round.

If I know a founder personally, or have any stake in their company, I'll say so and recuse myself from the vote.`;

export const DEFAULT_ONBOARDING_TASKS = [
  {
    title: PROCESS_DOC_TASK_TITLE,
    kind: "read",
    position: 1,
    required: true,
    estimatedMinutes: 5,
    description: "How an application moves from the form to a funded grant, and where you come in.",
  },
  {
    title: "Blind votes and confidentiality",
    kind: "submit",
    position: 2,
    required: true,
    estimatedMinutes: 2,
    description: DEFAULT_CONFIDENTIALITY_TEXT,
  },
  {
    title: "Score your first application",
    kind: "do",
    position: 3,
    required: false,
    estimatedMinutes: 10,
    description:
      "Open any application in Screening and score it against the club's criteria. Ten minutes, and it is the fastest way to learn what we look for.",
  },
  {
    title: "Shadow a coffee chat",
    kind: "meet",
    position: 4,
    required: false,
    estimatedMinutes: 45,
    description: "Sit in on one founder conversation before you run your own. Ask in the club chat who has one this week.",
  },
] as const;

type DocBlock = { heading: string } | { text: string };

const PROCESS_DOC_BLOCKS: DocBlock[] = [
  {
    text: "We make small grants to student founders. Every application goes through the same five steps, and every member takes part in at least two of them. This page is the short version.",
  },
  { heading: "1. A founder applies" },
  {
    text: "Applications arrive through the club's form or are added by a member. Each one lands in Applied and is given an owner. The owner is responsible for moving it forward or declining it; nothing sits without a name on it.",
  },
  { heading: "2. The owner screens it" },
  {
    text: "Screening takes about ten minutes. Read the application, score it against the club's criteria, and either advance it or decline with a reason. A decline needs a reason because founders ask, and because next year's members will want to know why.",
  },
  { heading: "3. Two members have a coffee chat" },
  {
    text: "Thirty minutes with the founders. Both members log their own verdict afterwards, separately. The stage does not advance on one opinion.",
  },
  { heading: "4. Someone writes the memo" },
  {
    text: "A short document from the club's template: team, traction, use of funds, risks and a recommendation with an amount. A vote cannot open until the memo has been circulated.",
  },
  { heading: "5. The club votes, blind" },
  {
    text: "Everyone eligible votes with a written rationale. Nobody sees a tally, or who voted how, until a partner reveals the round. That keeps the first loud opinion from deciding the vote. If you know the founder, recuse yourself.",
  },
  { heading: "What we expect from you" },
  {
    text: "Keep what founders tell us inside the club. Vote on your own reading of the memo. If an application is yours, move it or say why it is stuck. The Inbox shows what is waiting on you.",
  },
];

/** The doc the default track's first item opens, as the docs table stores it. */
export function defaultProcessDoc() {
  return {
    title: "How we decide",
    slug: "how-we-decide",
    folder: "Process",
    contentJson: JSON.stringify({
      type: "doc",
      content: PROCESS_DOC_BLOCKS.map((b) =>
        "heading" in b
          ? { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: b.heading }] }
          : { type: "paragraph", content: [{ type: "text", text: b.text }] }
      ),
    }),
    contentText: PROCESS_DOC_BLOCKS.map((b) => ("heading" in b ? b.heading : b.text)).join("\n\n"),
  };
}

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
