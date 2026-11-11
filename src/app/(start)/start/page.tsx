import { orgSettings } from "@/lib/org-settings";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { and, asc, count, desc, eq, gt, isNull } from "drizzle-orm";
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  InboxIcon,
  ListChecksIcon,
  PlayIcon,
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  VoteIcon,
} from "lucide-react";
import { db } from "@/db";
import { activity, application, doc, meeting, member, voteEligibility, voteRound } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/actions/context";
import { getJourney, INVITED_VERB } from "@/lib/onboarding/load";
import { buildSteps, entry, resolveStep, type FlowStep } from "@/lib/onboarding/progress";
import { KIND_META } from "@/lib/onboarding/resource";
import { syncOnboarding } from "@/lib/onboarding/sync";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { RichTextView } from "@/components/editor/rich-text-view";
import { StartShell, StepBody, StepNav, primaryStepButton, type RailStep } from "@/components/onboarding/start-frame";
import {
  ExtrasStep,
  FinishLaterButton,
  ItemStep,
  ProfileStep,
  ScheduleFlowStep,
  SignOutLink,
} from "@/components/onboarding/start-steps";

export const metadata: Metadata = { title: "Welcome" };
export const dynamic = "force-dynamic";

const KIND_ICON = {
  read: <FileTextIcon />,
  watch: <PlayIcon />,
  submit: <ShieldCheckIcon />,
  do: <ListChecksIcon />,
  meet: <UsersIcon />,
} as const;

/** Dates in the club's timezone, not the server's. */
function inZone(date: Date, timeZone: string, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(date);
}

