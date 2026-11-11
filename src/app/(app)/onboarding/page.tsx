import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { GraduationCapIcon } from "lucide-react";
import { db } from "@/db";
import { member, onboardingAssignment } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { getOnboardingMatrix, getOnboardingTracks } from "@/lib/queries/members";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { OnboardingMatrix } from "@/components/members/onboarding-matrix";
import { TrackManager } from "@/components/members/track-manager";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const ctx = await requireCtx();
  const isAdmin = can(ctx.member.role, "manageMembers");
  const { track: trackParam } = await searchParams;
  const requested = typeof trackParam === "string" ? trackParam : undefined;

  const tracks = await getOnboardingTracks(ctx.org.id);
  const live = tracks.filter((t) => !t.archivedAt);
  const selected = live.find((t) => t.id === requested) ?? live.find((t) => t.isDefault) ?? live[0];
  const matrix = selected ? await getOnboardingMatrix(ctx.org.id, selected.id) : null;

  // The track editor needs the roster and who is already on each track.
  const [members, assignments] = isAdmin
    ? await Promise.all([
        db
          .select({ id: member.id, displayName: member.displayName })
          .from(member)
          .where(and(eq(member.orgId, ctx.org.id), inArray(member.status, ["invited", "active"])))
          .orderBy(asc(member.displayName)),
        tracks.length
          ? db
              .select({ trackId: onboardingAssignment.trackId, memberId: onboardingAssignment.memberId })
              .from(onboardingAssignment)
              .where(
                inArray(
                  onboardingAssignment.trackId,
                  tracks.map((t) => t.id)
                )
              )
          : [],
      ])
    : [[], []];

  const finished = matrix?.rows.filter((r) => r.completedAt).length ?? 0;

  return (
    <div className="pb-10">
      <PageHeader
        title="Onboarding"
        description={
          matrix && matrix.rows.length > 0 ? (
            <span className="tnum">
              {finished} of {matrix.rows.length} members have finished {matrix.track.name}. Least
              complete first — tick off your own row{isAdmin ? ", or anyone's" : ""}.
            </span>
          ) : (
            "The checklist every new member works through in their first weeks."
          )
        }
      />
      <div className="flex flex-col gap-8 px-4 md:px-6">
        {live.length > 1 && (
          <nav aria-label="Tracks" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            {live.map((t) => (
              <Link
                key={t.id}
                href={`/onboarding?track=${t.id}`}
                aria-current={t.id === selected?.id ? "page" : undefined}
                className={cn(
                  "flex min-h-8 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap max-md:min-h-10",
                  t.id === selected?.id
                    ? "border-border-strong bg-panel font-medium shadow-xs"
                    : "border-border text-fg-muted hover:text-fg"
                )}
              >
                {t.name}
                <span className="tnum ml-1.5 text-xs text-fg-subtle">{t.assignedCount}</span>
              </Link>
            ))}
          </nav>
        )}

        {!selected ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="No onboarding track yet"
            description="A track is a short checklist — read the thesis, shadow a coffee chat, score three applications — that turns a new member into a useful one without an officer walking them through it."
            steps={[
              "Create a track and add five to ten tasks.",
              "Every member you invite from then on is put on it automatically.",
              "This page shows who has done what, so you can see who is stuck.",
            ]}
            action={
              isAdmin ? undefined : (
                <p className="text-sm text-fg-muted">An admin sets this up.</p>
              )
            }
          />
        ) : !matrix || matrix.tasks.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title={`${selected.name} has no tasks yet`}
            description={
              isAdmin
                ? "Add the handful of things a new member should do in their first two weeks. The grid appears once there is something to tick."
                : "An admin hasn't added the tasks yet."
            }
          />
        ) : matrix.rows.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="Nobody is on this track yet"
            description={
              selected.isDefault
                ? "Members are put on it when they are invited. People who joined before the track existed can be added by an admin."
                : "An admin assigns members to this track."
            }
            action={
              isAdmin ? (
                <Button variant="secondary" asChild className="max-md:h-10">
                  <Link href="/members">Invite members</Link>
                </Button>
              ) : undefined
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
            viewerMemberId={ctx.member.id}
            viewerIsAdmin={isAdmin}
            viewerCanWrite={can(ctx.member.role, "contribute")}
          />
        )}

        {isAdmin && (
          <section aria-labelledby="tracks-heading" className="max-w-3xl">
            <h2 id="tracks-heading" className="text-md font-semibold tracking-tight">
              Tracks and tasks
            </h2>
            <p className="mt-1 mb-3 max-w-xl text-sm text-fg-muted">
              Only admins see this. Edit what new members are asked to do, in what order, and who is
              on each track.
            </p>
            <TrackManager
              members={members}
              tracks={tracks.map((t) => ({
                id: t.id,
                name: t.name,
                description: t.description,
                isDefault: t.isDefault,
                archived: Boolean(t.archivedAt),
                assignedCount: t.assignedCount,
                assignedMemberIds: assignments.filter((a) => a.trackId === t.id).map((a) => a.memberId),
                tasks: t.tasks.map((k) => ({
                  id: k.id,
                  title: k.title,
                  kind: k.kind,
                  resourceUrl: k.resourceUrl,
                  required: k.required,
                })),
              }))}
            />
          </section>
        )}
      </div>
    </div>
  );
}
