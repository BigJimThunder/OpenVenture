import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { getMemberProfile } from "@/lib/queries/members";
import { initials } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberAdminControls } from "@/components/members/member-admin-controls";
import { OnboardingChecklist } from "@/components/members/onboarding-checklist";

export const dynamic = "force-dynamic";

export default async function MemberProfilePage({ params }: PageProps<"/members/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const profile = await getMemberProfile(ctx.org.id, id);
  if (!profile) notFound();
  const { member: m, recentActivity, apps, memos, attendanceRows, onboarding } = profile;
  const attended = attendanceRows.filter((a) =>
    ["present", "remote", "late"].includes(a.status)
  ).length;
  const canToggleOnboarding = ctx.member.id === m.id || ctx.member.role === "admin";

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback>{initials(m.displayName)}</AvatarFallback>
            </Avatar>
            {m.displayName}
            <Badge variant={m.status === "active" ? "success" : "neutral"}>{m.status}</Badge>
            <Badge variant="neutral">{m.role.replace("_", " ")}</Badge>
          </span>
        }
        description={`${m.email}${m.cohort ? ` · ${m.cohort}` : ""}${
          m.classYear ? ` · Class of ${m.classYear}` : ""
        } · joined ${format(m.joinedAt, "MMM yyyy")}`}
        actions={
          ctx.member.role === "admin" && m.id !== ctx.member.id ? (
            <MemberAdminControls memberId={m.id} currentRole={m.role} status={m.status} />
          ) : undefined
        }
      />

      <div className="grid gap-3 px-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Contribution history</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col">
              {recentActivity.length === 0 ? (
                <p className="py-2 text-xs text-fg-muted">No activity yet.</p>
              ) : (
                recentActivity.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-baseline justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
                  >
                    <span className="min-w-0 truncate">{a.summary}</span>
                    <span className="shrink-0 text-2xs text-fg-subtle">
                      {formatDistanceToNow(a.occurredAt, { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {memos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Memos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1">
                {memos.map((mm) => (
                  <Link
                    key={mm.id}
                    href={`/memos/${mm.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg-subtle"
                  >
                    <span className="truncate">{mm.title}</span>
                    <Badge variant="neutral">{mm.status}</Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>At a glance</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-fg-muted">Applications owned</span>
                <span className="tnum">{apps.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Memos written</span>
                <span className="tnum">{memos.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-fg-muted">Attendance</span>
                <span className="tnum">
                  {attendanceRows.length > 0
                    ? `${attended}/${attendanceRows.length} (${Math.round((attended / attendanceRows.length) * 100)}%)`
                    : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {onboarding && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Onboarding{onboarding.completedAt ? " — complete 🎉" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OnboardingChecklist
                  assignmentId={onboarding.assignmentId}
                  tasks={onboarding.tasks.map((t) => ({
                    id: t.id,
                    title: t.title,
                    done: t.done,
                    docId: t.docId,
                    resourceUrl: t.resourceUrl,
                  }))}
                  canToggle={canToggleOnboarding}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
