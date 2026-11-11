import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { format, formatDistanceStrict } from "date-fns";
import { ArrowRightIcon, CheckIcon, CircleIcon, GraduationCapIcon } from "lucide-react";
import { db } from "@/db";
import { doc, member, onboardingAssignment } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { getJourney, getPipeline, type Journey } from "@/lib/onboarding/load";
import { STAGE_LABEL } from "@/lib/onboarding/progress";
import { KIND_META } from "@/lib/onboarding/resource";
import { can } from "@/lib/permissions";
import { getOnboardingMatrix, getOnboardingTracks } from "@/lib/queries/members";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatCard } from "@/components/patterns/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InviteMemberDialog } from "@/components/members/invite-member-dialog";
import { OnboardingMatrix } from "@/components/members/onboarding-matrix";
import { TrackManager } from "@/components/members/track-manager";
import { PipelineBoard, type BoardEntry } from "@/components/onboarding/pipeline-board";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { key: "pipeline", label: "Pipeline" },
  { key: "matrix", label: "Matrix" },
  { key: "tracks", label: "Tracks" },
] as const;
type View = (typeof VIEWS)[number]["key"];

const pill = (active: boolean) =>
  cn(
    "flex min-h-8 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap max-md:min-h-10",
    active ? "border-border-strong bg-panel font-medium shadow-xs" : "border-border text-fg-muted hover:text-fg"
  );

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const ctx = await requireCtx();
  if (!can(ctx.member.role, "manageMembers")) {
    const journey = await getJourney(ctx.org.id, ctx.member.id);
    return <MyOnboarding journey={journey} />;
  }

  const params = await searchParams;
  const view: View = VIEWS.find((v) => v.key === params.view)?.key ?? "pipeline";
  const requestedTrack = typeof params.track === "string" ? params.track : undefined;

  const [tracks, pipeline] = await Promise.all([getOnboardingTracks(ctx.org.id), getPipeline(ctx.org.id)]);
  const live = tracks.filter((t) => !t.archivedAt);
  const assignments = tracks.length
    ? await db
        .select({ trackId: onboardingAssignment.trackId, memberId: onboardingAssignment.memberId })
        .from(onboardingAssignment)
        .where(
          inArray(
            onboardingAssignment.trackId,
            tracks.map((t) => t.id)
          )
        )
    : [];
  const assignedTo = (trackId: string) => assignments.filter((a) => a.trackId === trackId).map((a) => a.memberId);

  const { entries, asOf } = pipeline;
  // Formatted here, in the club's timezone, so the server render and the browser agree.
  const inZone = (opts: Intl.DateTimeFormatOptions) => {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: ctx.org.timezone, ...opts });
    return (d: Date | null) => (d ? f.format(d) : null);
  };
  const day = inZone({ month: "short", day: "numeric" });
  const fullDay = inZone({ month: "short", day: "numeric", year: "numeric" });
  const moment = inZone({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: ctx.org.timezone });
  const ago = (d: Date | null) => (d ? formatDistanceStrict(d, asOf, { addSuffix: true }) : null);
  const active = entries.filter((e) => e.stage !== "complete");
  const overdue = active.filter((e) => e.overdue).length;
  const waiting = active.filter((e) => e.stage === "invited").length;
  const monthAgo = asOf.getTime() - 30 * 86_400_000;
  const recentlyDone = entries.filter((e) => e.completedAt && e.completedAt.getTime() >= monthAgo).length;

  return (
    <div className="pb-10">
      <PageHeader
        title="Onboarding"
        description={
          active.length > 0 ? (
            <span className="tnum">
              {active.length} {active.length === 1 ? "person is" : "people are"} on the way in
              {overdue > 0 ? `, ${overdue} past due` : ""}. Invite someone once; the email, the checklist and the
              reminders happen on their own.
            </span>
          ) : (
            "Invite someone once; the email, the checklist and the reminders happen on their own."
          )
        }
        actions={<InviteMemberDialog allowedDomains={ctx.org.allowedEmailDomains} label="Invite members" />}
      />
      <div className="flex flex-col gap-5 px-4 md:px-6">
        <nav aria-label="Views" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.key === "pipeline" ? "/onboarding" : `/onboarding?view=${v.key}`}
              aria-current={v.key === view ? "page" : undefined}
              className={pill(v.key === view)}
            >
              {v.label}
              {v.key === "tracks" && <span className="tnum ml-1.5 text-xs text-fg-subtle">{live.length}</span>}
            </Link>
          ))}
        </nav>

        {view === "pipeline" &&
          (entries.length === 0 ? (
            <EmptyState
              icon={<GraduationCapIcon />}
              title="Nobody is being onboarded"
              description="This board fills in as you invite people. Each new member moves left to right: invited, setting up, in progress, complete."
              steps={[
                "Invite someone with their school email, or paste a whole class list.",
                live.length > 0
                  ? `They get one email and are enrolled on ${live.find((t) => t.isDefault)?.name ?? "the default track"}.`
                  : "Build a track first if there is anything they must read, watch or agree to.",
                "Reminders go out before the due date. You only step in when a card turns red.",
              ]}
              action={<InviteMemberDialog allowedDomains={ctx.org.allowedEmailDomains} label="Invite members" />}
              secondaryAction={
                <Button variant="secondary" asChild className="max-md:h-10">
                  <Link href="/onboarding?view=tracks">{live.length > 0 ? "Edit the track" : "Build a track"}</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="On the way in" value={active.length} hint="Invited, setting up or in progress" />
                <StatCard
                  label="Past due"
                  value={overdue}
                  tone={overdue > 0 ? "danger" : "default"}
                  hint={overdue > 0 ? "Reminded every three days" : "Nobody is late"}
                />
                <StatCard label="Waiting to sign in" value={waiting} hint="One reminder after three days" />
                <StatCard label="Finished, last 30 days" value={recentlyDone} />
              </div>
              <PipelineBoard
                entries={entries.map(
                  (e): BoardEntry => ({
                    memberId: e.member.id,
                    name: e.member.displayName,
                    email: e.member.email,
                    role: e.member.role,
                    cohort: e.member.cohort,
                    stage: e.stage,
                    enrolled: e.enrolled,
                    trackIds: e.assignments.map((a) => a.trackId),
                    trackNames: e.assignments.map((a) => a.trackName),
                    requiredDone: e.summary.requiredDone,
                    requiredTotal: e.summary.requiredTotal,
                    nextTitle: e.summary.next?.title ?? null,
                    overdue: e.overdue,
                    daysUntilDue: e.daysUntilDue,
                    dueOn: day(e.dueAt),
                    dueInput: e.dueAt ? isoDay.format(e.dueAt) : "",
                    invitedOn: fullDay(e.member.createdAt) ?? "",
                    invitedAgo: ago(e.member.createdAt) ?? "",
                    invitedBy: e.invitedBy?.name ?? null,
                    lastNudgeAgo: ago(e.lastNudgeAt),
                    completedOn: day(e.completedAt),
                    completedAt: e.completedAt?.toISOString() ?? null,
                    items: e.items.map((i) => ({
                      id: i.id,
                      assignmentId: i.assignmentId,
                      title: i.title,
                      kind: i.kind,
                      required: i.required,
                      doneOn: moment(i.completedAt),
                      verified: i.verified,
                      waived: i.waived,
                    })),
                  })
                )}
                tracks={live.map((t) => ({ id: t.id, name: t.name, assignedMemberIds: assignedTo(t.id) }))}
                unenrolled={pipeline.unenrolled.map((m) => ({ id: m.id, displayName: m.displayName }))}
                emailConfigured={Boolean(process.env.RESEND_API_KEY)}
              />
            </>
          ))}

        {view === "matrix" && <MatrixView orgId={ctx.org.id} live={live} requested={requestedTrack} viewerId={ctx.member.id} />}

        {view === "tracks" && (
          <section aria-labelledby="tracks-heading" className="max-w-3xl">
            <h2 id="tracks-heading" className="text-md font-semibold tracking-tight">
              What new members are asked to do
            </h2>
            <p className="mt-1 mb-3 max-w-xl text-sm text-fg-muted">
              Paste a link to make a video or article required, link one of the club&apos;s docs, or add a policy to
              agree to. Required items come before a new member gets into the app; optional ones are offered at the
              end.
            </p>
            <TrackManager
              members={await db
                .select({ id: member.id, displayName: member.displayName })
                .from(member)
                .where(and(eq(member.orgId, ctx.org.id), inArray(member.status, ["invited", "active"])))
                .orderBy(asc(member.displayName))}
              docs={await db
                .select({ id: doc.id, title: doc.title })
                .from(doc)
                .where(and(eq(doc.orgId, ctx.org.id), eq(doc.visibility, "all"), isNull(doc.archivedAt)))
                .orderBy(asc(doc.title))}
              tracks={tracks.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                isDefault: t.isDefault,
                archived: Boolean(t.archivedAt),
                assignedCount: t.assignedCount,
                assignedMemberIds: assignedTo(t.id),
                tasks: t.tasks.map((k) => ({
                  id: k.id,
                  title: k.title,
                  kind: k.kind,
                  description: k.description,
                  resourceUrl: k.resourceUrl,
                  docId: k.docId,
                  required: k.required,
                  estimatedMinutes: k.estimatedMinutes,
                })),
              }))}
            />
          </section>
        )}
      </div>
    </div>
  );
}

