import type { Metadata } from "next";
import Link from "next/link";
import { format, isToday, isTomorrow } from "date-fns";
import { CalendarIcon, ChevronRightIcon, MapPinIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { getMeetingsList } from "@/lib/queries/meetings";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";
import { MEETING_KIND_LABEL } from "@/components/meetings/meeting-labels";

export const metadata: Metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof getMeetingsList>>["upcoming"][number];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function MeetingRow({ row, past }: { row: Row; past?: boolean }) {
  const m = row.meeting;
  const cancelled = m.status === "cancelled";
  const inProgress = m.status === "in_progress";
  const facts: string[] = [];
  if (past && !cancelled) {
    if (row.attendedCount > 0) facts.push(`${row.attendedCount} attended`);
    if (row.agendaCount > 0) facts.push(plural(row.agendaCount, "item"));
    if (row.openActionCount > 0) facts.push(`${plural(row.openActionCount, "action")} still open`);
  } else if (!cancelled) {
    facts.push(row.agendaCount > 0 ? `${plural(row.agendaCount, "agenda item")}` : "No agenda yet");
  }

  return (
    <li>
      <Link
        href={`/meetings/${m.id}`}
        className="flex items-center gap-3.5 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-bg-subtle/60"
      >
        {/* Date block: the thing people scan for. */}
        <div
          className={cn(
            "tnum flex w-11 shrink-0 flex-col items-center rounded-md border border-border bg-bg-subtle/60 py-1 leading-none",
            (past || cancelled) && "opacity-60"
          )}
        >
          <span className="text-2xs font-medium text-fg-muted uppercase">{format(m.scheduledAt, "MMM")}</span>
          <span className="mt-0.5 text-md font-semibold">{format(m.scheduledAt, "d")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn("truncate text-sm font-medium", cancelled && "text-fg-muted line-through")}>
              {m.title}
            </span>
            {inProgress && <Badge variant="warning">In progress</Badge>}
            {cancelled && <Badge variant="outline">Cancelled</Badge>}
            {!past && !inProgress && isToday(m.scheduledAt) && <Badge>Today</Badge>}
            {!past && isTomorrow(m.scheduledAt) && <Badge variant="neutral">Tomorrow</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
            <span className="tnum">{format(m.scheduledAt, past ? "EEE, MMM d, yyyy" : "EEE · p")}</span>
            <span>{MEETING_KIND_LABEL[m.kind]}</span>
            {m.location && !past && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPinIcon className="size-3 shrink-0" />
                <span className="truncate">{m.location}</span>
              </span>
            )}
            {facts.map((f) => (
              <span key={f} className="tnum">
                {f}
              </span>
            ))}
          </div>
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-fg-subtle" />
      </Link>
    </li>
  );
}

export default async function MeetingsPage() {
  const ctx = await requireCtx();
  const { upcoming, past } = await getMeetingsList(ctx.org.id);
  const canEdit = can(ctx.member.role, "contribute");
  const empty = upcoming.length === 0 && past.length === 0;

  return (
    <div className="pb-10">
      <PageHeader
        title="Meetings"
        description="Build the agenda from the pipeline, run it from a phone, and let the recap write itself."
        actions={!empty ? <NewMeetingDialog /> : undefined}
      />
      <div className="flex flex-col gap-6 px-4 md:px-6">
        {empty ? (
          <EmptyState
            icon={<CalendarIcon />}
            title="No meetings yet"
            description="A meeting here is more than a calendar entry — it is the agenda, the attendance sheet and the to-do list from the room, kept together."
            steps={[
              "Schedule the meeting. It shows up in every member's inbox and the calendar feed.",
              "Build the agenda. Applications ready for discussion and open votes are suggested for you.",
              "On the day, press Start. Run mode walks the room through each item and takes attendance in two taps.",
              "End it, and everyone gets the recap: notes, who came, and who owes what.",
            ]}
            action={canEdit ? <NewMeetingDialog label="Schedule the first meeting" /> : undefined}
          />
        ) : (
          <>
            <section aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="mb-2 text-xs font-medium text-fg-muted">
                Upcoming
              </h2>
              {upcoming.length === 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-4">
                  <p className="text-sm text-fg-muted">
                    Nothing on the calendar. Schedule the next one so it lands in everyone&apos;s inbox.
                  </p>
                </div>
              ) : (
                <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
                  {upcoming.map((row) => (
                    <MeetingRow key={row.meeting.id} row={row} />
                  ))}
                </ul>
              )}
            </section>

            {past.length > 0 && (
              <section aria-labelledby="past-heading">
                <h2 id="past-heading" className="mb-2 text-xs font-medium text-fg-muted">
                  Past
                </h2>
                <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
                  {past.map((row) => (
                    <MeetingRow key={row.meeting.id} row={row} past />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
