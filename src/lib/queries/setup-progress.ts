import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { application, grantPool, meeting, member, organization } from "@/db/schema";
import { orgSettings } from "@/lib/org-settings";

export type SetupStep = {
  key: "pool" | "stages" | "members" | "intake" | "email" | "application" | "meeting";
  title: string;
  /** Why it matters, in one sentence a new officer can act on. */
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

/**
 * The getting-started checklist. Every step is derived from real state (a
 * pool exists, a second member exists…) so it can't drift from the truth; only
 * "review your stages" needs an explicit acknowledgment.
 */
export async function getSetupProgress(org: typeof organization.$inferSelect) {
  const settings = orgSettings(org);
  const [[pools], [members], [apps], [meetings]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(grantPool).where(eq(grantPool.orgId, org.id)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(member)
      .where(and(eq(member.orgId, org.id), isNull(member.offboardedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(application)
      .where(eq(application.orgId, org.id)),
    db.select({ n: sql<number>`count(*)::int` }).from(meeting).where(eq(meeting.orgId, org.id)),
  ]);

  const steps: SetupStep[] = [
    {
      key: "pool",
      title: "Set this year's grant budget",
      description:
        "Every grant draws from a pool. Approvals are blocked the moment they would overdraw it.",
      href: "/settings#money",
      cta: "Create a pool",
      done: (pools?.n ?? 0) > 0,
    },
    {
      key: "stages",
      title: "Check the pipeline matches your process",
      description:
        "Applied → Screening → Coffee Chat → Pitched Group → Decision is the default. Rename, reorder or re-rule the stages to fit how your club actually decides.",
      href: "/settings#pipeline",
      cta: "Review stages",
      done: settings.setup.stagesReviewed,
    },
    {
      key: "members",
      title: "Invite your members",
      description:
        "Members sign in with their email — no passwords. Invite the officers first; they can invite everyone else.",
      href: "/members",
      cta: "Invite members",
      done: (members?.n ?? 0) > 1,
    },
    {
      key: "intake",
      title: "Open your application form",
      description:
        "Turn on the hosted form and share one link, or connect the form you already have. Either way, applications land in the pipeline on their own.",
      href: "/settings#intake",
      cta: "Set up intake",
      done: settings.apply.enabled || Boolean(org.ingestSecret),
    },
    {
      key: "email",
      title: "Connect email",
      description:
        "Sign-in links, vote reminders, the Monday digest and replies to founders all go out through Resend. Without it they only print to the server log.",
      href: "/settings#email",
      cta: "See how",
      done: Boolean(process.env.RESEND_API_KEY),
    },
    {
      key: "application",
      title: "Add your first application",
      description:
        "Have one in your inbox already? Add it by hand to see the whole flow: screen, coffee chat, memo, blind vote, grant.",
      href: "/pipeline",
      cta: "Open the pipeline",
      done: (apps?.n ?? 0) > 0,
    },
    {
      key: "meeting",
      title: "Schedule your next meeting",
      description:
        "Build the agenda, take attendance in two taps and assign action items that follow people around until they are done.",
      href: "/meetings",
      cta: "Schedule a meeting",
      done: (meetings?.n ?? 0) > 0,
    },
  ];

  const done = steps.filter((s) => s.done).length;
  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    dismissed: settings.setup.dismissed,
  };
}

export type SetupProgressData = Awaited<ReturnType<typeof getSetupProgress>>;
