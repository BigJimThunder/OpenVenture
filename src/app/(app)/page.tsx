import Link from "next/link";
import { formatDistanceToNow, format } from "date-fns";
import { KanbanIcon, VoteIcon, CalendarIcon, CheckSquareIcon, ActivityIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getDashboardData } from "@/lib/queries/dashboard";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { EmptyState } from "@/components/patterns/empty-state";
import { StageBadge } from "@/components/patterns/stage-badge";
import { Money } from "@/components/patterns/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const ctx = await requireCtx();
  const data = await getDashboardData(ctx.org.id, ctx.member.id);
  const activeCount = data.stages
    .filter((s) => s.kind === "active")
    .reduce((n, s) => n + s.count, 0);

  return (
    <div className="pb-10">
      <PageHeader
        title="Today"
        description={`Welcome back, ${ctx.member.displayName.split(" ")[0]}.`}
      />

      <div className="grid grid-cols-2 gap-3 px-6 lg:grid-cols-4">
        <StatCard
          label="Budget remaining"
          value={data.budget ? formatMoney(data.budget.remaining) : "—"}
          hint={
            data.budget
              ? `of ${formatMoney(data.budget.total)} · ${data.budget.grantCount} grants`
              : "No grant pool yet"
          }
        />
        <StatCard label="Open applications" value={activeCount} hint="in active stages" />
        <StatCard
          label="Votes open"
          value={data.openVotes.length}
          hint={data.openVotes.length ? "awaiting your ballot" : "none open"}
        />
        <StatCard
          label="Next meeting"
          value={data.nextMeeting ? format(data.nextMeeting.scheduledAt, "EEE p") : "—"}
          hint={data.nextMeeting?.title ?? "nothing scheduled"}
        />
      </div>

      {data.budget && (
        <div className="px-6 pt-3">
          <Card className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                {data.budget.pool.name} deployment
              </span>
              <span className="tnum text-xs text-fg-muted">
                {formatMoney(data.budget.deployed)} deployed ·{" "}
                {Math.round((data.budget.deployed / data.budget.total) * 100)}%
              </span>
            </div>
            <Progress value={(data.budget.deployed / data.budget.total) * 100} />
          </Card>
        </div>
      )}

      <div className="grid gap-3 px-6 pt-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <KanbanIcon className="size-4 text-fg-subtle" />
              Applications needing action
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/applications">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {data.needsAction.length === 0 ? (
              <EmptyState
                title="No open applications"
                description="New applications from your website form will land here."
                className="py-8"
              />
            ) : (
              data.needsAction.map((a) => (
                <Link
                  key={a.id}
                  href={`/applications/${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-bg-subtle"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="truncate text-sm font-medium">{a.companyName}</span>
                    <StageBadge name={a.stageName} colorToken={a.stageColor} />
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-fg-muted">
                    <Money value={a.amountRequested} />
                    <span>{formatDistanceToNow(a.enteredStageAt, { addSuffix: true })}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <VoteIcon className="size-4 text-fg-subtle" />
                Open votes
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {data.openVotes.length === 0 ? (
                <p className="py-2 text-xs text-fg-muted">No votes are open right now.</p>
              ) : (
                data.openVotes.map((v) => (
                  <Link
                    key={v.id}
                    href={`/memos/${v.memoId ?? ""}/vote`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg-subtle"
                  >
                    <span className="truncate font-medium">{v.title}</span>
                    {v.closesAt && (
                      <span className="shrink-0 text-xs text-warning">
                        closes {formatDistanceToNow(v.closesAt, { addSuffix: true })}
                      </span>
                    )}
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquareIcon className="size-4 text-fg-subtle" />
                My action items
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {data.myActionItems.length === 0 ? (
                <p className="py-2 text-xs text-fg-muted">Nothing assigned to you. Nice.</p>
              ) : (
                data.myActionItems.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-2 py-1.5 text-sm">
                    <span className="truncate">{t.title}</span>
                    {t.dueAt && (
                      <span className="shrink-0 text-xs text-fg-muted">
                        {format(t.dueAt, "MMM d")}
                      </span>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="px-6 pt-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ActivityIcon className="size-4 text-fg-subtle" />
              Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {data.recentActivity.length === 0 ? (
              <p className="py-2 text-xs text-fg-muted">
                Activity from across the club will appear here.
              </p>
            ) : (
              data.recentActivity.map((a) => (
                <div
                  key={a.id}
                  className="flex items-baseline justify-between gap-3 border-b border-border px-2 py-2 text-sm last:border-0"
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
      </div>

      {data.nextMeeting && (
        <div className="px-6 pt-3">
          <Card className="flex flex-row items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <CalendarIcon className="size-4 text-fg-subtle" />
              <div>
                <div className="text-sm font-medium">{data.nextMeeting.title}</div>
                <div className="text-xs text-fg-muted">
                  {format(data.nextMeeting.scheduledAt, "EEEE, MMM d 'at' p")}
                  {data.nextMeeting.location ? ` · ${data.nextMeeting.location}` : ""}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/meetings/${data.nextMeeting.id}`}>Open agenda</Link>
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