/** The members × items grid: denser than the board, for ticking things off after a meeting. */
async function MatrixView({
  orgId,
  live,
  requested,
  viewerId,
}: {
  orgId: string;
  live: Awaited<ReturnType<typeof getOnboardingTracks>>;
  requested: string | undefined;
  viewerId: string;
}) {
  const selected = live.find((t) => t.id === requested) ?? live.find((t) => t.isDefault) ?? live[0];
  const matrix = selected ? await getOnboardingMatrix(orgId, selected.id) : null;
  return (
    <>
      {live.length > 1 && (
        <nav aria-label="Tracks" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {live.map((t) => (
            <Link
              key={t.id}
              href={`/onboarding?view=matrix&track=${t.id}`}
              aria-current={t.id === selected?.id ? "page" : undefined}
              className={pill(t.id === selected?.id)}
            >
              {t.name}
              <span className="tnum ml-1.5 text-xs text-fg-subtle">{t.assignedCount}</span>
            </Link>
          ))}
        </nav>
      )}
      {!selected || !matrix || matrix.tasks.length === 0 || matrix.rows.length === 0 ? (
        <EmptyState
          icon={<GraduationCapIcon />}
          title={
            !selected
              ? "No onboarding track yet"
              : matrix && matrix.tasks.length > 0
                ? "Nobody is on this track yet"
                : `${selected.name} has no items yet`
          }
          description="The matrix is one row per member and one column per item, for ticking things off in bulk after a meeting. It appears once a track has items and people on it."
          action={
            <Button variant="secondary" asChild className="max-md:h-10">
              <Link href="/onboarding?view=tracks">{selected ? "Edit the track" : "Build a track"}</Link>
            </Button>
          }
        />
      ) : (
        <OnboardingMatrix
          tasks={matrix.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            required: t.required,
            resourceUrl: t.resourceUrl,
          }))}
          rows={matrix.rows.map((r) => ({
            assignmentId: r.assignmentId,
            memberId: r.memberId,
            memberName: r.memberName,
            completedAt: r.completedAt?.toISOString() ?? null,
            done: [...r.done],
          }))}
          viewerMemberId={viewerId}
          viewerIsAdmin
          viewerCanWrite
        />
      )}
    </>
  );
}

