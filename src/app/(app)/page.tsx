import Link from "next/link";
import { formatDistanceToNowStrict, format } from "date-fns";
import { ChevronDownIcon, VoteIcon, CalendarIcon, CircleDashedIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getDashboardData, slaBreachDays } from "@/lib/queries/dashboard";
import { formatMoney, initials, cn } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph, PRIORITY_ORDER } from "@/components/patterns/priority-glyph";
import { EmptyState } from "@/components/patterns/empty-state";

export const dynamic = "force-dynamic";

/**
 * Inbox — the triage queue, one row per thing that wants a decision. Replaces
 * the old card dashboard: same data, but scannable in one pass and workable
 * from the keyboard.
 */
export default async function InboxPage() {
  const ctx = await requireCtx();
  const data = await getDashboardData(ctx.org.id, ctx.member.id);

  const activeCount = data.stages
    .filter((s) => s.kind === "active")
    .reduce((n, s) => n + s.count, 0);

  // Urgent first, then longest-waiting — the order you'd actually work them.
  const needsAction = [...data.needsAction].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      new Date(a.enteredStageAt).getTime() - new Date(b.enteredStageAt).getTime()
  );

  const total = needsAction.length + data.openVotes.length;
  const todayCount = (data.nextMeeting ? 1 : 0) + data.myActionItems.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader title="Inbox" meta={`${total} ${total === 1 ? "item" : "items"}`} />

      <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
        <Stat label="Budget remaining">
          <div className="mt-[3px] flex items-center gap-2.5">
            <span className="tnum text-[15px] font-semibold">
              {data.budget ? formatMoney(data.budget.remaining) : "—"}
            </span>
            {data.budget && data.budget.total > 0 && (
              <>
                <div className="h-1 w-30 overflow-hidden rounded-sm bg-bg-subtle">
                  <div
                    className="h-full rounded-sm bg-accent"
                    style={{
                      width: `${Math.min(100, (data.budget.deployed / data.budget.total) * 100)}%`,
                    }}
                  />
                </div>
                <span className="tnum text-2xs text-fg-subtle">
                  {Math.round((data.budget.deployed / data.budget.total) * 100)}% deployed
                </span>
              </>
            )}
          </div>
        </Stat>
        <Divider />
        <Stat label="Open applications">
          <div className="tnum mt-[3px] text-[15px] font-semibold">{activeCount}</div>
        </Stat>
        <Divider />
        <Stat label="Votes open">
          <div className="tnum mt-[3px] text-[15px] font-semibold">{data.openVotes.length}</div>
        </Stat>
        <Divider />
        <Stat label="Next meeting">
          <div className="tnum mt-[3px] text-[15px] font-semibold">
            {data.nextMeeting ? format(data.nextMeeting.scheduledAt, "EEE p") : "—"}
          </div>
        </Stat>
      </div>

      <main className="flex-1 overflow-y-auto pb-12">
        <GroupHeader title="Needs action" count={needsAction.length} />
        {needsAction.length === 0 ? (
          <EmptyState
            title="Nothing waiting on you"
            description="New applications from your website form land here."
            className="py-8"
          />
        ) : (
          needsAction.map((a) => {
            const breach = slaBreachDays(a.enteredStageAt, a.slaDays);
            return (
              <Row key={a.id} href={`/pipeline?peek=${a.id}`}>
                <PriorityGlyph priority={a.priority} />
                <Ref>{formatRef("application", a.ref)}</Ref>
                <span className="truncate text-sm font-medium">{a.companyName}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-fg-muted">
                  <StageDot colorToken={a.stageColor} />
                  {a.stageName}
                </span>
                {breach && (
                  <span className="shrink-0 text-[11.5px] text-danger">SLA {breach}d breached</span>
                )}
                <span className="tnum ml-auto shrink-0 text-xs text-fg-muted">
                  {a.amountRequested ? formatMoney(a.amountRequested) : ""}
                </span>
                <span className="w-14 shrink-0 text-right text-[11.5px] text-fg-subtle">
                  {formatDistanceToNowStrict(a.enteredStageAt)}
                </span>
                <Owner name={a.ownerName} />
              </Row>
            );
          })
        )}

        {data.openVotes.length > 0 && (
          <>
            <GroupHeader
              title="Open votes"
              count={data.openVotes.length}
              note="blind until reveal"
            />
            {data.openVotes.map((v) => (
              <Row key={v.id} href={v.memoId ? `/memos/${v.memoId}/vote` : "/memos"}>
                <VoteIcon className="size-3.5 shrink-0 text-fg-muted" />
                <Ref>{v.memoRef != null ? formatRef("memo", v.memoRef) : ""}</Ref>
                <span className="truncate text-sm font-medium">{v.title}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-fg-muted">
                  <StageDot colorToken="cat-4" />
                  {v.submitted} of {v.eligible} ballots in
                </span>
                {v.iVoted && (
                  <span className="shrink-0 text-[11.5px] text-success">your ballot is in</span>
                )}
                {v.closesAt && (
                  <span className="ml-auto shrink-0 text-[11.5px] text-warning">
                    closes in {formatDistanceToNowStrict(v.closesAt)}
                  </span>
                )}
                <Kbd className="shrink-0">V</Kbd>
              </Row>
            ))}
          </>
        )}

        {todayCount > 0 && (
          <>
            <GroupHeader title="Today" count={todayCount} />
            {data.nextMeeting && (
              <Row href={`/meetings/${data.nextMeeting.id}`}>
                <CalendarIcon className="size-3.5 shrink-0 text-fg-muted" />
                <Ref>{formatRef("meeting", data.nextMeeting.ref)}</Ref>
                <span className="truncate text-sm font-medium">{data.nextMeeting.title}</span>
                <span className="shrink-0 text-[11.5px] text-fg-muted">
                  {format(data.nextMeeting.scheduledAt, "EEE p")}
                  {data.nextMeeting.location ? ` · ${data.nextMeeting.location}` : ""}
                </span>
                <span className="ml-auto shrink-0 text-[11.5px] text-fg-subtle">agenda</span>
                <Kbd className="shrink-0">O</Kbd>
              </Row>
            )}
            {data.myActionItems.map((t) => (
              <Row key={t.id}>
                <CircleDashedIcon className="size-3.5 shrink-0 text-fg-subtle" />
                <Ref>{formatRef("actionItem", t.ref)}</Ref>
                <span className="truncate text-sm">{t.title}</span>
                {t.dueAt && (
                  <span className="ml-auto shrink-0 text-[11.5px] text-fg-muted">
                    {format(t.dueAt, "MMM d")}
                  </span>
                )}
                <Owner name={ctx.member.displayName} />
              </Row>
            ))}
          </>
        )}
      </main>

      <ScreenFooter>
        <span>
          <Kbd>C</Kbd> new
        </span>
        <span>
          <Kbd>V</Kbd> vote
        </span>
        <span>
          <Kbd>⌘K</Kbd> commands
        </span>
      </ScreenFooter>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-4 first:pl-0 last:pr-0">
      <div className="text-[10.5px] font-medium tracking-[0.06em] uppercase text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-7 w-px shrink-0 bg-border" />;
}

function GroupHeader({ title, count, note }: { title: string; count: number; note?: string }) {
  return (
    <div className="flex h-8.5 items-center gap-2 border-b border-border bg-bg-subtle px-4">
      <ChevronDownIcon className="size-3 text-fg-subtle" />
      <span className="text-xs font-semibold">{title}</span>
      <span className="tnum text-[11.5px] text-fg-subtle">{count}</span>
      {note && <span className="ml-auto text-2xs text-fg-subtle">{note}</span>}
    </div>
  );
}

function Row({ href, children }: { href?: string; children: React.ReactNode }) {
  const className = "flex h-9 items-center gap-2.5 border-b border-border px-4 transition-colors";
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={cn(className, "hover:bg-bg-subtle")}>
      {children}
    </Link>
  );
}

function Ref({ children }: { children: React.ReactNode }) {
  return <span className="w-14 shrink-0 font-mono text-[11.5px] text-fg-subtle">{children}</span>;
}

function Owner({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="size-5 shrink-0 rounded-full border border-dashed border-border-strong" />
    );
  }
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[9px] font-semibold text-accent">
      {initials(name)}
    </span>
  );
}
