import type { Route } from "next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarIcon, CheckIcon, FileTextIcon, VoteIcon } from "lucide-react";
import type { ApplicationPriority } from "@/db/schema";
import { isOverdue, slaBreachDays } from "@/lib/queries/dashboard";
import { formatRef } from "@/lib/refs";
import { cn } from "@/lib/utils";
import { Money } from "@/components/patterns/money";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph } from "@/components/patterns/priority-glyph";
import { ListRow, OwnerAvatar, RowFlag } from "@/components/patterns/data-list";

/** The row vocabulary shared by Inbox and My work. */

/** A small button-shaped cue on the right of a row whose link IS the action. */
export function RowAction({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md px-2.5 text-xs font-medium shadow-xs transition-colors",
        primary
          ? "bg-accent text-accent-fg group-hover:bg-accent-hover"
          : "border border-border bg-panel text-fg group-hover:border-border-strong"
      )}
    >
      {children}
    </span>
  );
}

export function ApplicationRow({
  app,
  showOwner,
}: {
  app: {
    id: string;
    ref: number;
    priority: ApplicationPriority;
    companyName: string;
    stageName: string;
    stageColor: string;
    slaDays: number | null;
    enteredStageAt: Date;
    amountRequested: string | null;
    nextStep: string | null;
    nextStepDue: Date | null;
    ownerName?: string | null;
  };
  showOwner?: boolean;
}) {
  const breach = slaBreachDays(app.enteredStageAt, app.slaDays);
  const age = formatDistanceToNowStrict(app.enteredStageAt);
  return (
    <ListRow
      href={`/pipeline?peek=${app.id}` as Route}
      leading={<PriorityGlyph priority={app.priority} />}
      refLabel={formatRef("application", app.ref)}
      title={app.companyName}
      meta={
        <>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <StageDot colorToken={app.stageColor} />
            {app.stageName}
          </span>
          {breach ? (
            <RowFlag>
              {age} in stage · {breach}d target
            </RowFlag>
          ) : (
            <RowFlag tone="muted">{age} in stage</RowFlag>
          )}
          {app.nextStep && (
            <RowFlag tone={isOverdue(app.nextStepDue) ? "danger" : "muted"}>
              <span className="truncate">
                {isOverdue(app.nextStepDue) ? "Overdue: " : "Next: "}
                {app.nextStep}
              </span>
            </RowFlag>
          )}
        </>
      }
      trailing={
        <>
          {app.amountRequested && <Money value={app.amountRequested} className="max-sm:hidden" />}
          {showOwner && <OwnerAvatar name={app.ownerName ?? null} />}
        </>
      }
    />
  );
}

/**
 * An open vote, from the viewer's side only: whether THEIR ballot is in and
 * when the round closes. Never a tally or turnout — the round is blind.
 */
export function BallotRow({
  round,
  cast,
}: {
  round: { id: string; title: string; memoId: string | null; memoRef: number | null; closesAt: Date | null };
  cast: boolean;
}) {
  return (
    <ListRow
      href={(round.memoId ? `/memos/${round.memoId}/vote` : "/memos") as Route}
      leading={
        cast ? (
          <CheckIcon className="size-4 text-success" />
        ) : (
          <VoteIcon className="size-4 text-accent" />
        )
      }
      refLabel={round.memoRef != null ? formatRef("memo", round.memoRef) : undefined}
      title={round.title}
      meta={
        <>
          <span className="shrink-0">{cast ? "Your ballot is in" : "Your ballot is missing"}</span>
          {round.closesAt && (
            <RowFlag tone={cast ? "muted" : "warning"}>
              closes in {formatDistanceToNowStrict(round.closesAt)}
            </RowFlag>
          )}
        </>
      }
      trailing={<RowAction primary={!cast}>{cast ? "Review" : "Vote"}</RowAction>}
    />
  );
}

export function MemoRow({
  memo,
  meta,
  action,
}: {
  memo: { id: string; ref: number; title: string };
  meta: React.ReactNode;
  action?: string;
}) {
  return (
    <ListRow
      href={`/memos/${memo.id}` as Route}
      leading={<FileTextIcon className="size-4 text-fg-muted" />}
      refLabel={formatRef("memo", memo.ref)}
      title={memo.title}
      meta={meta}
      trailing={action ? <RowAction>{action}</RowAction> : undefined}
    />
  );
}

export function MeetingRow({
  meeting,
}: {
  meeting: { id: string; ref: number; title: string; scheduledAt: Date; location: string | null };
}) {
  return (
    <ListRow
      href={`/meetings/${meeting.id}` as Route}
      leading={<CalendarIcon className="size-4 text-fg-muted" />}
      refLabel={formatRef("meeting", meeting.ref)}
      title={meeting.title}
      meta={
        <>
          <span className="shrink-0">{format(meeting.scheduledAt, "EEE, MMM d · p")}</span>
          {meeting.location && <span className="truncate">{meeting.location}</span>}
        </>
      }
      trailing={<RowAction>Agenda</RowAction>}
    />
  );
}