const href = (key: string) => `/start?step=${key}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * The new-member welcome flow. It lives outside the (app) route group on
 * purpose: the (app) layout redirects anyone who has not finished onboarding
 * here, so rendering this inside that layout would loop — and the flow should
 * not show the app's navigation anyway.
 *
 * Nothing about where a member is gets stored: the step shown is derived from
 * what they have done (see resolveStep), so closing the tab loses nothing.
 */
export default async function StartPage({ searchParams }: PageProps<"/start">) {
  const ctx = await getCtx();
  if (!ctx) {
    const session = await auth.api.getSession({ headers: await headers() });
    redirect(session?.user ? "/setup" : "/login");
  }
  const { step: stepParam } = await searchParams;
  const requested = typeof stepParam === "string" ? stepParam : null;

  let journey = await getJourney(ctx.org.id, ctx.member.id);
  if (!journey) redirect("/login");
  // Offer the class-schedule step only when the club has a term set up.
  const flow = { schedule: orgSettings(ctx.org).scheduling.terms.length > 0 };
  let steps = buildSteps(journey.items, flow);
  let index = resolveStep(steps, journey.member, requested);
  if (steps[index].kind === "done" && !journey.member.onboardedAt) {
    // Everything required is done but the marker is behind (e.g. an admin
    // waived the last item while this tab was open). Catch it up.
    journey = (await syncOnboarding(ctx.org.id, ctx.member.id))?.journey ?? journey;
    steps = buildSteps(journey.items, flow);
    index = resolveStep(steps, journey.member, requested);
  }
  const step = steps[index];
  const m = journey.member;
  const { canFinishLater } = entry(m, journey.items, orgSettings(ctx.org).onboarding);
  const back = index > 0 ? steps[index - 1].key : "welcome";
  const next = steps[Math.min(index + 1, steps.length - 1)].key;

  const frontier = resolveStep(steps, m, "done");
  const rail: RailStep[] = steps.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: i === index ? "current" : i < frontier || (s.kind === "item" && s.item.completedAt) ? "done" : "upcoming",
    href: i <= frontier ? href(s.key) : null,
  }));

  return (
    <StartShell
      orgName={ctx.org.name}
      email={m.email}
      steps={rail}
      minutesLeft={journey.summary.minutesLeft + (journey.profileConfirmed ? 0 : 1)}
      headerAction={
        m.onboardedAt && step.kind !== "done" ? (
          <Button variant="ghost" size="sm" asChild className="max-md:h-10">
            <Link href="/inbox">Back to the app</Link>
          </Button>
        ) : canFinishLater && !m.onboardedAt ? (
          <FinishLaterButton />
        ) : null
      }
      footer={<SignOutLink />}
    >
      {step.kind === "welcome" && <Welcome org={ctx.org} journey={journey} nextKey={next} />}
      {step.kind === "profile" && (
        <StepBody
          eyebrow="Your details"
          title="Check we have you right"
          lede="This is what the rest of the club sees next to your name. It takes a minute."
        >
          <ProfileStep
            key="profile"
            backKey={back}
            nextKey={next}
            defaults={{
              displayName: m.displayName,
              email: m.email,
              classYear: m.classYear,
              major: m.major,
              title: m.title,
              bio: m.bio,
              linkedinUrl: m.linkedinUrl,
            }}
          />
        </StepBody>
      )}
      {step.kind === "schedule" && (
        <StepBody
          eyebrow="Your week"
          title="When are you in class?"
          lede="Add your classes once and nobody has to ask when you're free. Coffee chats and meetings are suggested around them. Only you and the club's admins see what each block is."
        >
          <ScheduleFlowStep backKey={back} nextKey={next} />
        </StepBody>
      )}
      {step.kind === "item" && <Item orgId={ctx.org.id} step={step} backKey={back} nextKey={next} />}
      {step.kind === "extras" && (
        <StepBody
          eyebrow="Optional"
          title="Also worth doing"
          lede="You're through the required part. These are the things members say helped most in their first few weeks."
        >
          <ExtrasStep
            backKey={back}
            nextKey={next}
            items={journey.items
              .filter((i) => !i.required)
              .map((i) => ({
                id: i.id,
                assignmentId: i.assignmentId,
                title: i.title,
                description: i.description,
                kind: i.kind,
                resourceUrl: i.resourceUrl,
                done: Boolean(i.completedAt),
                minutes: i.estimatedMinutes,
              }))}
          />
        </StepBody>
      )}
      {step.kind === "done" && (
        <Done orgId={ctx.org.id} timeZone={ctx.org.timezone} memberId={m.id} name={m.displayName} canContribute={can(m.role, "contribute")} />
      )}
    </StartShell>
  );
}

async function Welcome({
  org,
  journey,
  nextKey,
}: {
  org: { id: string; name: string; timezone: string };
  journey: NonNullable<Awaited<ReturnType<typeof getJourney>>>;
  nextKey: string;
}) {
  const [inviter] = await db
    .select({ name: member.displayName })
    .from(activity)
    .innerJoin(member, eq(activity.actorMemberId, member.id))
    .where(and(eq(activity.orgId, org.id), eq(activity.verb, INVITED_VERB), eq(activity.entityId, journey.member.id)))
    .orderBy(desc(activity.occurredAt))
    .limit(1);
  const { summary } = journey;
  const required = journey.items.filter((i) => i.required);
  const minutes = summary.minutesTotal + 1;
  const due = journey.dueAt;

  return (
    <StepBody
      eyebrow={inviter ? `${inviter.name} invited you` : "You're in"}
      title={`Welcome to ${org.name}, ${firstName(journey.member.displayName)}`}
      lede={
        required.length > 0 ? (
          <span className="tnum">
            Before you get into the app there {required.length === 1 ? "is one thing" : `are ${required.length} things`} the
            club asks every new member to do. All of it takes about {minutes} minutes, and you can stop and pick up
            where you left off.
          </span>
        ) : (
          "One quick step and you're into the app: check the details we have for you."
        )
      }
    >
      <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
        <PlanRow icon={<UserIcon />} title="Confirm your details" meta="Name, class year, major · 1 min" />
        {required.map((i) => (
          <PlanRow
            key={i.id}
            icon={KIND_ICON[i.kind]}
            title={i.title}
            meta={`${KIND_META[i.kind].label}${i.estimatedMinutes ? ` · ${i.estimatedMinutes} min` : ""}`}
            done={Boolean(i.completedAt)}
          />
        ))}
        <PlanRow icon={<InboxIcon />} title="Into the app" meta="We show you what to do first" />
      </ol>
      {due && (
        <p className="mt-4 text-sm text-fg-muted">
          The club would like this done by <span className="font-medium text-fg">
            {inZone(due, org.timezone, { weekday: "long", month: "long", day: "numeric" })}
          </span>.
        </p>
      )}
      <StepNav>
        <Button asChild className={primaryStepButton}>
          <Link href={href(nextKey)}>
            Get started
            <ArrowRightIcon />
          </Link>
        </Button>
      </StepNav>
    </StepBody>
  );
}

function PlanRow({
  icon,
  title,
  meta,
  done,
}: {
  icon: React.ReactNode;
  title: string;
  meta: string;
  done?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-fg-muted [&_svg]:size-4">
        {done ? <CheckIcon className="text-success" strokeWidth={3} /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-medium">{title}</span>
        <span className="tnum block text-xs text-fg-subtle">{meta}</span>
      </span>
    </li>
  );
}

async function Item({
  orgId,
  step,
  backKey,
  nextKey,
}: {
  orgId: string;
  step: Extract<FlowStep, { kind: "item" }>;
  backKey: string;
  nextKey: string;
}) {
  const { item } = step;
  // Only docs every member can open are ever linked to a track (enforced on
  // save); the visibility check here covers a doc that was restricted since.
  const [linked] = item.docId
    ? await db
        .select({ contentJson: doc.contentJson })
        .from(doc)
        .where(and(eq(doc.id, item.docId), eq(doc.orgId, orgId), eq(doc.visibility, "all"), isNull(doc.archivedAt)))
        .limit(1)
    : [];
  let content: unknown = null;
  try {
    content = linked?.contentJson ? JSON.parse(linked.contentJson) : null;
  } catch {
    content = null;
  }
  const meta = KIND_META[item.kind];
  return (
    <StepBody
      wide={Boolean(content) || item.kind === "watch"}
      eyebrow={
        <span className="tnum">
          {meta.label}
          {item.estimatedMinutes ? ` · ${item.estimatedMinutes} min` : ""} · Required
        </span>
      }
      title={item.title}
    >
      <ItemStep
        key={item.id}
        backKey={backKey}
        nextKey={nextKey}
        item={{
          id: item.id,
          assignmentId: item.assignmentId,
          title: item.title,
          description: item.description,
          kind: item.kind,
          resourceUrl: item.resourceUrl,
          done: Boolean(item.completedAt),
        }}
        reader={content ? <RichTextView value={content as Parameters<typeof RichTextView>[0]["value"]} /> : undefined}
      />
    </StepBody>
  );
}

async function Done({
  orgId,
  timeZone,
  memberId,
  name,
  canContribute,
}: {
  orgId: string;
  timeZone: string;
  memberId: string;
  name: string;
  canContribute: boolean;
}) {
  const now = new Date();
  // Eligibility rows only — ballots are never read here.
  const [[votes], [unowned], [nextMeeting]] = await Promise.all([
    db
      .select({ n: count() })
      .from(voteRound)
      .innerJoin(voteEligibility, eq(voteEligibility.voteRoundId, voteRound.id))
      .where(
        and(
          eq(voteRound.orgId, orgId),
          eq(voteRound.status, "open"),
          eq(voteEligibility.memberId, memberId),
          eq(voteEligibility.isRecused, false)
        )
      ),
    db
      .select({ n: count() })
      .from(application)
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.status, "open"),
          isNull(application.ownerMemberId),
          isNull(application.archivedAt)
        )
      ),
    db
      .select({ id: meeting.id, title: meeting.title, scheduledAt: meeting.scheduledAt, location: meeting.location })
      .from(meeting)
      .where(and(eq(meeting.orgId, orgId), gt(meeting.scheduledAt, now)))
      .orderBy(asc(meeting.scheduledAt))
      .limit(1),
  ]);
  const openVotes = votes?.n ?? 0;
  const unownedCount = unowned?.n ?? 0;

  return (
    <StepBody
      eyebrow="Done"
      title={`That's everything, ${firstName(name)}`}
      lede="You're a full member of the app now. Here is where to start."
    >
      <ul className="flex flex-col gap-2">
        {canContribute && openVotes > 0 && (
          <FirstStep
            href="/inbox"
            icon={<VoteIcon />}
            title={`Cast your vote${openVotes === 1 ? "" : "s"}`}
            body={`${openVotes} vote${openVotes === 1 ? " is" : "s are"} open and waiting on you. Read the memo first; ballots are blind until a partner reveals them.`}
          />
        )}
        {canContribute && (
          <FirstStep
            href="/pipeline"
            icon={<ClipboardListIcon />}
            title={unownedCount > 0 ? "Pick up an application" : "Look through the pipeline"}
            body={
              unownedCount > 0
                ? `${unownedCount} application${unownedCount === 1 ? " has" : "s have"} no owner. Open one, read it, and make yourself the owner.`
                : "Every open application has an owner right now. Read a few to see how the club screens."
            }
          />
        )}
        {nextMeeting ? (
          <FirstStep
            href={`/meetings/${nextMeeting.id}`}
            icon={<CalendarIcon />}
            title={`Next meeting: ${inZone(nextMeeting.scheduledAt, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
            body={`${nextMeeting.title}${nextMeeting.location ? ` · ${nextMeeting.location}` : ""}. The agenda is in the app the night before.`}
          />
        ) : (
          <FirstStep
            href="/meetings"
            icon={<CalendarIcon />}
            title="Meetings"
            body="Nothing is scheduled yet. When it is, the agenda and your action items show up here."
          />
        )}
        <FirstStep
          href="/inbox"
          icon={<InboxIcon />}
          title="Your inbox"
          body="Everything waiting on you, in one list. It is the page the app opens on."
        />
      </ul>
      <StepNav>
        <Button asChild className={primaryStepButton}>
          <Link href="/inbox">
            Go to the app
            <ArrowRightIcon />
          </Link>
        </Button>
      </StepNav>
    </StepBody>
  );
}

function FirstStep({
  href: to,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={to}
        className="group flex items-start gap-3 rounded-xl border border-border px-4 py-3 outline-none transition-colors hover:border-border-strong hover:bg-bg-subtle/60 focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-subtle text-accent [&_svg]:size-4">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="tnum block text-base font-medium">{title}</span>
          <span className="tnum block text-sm text-fg-muted">{body}</span>
        </span>
        <ArrowRightIcon className="mt-2 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
