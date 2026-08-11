import Link from "next/link";
import { formatDistanceToNow, format, differenceInDays, isPast } from "date-fns";
import {
  KanbanIcon,
  VoteIcon,
  CalendarIcon,
  CheckSquareIcon,
  ActivityIcon,
  ClockIcon,
  InboxIcon,
  PlayIcon,
  type LucideIcon,
} from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getDashboardData } from "@/lib/queries/dashboard";
import { cn, formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** Stage SLA — matches the board's stalled threshold. */
const STALE_DAYS = 14;

type QueueItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  title: string;
  detail?: React.ReactNode;
  meta: React.ReactNode;
  tone?: "warning" | "danger";
};

export default async function TodayPage() {
  const ctx = await requireCtx();
  const data = await getDashboardData(ctx.org.id, ctx.member.id);
  const now = new Date();

  // One prioritized queue: ballots first, then stalled deals, then your tasks,
  // then the rest of the open pipeline that's waiting on someone.
  const queue: QueueItem[] = [];

  for (const v of data.openVotes) {
    const closingSoon = v.closesAt && differenceInDays(v.closesAt, now) < 2;
    queue.push({
      key: `vote-${v.id}`,
      href: `/memos/${v.memoId ?? ""}/vote`,
      icon: VoteIcon,
      title: v.title,
      detail: "Blind vote open — cast your ballot",
      meta: v.closesAt
        ? `closes ${formatDistanceToNow(v.closesAt, { addSuffix: true })}`
        : "no deadline",
      tone: closingSoon ? "warning" : undefined,
    });
  }

  const stalled = data.needsAction.filter(
    (a) => differenceInDays(now, a.enteredStageAt) > STALE_DAYS
  );
  const moving = data.needsAction.filter(
    (a) => differenceInDays(now, a.enteredStageAt) <= STALE_DAYS
  );

  for (const a of stalled) {
    queue.push({
      key: `stalled-${a.id}`,
      href: `/applications/${a.id}`,
      icon: ClockIcon,
      title: a.companyName,
      detail: (
        <span className="flex items-center gap-1.5">
          Stalled in <StageBadge name={a.stageName} colorToken={a.stageColor} />
        </span>
      ),
      meta: `${differenceInDays(now, a.enteredStageAt)}d in stage`,
      tone: "warning",
    });
  }

  for (const t of data.myActionItems) {
    const overdue = t.dueAt ? isPast(t.dueAt) : false;
    queue.push({
      key: `task-${t.id}`,
      href: "/meetings",
      icon: CheckSquareIcon,
      title: t.title,
      detail: "Action item assigned to you",
      meta: t.dueAt ? (overdue ? `was due ${format(t.dueAt, "MMM d")}` : `due ${format(t.dueAt, "MMM d")}`) : "no due date",
      tone: overdue ? "danger" : undefined,
    });
  }

  for (const a of moving) {
    queue.push({
      key: `app-${a.id}`,
      href: `/applications/${a.id}`,
      icon: KanbanIcon,
      title: a.companyName,
      detail: (
        <span className="flex items-center gap-1.5">
          Waiting in <StageBadge name={a.stageName} colorToken={a.stageColor} />
          {a.amountRequested ? (
            <span className="tnum">· asking {formatMoney(a.amountRequested)}</span>
          ) : null}
        </span>
      ),
      meta: formatDistanceToNow(a.enteredStageAt, { addSuffix: true }),
    });
  }

  const activeStages = data.stages.filter((s) => s.kind === "active");
  const pipelineTotal = activeStages.reduce((n, s) => n + s.count, 0);

  return (
    <div className="pb-10">
      <PageHeader
        title="Today"
        description={`${format(now, "EEEE, MMMM d")} · Welcome back, ${ctx.member.displayName.split(" ")[0]}.`}
      />

      <div className="grid gap-3 px-6 lg:grid-cols-3">
        {/* The whole point of this screen: what needs me, most urgent first. */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <InboxIcon className="size-4 text-fg-subtle" />
              Needs you
              {queue.length > 0 && (
                <span className="tnum rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-semibold text-accent">
                  {queue.length}
                </span>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/applications">Pipeline</Link>
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col">
            {queue.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-12 text-center">
                <p className="text-sm font-medium">You&apos;re clear.</p>
                <p className="text-xs text-fg-muted">
                  No open ballots, no stalled deals, nothing assigned to you.
                </p>
              </div>
            ) : (
              queue.slice(0, 9).map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="group flex items-center gap-3 border-b border-border px-2 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle"
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md border",
                      item.tone === "warning"
                        ? "border-warning-border bg-warning-bg text-warning"
                        : item.tone === "danger"
                          ? "border-danger-border bg-danger-bg text-danger"
                          : "border-border bg-bg-subtle text-fg-muted"
                    )}
                  >
                    <item.icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.detail && (
                      <span className="block truncate text-xs text-fg-muted">{item.detail}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-2xs",
                      item.tone === "warning"
                        ? "text-warning"
                        : item.tone === "danger"
                          ? "text-danger"
                          : "text-fg-subtle"
                    )}
                  >
                    {item.meta}
                  </span>
                </Link>
              ))
            )}
            {queue.length > 9 && (
              <p className="px-2 pt-2 text-2xs text-fg-subtle">
                + {queue.length - 9} more across the pipeline
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rail: the money, the meeting, the shape of the pipeline. */}
        <div className="flex flex-col gap-3">
          <Card className="p-4">
            <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              {data.budget ? `${data.budget.pool.name} remaining` : "Grant pool"}
            </div>
            {data.budget ? (
              <>
                <div className="tnum mt-1 text-xl font-semibold tracking-tight">
                  {formatMoney(data.budget.remaining)}
                </div>
                <Progress
                  className="mt-2"
                  value={(data.budget.deployed / data.budget.total) * 100}
                />
                <div className="tnum mt-1.5 text-xs text-fg-muted">
                  {formatMoney(data.budget.deployed)} of {formatMoney(data.budget.total)} committed
                  · {data.budget.grantCount} grants
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-fg-muted">
                No grant pool yet — an admin sets one up in Settings.
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              <CalendarIcon className="size-3.5" />
              Next meeting
            </div>
            {data.nextMeeting ? (
              <>
                <div className="mt-1 text-sm font-medium">{data.nextMeeting.title}</div>
                <div className="text-xs text-fg-muted">
                  {format(data.nextMeeting.scheduledAt, "EEEE, MMM d 'at' p")}
                  {data.nextMeeting.location ? ` · ${data.nextMeeting.location}` : ""}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/meetings/${data.nextMeeting.id}`}>Open agenda</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/meetings/${data.nextMeeting.id}/run`}>
                      <PlayIcon />
                      Run
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-fg-muted">
                Nothing scheduled.{" "}
                <Link href="/meetings?new=1" className="text-accent hover:underline">
                  Schedule one
                </Link>
                .
              </p>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                Pipeline
              </div>
              <span className="tnum text-xs text-fg-muted">{pipelineTotal} open</span>
            </div>
            {pipelineTotal === 0 ? (
              <p className="mt-1 text-xs text-fg-muted">
                Empty —{" "}
                <Link href="/applications?new=1" className="text-accent hover:underline">
                  add the first application
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-bg-subtle">
                  {activeStages
                    .filter((s) => s.count > 0)
                    .map((s) => (
                      <span
                        key={s.id}
                        className="h-full"
                        style={{
                          width: `${(s.count / pipelineTotal) * 100}%`,
                          background: `var(--${s.colorToken})`,
                        }}
                      />
                    ))}
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  {activeStages.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: `var(--${s.colorToken})` }}
                      />
                      <span className="text-fg-muted">{s.name}</span>
                      <span className="tnum ml-auto">{s.count}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
    </div>
  );
}
