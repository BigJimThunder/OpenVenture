import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { ExternalLinkIcon, MailIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { getMemberProfile } from "@/lib/queries/members";
import { cn, initials } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { MemberAdminControls } from "@/components/members/member-admin-controls";
import { EditProfileDialog } from "@/components/members/edit-profile-dialog";
import { OnboardingChecklist } from "@/components/members/onboarding-checklist";
import { ROLE_BADGE } from "@/components/members/member-labels";
import { ATTENDANCE_LABEL, ATTENDED } from "@/components/meetings/meeting-labels";
import { MEMO_STATUS } from "@/components/memos/memo-labels";

export const metadata: Metadata = { title: "Member" };
export const dynamic = "force-dynamic";

const STATUS_LABEL = { invited: "Invited", active: "Active", alumni: "Alumni", removed: "Removed" } as const;

export default async function MemberProfilePage({ params }: PageProps<"/members/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const profile = await getMemberProfile(ctx.org.id, id);
  if (!profile) notFound();
  const { member: m, recentActivity, apps, memos, attendanceRows, onboarding } = profile;

  const isSelf = ctx.member.id === m.id;
  const isAdmin = can(ctx.member.role, "manageMembers");
  const attended = attendanceRows.filter((a) => ATTENDED.includes(a.status)).length;
  const attendancePct = attendanceRows.length > 0 ? Math.round((attended / attendanceRows.length) * 100) : null;
  const openApps = apps.filter((a) => a.status === "open").length;
  const onboardingDone = onboarding?.tasks.filter((t) => t.done).length ?? 0;

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={
          <Link href="/members" className="hover:text-fg">
            Members
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Avatar className="size-9">
              <AvatarFallback className="text-xs">{initials(m.displayName)}</AvatarFallback>
            </Avatar>
            {m.displayName}
            <Badge variant={ROLE_BADGE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
            {m.status !== "active" && <Badge variant="outline">{STATUS_LABEL[m.status]}</Badge>}
          </span>
        }
        description={
          <span className="tnum">
            {[
              m.title,
              m.cohort,
              m.classYear ? `Class of ${m.classYear}` : null,
              `Joined ${format(m.joinedAt, "MMM yyyy")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        }
        actions={
          isSelf ? (
            <EditProfileDialog
              profile={{
                displayName: m.displayName,
                cohort: m.cohort,
                classYear: m.classYear,
                bio: m.bio,
                linkedinUrl: m.linkedinUrl,
              }}
            />
          ) : isAdmin ? (
            <MemberAdminControls
              member={{
                id: m.id,
                displayName: m.displayName,
                role: m.role,
                status: m.status,
                title: m.title,
                cohort: m.cohort,
                classYear: m.classYear,
              }}
            />
          ) : undefined
        }
      />

      <div className="grid gap-3 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <dl className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-panel shadow-xs">
            <div className="px-3 py-3 md:px-4">
              <dt className="text-xs text-fg-muted">Open applications</dt>
              <dd className="tnum mt-1 text-lg font-semibold">{openApps}</dd>
              <dd className="tnum text-xs text-fg-subtle">{apps.length} owned in all</dd>
            </div>
            <div className="px-3 py-3 md:px-4">
              <dt className="text-xs text-fg-muted">Memos written</dt>
              <dd className="tnum mt-1 text-lg font-semibold">{memos.length}</dd>
            </div>
            <div className="px-3 py-3 md:px-4">
              <dt className="text-xs text-fg-muted">Attendance</dt>
              <dd
                className={cn(
                  "tnum mt-1 text-lg font-semibold",
                  attendancePct != null && attendancePct < 60 && "text-warning"
                )}
              >
                {attendancePct == null ? "—" : `${attendancePct}%`}
              </dd>
              {attendanceRows.length > 0 && (
                <dd className="tnum text-xs text-fg-subtle">
                  {attended} of the last {attendanceRows.length}
                </dd>
              )}
            </div>
          </dl>

          <Card>
            <CardHeader>
              <CardTitle>Recent work</CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  {isSelf
                    ? "Nothing yet. Score an application, log a coffee chat or comment on a memo and it shows up here."
                    : `${m.displayName} hasn't done anything in the app yet.`}
                </p>
              ) : (
                <ul className="-my-2 divide-y divide-border">
                  {recentActivity.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">{a.summary}</span>
                      <time
                        dateTime={a.occurredAt.toISOString()}
                        className="tnum shrink-0 text-xs text-fg-subtle"
                      >
                        {formatDistanceToNow(a.occurredAt, { addSuffix: true })}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {memos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Memos</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="-mx-2 flex flex-col">
                  {memos.map((mm) => (
                    <li key={mm.id}>
                      <Link
                        href={`/memos/${mm.id}`}
                        className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-sm transition-colors hover:bg-bg-subtle max-md:min-h-11"
                      >
                        <span className="truncate">{mm.title}</span>
                        <Badge variant={MEMO_STATUS[mm.status].variant}>{MEMO_STATUS[mm.status].label}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {m.bio ? (
                <p className="leading-relaxed whitespace-pre-line">{m.bio}</p>
              ) : (
                <p className="text-fg-muted">
                  {isSelf ? "Add a line about what you work on — Edit profile, above." : "No bio yet."}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" className="max-md:h-10" asChild>
                  <a href={`mailto:${m.email}`}>
                    <MailIcon />
                    <span className="max-w-48 truncate">{m.email}</span>
                  </a>
                </Button>
                {m.linkedinUrl && (
                  <Button variant="secondary" size="sm" className="max-md:h-10" asChild>
                    <a href={m.linkedinUrl} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon />
                      LinkedIn
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {onboarding && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>Onboarding</span>
                  <span className="tnum text-xs font-normal text-fg-muted">
                    {onboarding.completedAt
                      ? "Complete"
                      : `${onboardingDone} of ${onboarding.tasks.length}`}
                  </span>
                </CardTitle>
                <p className="text-xs text-fg-muted">{onboarding.trackName}</p>
                {!onboarding.completedAt && onboarding.tasks.length > 0 && (
                  <Progress value={(onboardingDone / onboarding.tasks.length) * 100} className="mt-1.5" />
                )}
              </CardHeader>
              <CardContent>
                <OnboardingChecklist
                  assignmentId={onboarding.assignmentId}
                  tasks={onboarding.tasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    done: t.done,
                    required: t.required,
                    resourceUrl: t.resourceUrl,
                  }))}
                  canToggle={(isSelf && can(ctx.member.role, "contribute")) || isAdmin}
                />
              </CardContent>
            </Card>
          )}

          {attendanceRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent meetings</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="-my-1.5 flex flex-col">
                  {attendanceRows.slice(0, 8).map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0 truncate">
                        {a.meetingTitle}
                        <span className="tnum text-fg-subtle"> · {format(a.scheduledAt, "MMM d")}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs",
                          ATTENDED.includes(a.status) ? "text-fg-muted" : a.status === "absent" ? "text-danger" : "text-fg-subtle"
                        )}
                      >
                        {ATTENDANCE_LABEL[a.status]}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
