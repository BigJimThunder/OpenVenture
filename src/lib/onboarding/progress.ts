import type { MemberRole, MemberStatus, OnboardingTaskKind } from "@/db/schema";

/**
 * The shape of one member's onboarding and every rule derived from it: which
 * stage of the pipeline they are in, which screen the welcome flow resumes on,
 * and when they may enter the rest of the app. Pure, so the flow, the admin
 * board and the nudge job all agree, and so it can be unit-tested.
 */

const DAY = 86_400_000;

/** Days a new invite gets to finish unless the admin picks otherwise. */
export const DEFAULT_DUE_DAYS = 14;

export type JourneyItem = {
  id: string;
  assignmentId: string;
  title: string;
  description: string | null;
  kind: OnboardingTaskKind;
  resourceUrl: string | null;
  docId: string | null;
  required: boolean;
  estimatedMinutes: number | null;
  completedAt: Date | null;
  /** An admin confirmed the member's own tick. */
  verified: boolean;
  /** An admin excused the item; it counts as done. */
  waived: boolean;
};

export type JourneyMember = {
  status: MemberStatus;
  role: MemberRole;
  classYear: number | null;
  major: string | null;
  onboardedAt: Date | null;
};

/**
 * There is no "profile confirmed" column. A member has confirmed their details
 * once class year and major are both filled in — the invite never sets major,
 * so only the member's own save can — or once they are through the flow.
 */
export function profileConfirmed(m: Pick<JourneyMember, "classYear" | "major" | "onboardedAt">): boolean {
  return Boolean(m.onboardedAt) || (m.classYear != null && Boolean(m.major?.trim()));
}

export type Summary = {
  requiredTotal: number;
  requiredDone: number;
  optionalTotal: number;
  optionalDone: number;
  /** The first required item still open — what the member is stuck on. */
  next: JourneyItem | null;
  minutesTotal: number;
  minutesLeft: number;
};

export function summarize(items: JourneyItem[]): Summary {
  const required = items.filter((i) => i.required);
  const optional = items.filter((i) => !i.required);
  const minutes = (list: JourneyItem[]) => list.reduce((n, i) => n + (i.estimatedMinutes ?? 0), 0);
  return {
    requiredTotal: required.length,
    requiredDone: required.filter((i) => i.completedAt).length,
    optionalTotal: optional.length,
    optionalDone: optional.filter((i) => i.completedAt).length,
    next: required.find((i) => !i.completedAt) ?? null,
    minutesTotal: minutes(required),
    minutesLeft: minutes(required.filter((i) => !i.completedAt)),
  };
}

export const STAGES = ["invited", "setup", "in_progress", "complete"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  invited: "Invited",
  setup: "Setting up",
  in_progress: "In progress",
  complete: "Complete",
};

export const STAGE_HINT: Record<Stage, string> = {
  invited: "Has the email, hasn't signed in",
  setup: "Signed in, details not confirmed",
  in_progress: "Working through required items",
  complete: "Every required item done",
};

export function stageOf(m: JourneyMember, items: JourneyItem[]): Stage {
  if (m.status === "invited") return "invited";
  if (!profileConfirmed(m)) return "setup";
  const s = summarize(items);
  return s.requiredDone === s.requiredTotal ? "complete" : "in_progress";
}

/** Whole days until the due date; negative once it has passed. */
export function daysUntilDue(dueAt: Date | null, now: Date): number | null {
  if (!dueAt) return null;
  return Math.ceil((dueAt.getTime() - now.getTime()) / DAY);
}

export function isOverdue(stage: Stage, dueAt: Date | null, now: Date): boolean {
  return stage !== "complete" && dueAt != null && dueAt.getTime() < now.getTime();
}

export function dueDateFrom(now: Date, days: number | null | undefined): Date | null {
  return days == null ? null : new Date(now.getTime() + days * DAY);
}

/**
 * The entry policy. Required items block the rest of the app. Admins may
 * always leave and come back (a founder must never be locked out of their own
 * club); everyone else gets in once their details are confirmed and nothing
 * required is left — unless the club has switched blocking off, in which case
 * confirmed details are enough and required items become reminders.
 */
export function entry(
  m: JourneyMember,
  items: JourneyItem[],
  /** Club preference `onboarding.blockUntilComplete`; strict when omitted. */
  opts: { blockUntilComplete?: boolean } = {}
) {
  const s = summarize(items);
  const ready = profileConfirmed(m) && s.requiredDone === s.requiredTotal;
  const strict = opts.blockUntilComplete ?? true;
  return {
    /** Everything required is done: onboarding is finished. */
    ready,
    /** May skip what is left for now. */
    // A club that doesn't block lets anyone in once their details are confirmed;
    // required items then stay on their list and in the reminders.
    canFinishLater: !ready && (m.role === "admin" || (!strict && profileConfirmed(m))),
  };
}

// ——— The welcome flow ———

export type FlowStep =
  | { key: "welcome"; kind: "welcome"; label: string }
  | { key: "profile"; kind: "profile"; label: string }
  | { key: "schedule"; kind: "schedule"; label: string }
  | { key: string; kind: "item"; label: string; item: JourneyItem }
  | { key: "extras"; kind: "extras"; label: string }
  | { key: "done"; kind: "done"; label: string };

/** Welcome → details → (class schedule) → one screen per required item → optional extras → done. */
export function buildSteps(
  items: JourneyItem[],
  /** Include the class-schedule step (clubs with a term set up). Never blocks. */
  opts: { schedule?: boolean } = {}
): FlowStep[] {
  const required = items.filter((i) => i.required);
  const hasOptional = items.some((i) => !i.required);
  return [
    { key: "welcome", kind: "welcome", label: "Welcome" },
    { key: "profile", kind: "profile", label: "Your details" },
    ...(opts.schedule ? [{ key: "schedule", kind: "schedule", label: "Your week" } as const] : []),
    ...required.map((item): FlowStep => ({ key: item.id, kind: "item", label: item.title, item })),
    ...(hasOptional ? [{ key: "extras", kind: "extras", label: "Also worth doing" } as const] : []),
    { key: "done", kind: "done", label: "Done" },
  ];
}

function stepDone(step: FlowStep, m: JourneyMember): boolean {
  if (step.kind === "profile") return profileConfirmed(m);
  if (step.kind === "item") return Boolean(step.item.completedAt);
  return step.kind !== "done";
}

/**
 * Which screen to show. With no request the flow resumes at the first thing
 * left to do (the welcome screen for someone who has done nothing yet). A
 * requested step is honoured only up to that point: going back is free, going
 * forward past an unfinished required step is not.
 */
export function resolveStep(steps: FlowStep[], m: JourneyMember, requested?: string | null): number {
  const firstOpen = steps.findIndex((s) => !stepDone(s, m));
  const frontier = firstOpen === -1 ? steps.length - 1 : firstOpen;
  if (requested) {
    const i = steps.findIndex((s) => s.key === requested);
    if (i !== -1) return Math.min(i, frontier);
  }
  // Someone arriving for the first time starts on the welcome screen.
  if (steps[frontier].kind === "profile") return 0;
  // Returning with only optional items left: go straight to the end.
  if (steps[frontier].kind === "done" && m.onboardedAt) return steps.length - 1;
  const extras = steps.findIndex((s) => s.kind === "extras");
  if (steps[frontier].kind === "done" && extras !== -1) return extras;
  return frontier;
}
