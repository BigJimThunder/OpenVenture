import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClockIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import {
  clubToday,
  getConfirmedAt,
  getScheduleBlocks,
  getSchedulingMembers,
  getTermRoster,
} from "@/lib/queries/availability";
import { zoneName } from "@/lib/scheduling/format";
import { currentTerm, previousTerm, sortTerms } from "@/lib/scheduling/terms";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { PageHeader } from "@/components/patterns/page-header";
import { ScheduleEditor } from "@/components/scheduling/schedule-editor";
import { TermRoster } from "@/components/scheduling/term-roster";
import { TimeFinder } from "@/components/scheduling/time-finder";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const param = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined);

  const { scheduling } = orgSettings(ctx.org);
  const terms = sortTerms(scheduling.terms);
  const now = new Date();
  const term = terms.find((t) => t.key === param("term")) ?? currentTerm(scheduling, now, ctx.org.timezone);
  const canFind = can(ctx.member.role, "contribute");
  const canManageClub = can(ctx.member.role, "manageClub");
  const view = param("view") === "find" && canFind ? "find" : "mine";
  const window = {
    dayStartMinute: scheduling.dayStartMinute,
    dayEndMinute: scheduling.dayEndMinute,
    weekends: scheduling.weekends,
  };
  const termQuery = term && param("term") ? `term=${encodeURIComponent(term.key)}&` : "";

  const header = (
    <PageHeader
      title="Schedule"
      description="Your class schedule goes in once a term. After that, meetings and coffee chats are scheduled around everyone's week without anyone asking."
    />
  );

  if (!term) {
    return (
      <div className="pb-10">
        {header}
        <div className="px-4 md:px-6">
          <EmptyState
            icon={<CalendarClockIcon />}
            title="No academic term set up yet"
            description="Schedules belong to a term, so the club's quarters or semesters have to exist first."
            steps={[
              "An admin picks quarters or semesters and adds the current term in Settings.",
              "Every member enters their classes for that term. It takes about two minutes.",
              "From then on, finding a time for a meeting or a coffee chat is one tap.",
            ]}
            action={
              canManageClub ? (
                <Button asChild>
                  <Link href="/settings#calendar">Set up terms</Link>
                </Button>
              ) : undefined
            }
            secondaryAction={
              canManageClub ? undefined : <span className="text-sm text-fg-muted">Ask one of the club&apos;s admins to add the term.</span>
            }
          />
        </div>
      </div>
    );
  }

  const tabs = canFind && (
    <nav aria-label="Schedule views" className="mb-4 flex gap-1 border-b border-border px-4 md:px-6">
      {(
        [
          ["mine", "My week", `/schedule${termQuery ? `?${termQuery.slice(0, -1)}` : ""}`],
          ["find", "Find a time", `/schedule?${termQuery}view=find`],
        ] as const
      ).map(([id, label, href]) => (
        <Link
          key={id}
          href={href}
          aria-current={view === id ? "page" : undefined}
          className={cn(
            "-mb-px flex h-10 items-center border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            view === id ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );

  if (view === "find") {
    const active = currentTerm(scheduling, now, ctx.org.timezone) ?? term;
    const [members, roster] = await Promise.all([
      getSchedulingMembers(ctx.org.id),
      getTermRoster(ctx.org.id, active.key),
    ]);
    return (
      <div className="pb-10">
        {header}
        {tabs}
        <div className="px-4 md:px-6">
          <TimeFinder
            members={members.map((m) => ({ id: m.id, name: m.name, role: m.role }))}
            viewerId={ctx.member.id}
            today={clubToday(ctx.org, now)}
            timeZone={ctx.org.timezone}
            zone={zoneName(now.getTime(), ctx.org.timezone)}
            unknownIds={roster.filter((r) => !r.confirmedAt && r.blockCount === 0).map((r) => r.memberId)}
            canManageClub={canManageClub}
          />
        </div>
      </div>
    );
  }

  const before = previousTerm(terms, term);
  const [blocks, confirmedAt, previousBlocks, roster] = await Promise.all([
    getScheduleBlocks(ctx.org.id, ctx.member.id, term.key),
    getConfirmedAt(ctx.org.id, ctx.member.id, term.key),
    before ? getScheduleBlocks(ctx.org.id, ctx.member.id, before.key) : [],
    can(ctx.member.role, "manageMembers") ? getTermRoster(ctx.org.id, term.key) : null,
  ]);

  return (
    <div className="pb-10">
      {header}
      {tabs}
      <div className="flex max-w-4xl flex-col gap-8 px-4 md:px-6">
        <ScheduleEditor
          key={term.key}
          data={{
            term,
            terms,
            blocks,
            confirmedAt: confirmedAt?.toISOString() ?? null,
            previous: before && previousBlocks.length > 0 ? { term: before, blocks: previousBlocks } : null,
            window,
            timeZone: ctx.org.timezone,
            canManageClub,
          }}
          switchTerms
        />
        {roster && (
          <section aria-labelledby="roster-heading" className="flex flex-col gap-3">
            <div>
              <h2 id="roster-heading" className="text-md font-semibold tracking-tight">
                Who has entered a schedule
              </h2>
              <p className="mt-1 max-w-xl text-sm text-fg-muted">
                Only admins see this list. Someone without a schedule is never counted as free, so the finder is only as
                good as this is complete.
              </p>
            </div>
            <TermRoster
              term={term}
              rows={roster}
              viewerId={ctx.member.id}
              window={window}
              emailConfigured={Boolean(process.env.RESEND_API_KEY)}
            />
          </section>
        )}
      </div>
    </div>
  );
}