/** What everyone who isn't an admin sees: their own progress, nobody else's. */
function MyOnboarding({ journey }: { journey: Journey | null }) {
  const items = journey?.items ?? [];
  const summary = journey?.summary;
  const complete = journey?.stage === "complete";
  const openOptional = items.some((i) => !i.required && !i.completedAt);
  return (
    <div className="pb-10">
      <PageHeader
        title="Your onboarding"
        description={
          items.length === 0
            ? "The short list of things the club asks every new member to do."
            : complete
              ? "You have done everything required."
              : "Finish the required items to get the most out of the club."
        }
        actions={
          items.length > 0 && (!complete || openOptional) ? (
            <Button asChild className="max-md:h-10">
              <Link href="/start">
                {complete ? "See the optional items" : "Continue"}
                <ArrowRightIcon />
              </Link>
            </Button>
          ) : undefined
        }
      />
      <div className="max-w-2xl px-4 md:px-6">
        {!journey || items.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="Nothing assigned to you"
            description="When an admin puts you on an onboarding track, the reading, videos and sign-offs show up here, with a short guided flow to get through them."
          />
        ) : (
          <div className="rounded-lg border border-border bg-panel shadow-xs">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  {journey.assignments.map((a) => a.trackName).join(", ")}
                  <Badge variant={complete ? "success" : "neutral"}>{STAGE_LABEL[journey.stage]}</Badge>
                  {journey.overdue && <Badge variant="danger">Past due</Badge>}
                </div>
                {summary && summary.requiredTotal > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <Progress
                      value={(summary.requiredDone / summary.requiredTotal) * 100}
                      indicatorClassName={complete ? "bg-success" : undefined}
                      className="max-w-56"
                    />
                    <span className="tnum text-xs text-fg-muted">
                      {summary.requiredDone} of {summary.requiredTotal} required
                    </span>
                  </div>
                )}
              </div>
              {journey.dueAt && !complete && (
                <span className="tnum shrink-0 text-xs text-fg-muted">Due {format(journey.dueAt, "MMM d")}</span>
              )}
            </div>
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={`${i.assignmentId}:${i.id}`} className="flex items-start gap-2.5 px-4 py-2.5">
                  <span className={cn("mt-0.5 shrink-0", i.completedAt ? "text-success" : "text-fg-subtle")}>
                    {i.completedAt ? <CheckIcon className="size-4" strokeWidth={3} /> : <CircleIcon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{i.title}</span>
                    <span className="tnum block text-xs text-fg-subtle">
                      {KIND_META[i.kind].label}
                      {i.required ? "" : " · optional"}
                      {i.estimatedMinutes && !i.completedAt ? ` · ${i.estimatedMinutes} min` : ""}
                      {i.completedAt && ` · ${i.waived ? "waived" : "done"} ${format(i.completedAt, "MMM d")}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
