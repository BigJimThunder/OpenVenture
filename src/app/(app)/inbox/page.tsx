import Link from "next/link";
import type { Metadata, Route } from "next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CircleCheckIcon, InboxIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getInbox, isOverdue } from "@/lib/queries/dashboard";
import { can } from "@/lib/permissions";
import { formatMoney, formatPct } from "@/lib/utils";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/patterns/kbd";
import { EmptyState } from "@/components/patterns/empty-state";
import { PRIORITY_ORDER } from "@/components/patterns/priority-glyph";
import { StatStrip, StatStripItem, StatMeter } from "@/components/patterns/data-stat-strip";
import { ListSection } from "@/components/patterns/data-list";
import { ListKeys } from "@/components/patterns/data-list-keys";
import { ApplicationRow, BallotRow, MeetingRow, MemoRow } from "./rows";
import { TaskRow } from "./task-row";

export const metadata: Metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

/**
 * Inbox — personal triage. Three questions, in order: what is waiting on me,
 * what is waiting on nobody in particular, and what is about to happen. The
 * sidebar badge counts the first section exactly (see getNeedsMe).
 */
export default async function InboxPage() {
  const ctx = await requireCtx();
  const data = await getInbox(ctx.org.id, ctx.member.id);
  const { needsMe } = data;
  const isAdmin = can(ctx.member.role, "manageClub");
  const canContribute = can(ctx.member.role, "contribute");

  // Urgent first, then longest-waiting — the order you'd actually work them.
  const byUrgency = <T extends { priority: keyof typeof PRIORITY_ORDER; enteredStageAt: Date }>(
    rows: T[]
  ) =>
    [...rows].sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.enteredStageAt.getTime() - b.enteredStageAt.getTime()
    );
  const myApplications = byUrgency(needsMe.applications);
  const needsSomeone = byUrgency(data.needsSomeone);

  const comingUp = (data.nextMeeting ? 1 : 0) + needsMe.ballotsCast.length;
  const brandNew =
    !data.hasHistory && needsMe.count === 0 && needsSomeone.length === 0 && comingUp === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListKeys />
      <ScreenHeader
        title="Inbox"
        meta={needsMe.count === 0 ? "All clear" : `${needsMe.count} waiting on you`}
      />

      <StatStrip>
        <StatStripItem
          label="Budget remaining"
          value={data.budget ? formatMoney(data.budget.remaining) : "—"}
          hint={
            data.budget
              ? `${formatPct(data.budget.usedFraction, 0)} of ${formatMoney(data.budget.total)} committed`
              : "No grant pool yet"
          }
          tone={data.budget && data.budget.remaining < 0 ? "danger" : "default"}
          href="/grants/budget"
        >
          {data.budget && (
            <StatMeter fraction={data.budget.usedFraction} label="Share of the pool committed" />
          )}
        </StatStripItem>
        <StatStripItem
          label="Open applications"
          value={data.openApplications}
          hint={needsSomeone.length > 0 ? `${needsSomeone.length} need attention` : "All on track"}
          href="/pipeline"
        />
        <StatStripItem
          label="Votes open"
          value={data.openVotes}
          hint={
            needsMe.ballots.length > 0
              ? `${needsMe.ballots.length} waiting on your ballot`
              : data.openVotes > 0
                ? "Nothing owed by you"
                : "None right now"
          }
          href="/memos"
        />
        <StatStripItem
          label="Next meeting"
          value={data.nextMeeting ? format(data.nextMeeting.scheduledAt, "EEE p") : "—"}
          hint={
            data.nextMeeting
              ? `in ${formatDistanceToNowStrict(data.nextMeeting.scheduledAt)} · ${data.nextMeeting.title}`
              : "Nothing scheduled"
          }
          href={(data.nextMeeting ? `/meetings/${data.nextMeeting.id}` : "/meetings") as Route}
        />
      </StatStrip>

      <div className="flex-1 overflow-y-auto pb-12">
        {brandNew ? (
          <div className="p-4 md:p-6">
            <EmptyState
              icon={<InboxIcon />}
              title="Your inbox fills itself"
              description="Nothing has happened in this club yet. Once it does, this is the one screen a member needs to open each week."
              steps={[
                "Applications arrive from your website form and land on the Pipeline.",
                "Anything you own that goes stale, every ballot you owe and every action item assigned to you shows up here.",
                "Clear the list, close the tab. That is the whole weekly routine.",
              ]}
              action={
                isAdmin ? (
                  <Button asChild>
                    <Link href={"/welcome" as Route}>Set up the club</Link>
                  </Button>
                ) : (
                  <Button asChild variant="secondary">
                    <Link href="/pipeline">Open the pipeline</Link>
                  </Button>
                )
              }
              secondaryAction={
                isAdmin ? (
                  <Button asChild variant="ghost">
                    <Link href="/pipeline">Open the pipeline</Link>
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <ListSection title="Needs you" count={needsMe.count}>
              {needsMe.count === 0 ? (
                <div className="flex items-center gap-3 border-b border-border px-4 py-5 md:px-5">
                  <CircleCheckIcon className="size-5 shrink-0 text-success" strokeWidth={1.5} />
                  <div>
                    <div className="text-sm font-medium">Nothing is waiting on you</div>
                    <p className="text-xs text-fg-muted">
                      {canContribute
                        ? "Ballots you owe, applications of yours that go stale and action items assigned to you appear here."
                        : "You have read-only access, so nothing is ever assigned to you."}
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {needsMe.ballots.map((r) => (
                    <BallotRow key={r.id} round={r} cast={false} />
                  ))}
                  {myApplications.map((a) => (
                    <ApplicationRow key={a.id} app={a} />
                  ))}
                  {needsMe.tasks.map((t) => (
                    <TaskRow key={t.id} item={t} overdue={isOverdue(t.dueAt)} />
                  ))}
                  {needsMe.memos.map((m) => (
                    <MemoRow
                      key={m.id}
                      memo={m}
                      meta={
                        <span className="truncate">
                          {m.authorName} circulated it
                          {m.circulatedAt
                            ? ` ${formatDistanceToNowStrict(m.circulatedAt, { addSuffix: true })}`
                            : ""}{" "}
                          · no comment from you yet
                        </span>
                      }
                      action="Read"
                    />
                  ))}
                </>
              )}
            </ListSection>

            {needsSomeone.length > 0 && (
              <ListSection
                title="Needs someone"
                count={needsSomeone.length}
                note="unowned, or past its stage target"
              >
                {needsSomeone.map((a) => (
                  <ApplicationRow key={a.id} app={a} showOwner />
                ))}
              </ListSection>
            )}

            {comingUp > 0 && (
              <ListSection title="Coming up" count={comingUp}>
                {data.nextMeeting && <MeetingRow meeting={data.nextMeeting} />}
                {needsMe.ballotsCast.map((r) => (
                  <BallotRow key={r.id} round={r} cast />
                ))}
              </ListSection>
            )}
          </>
        )}
      </div>

      <ScreenFooter note="Votes are blind until reveal. This screen only ever shows your own ballot status.">
        <span>
          <Kbd>J</Kbd> <Kbd>K</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        {canContribute && (
          <span>
            <Kbd>C</Kbd> new application
          </span>
        )}
        <span>
          <Kbd>⌘K</Kbd> search
        </span>
      </ScreenFooter>
    </div>
  );
}
