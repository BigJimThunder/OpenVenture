import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMeetingsList } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { NewMeetingDialog } from "@/components/meetings/new-meeting-dialog";

export const metadata: Metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const ctx = await requireCtx();
  const { upcoming, past } = await getMeetingsList(ctx.org.id);

  return (
    <div className="pb-10">
      <PageHeader
        title="Meetings"
        description="Agendas build themselves from the pipeline. Attendance is two taps."
        actions={<NewMeetingDialog />}
      />
      <div className="flex flex-col gap-6 px-6">
        <section>
          <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
            Upcoming
          </h2>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={<CalendarIcon />}
              title="Nothing scheduled"
              description="Create the next general meeting or IC session."
              className="py-8"
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-panel">
              {upcoming.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium">{m.title}</span>
                    <Badge variant={m.kind === "ic" ? "info" : "neutral"}>{m.kind}</Badge>
                  </div>
                  <span className="text-xs text-fg-muted">
                    {format(m.scheduledAt, "EEE, MMM d · p")}
                    {m.location ? ` · ${m.location}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section>
            <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              Past
            </h2>
            <div className="overflow-hidden rounded-lg border border-border bg-panel">
              {past.map((m) => (
                <Link
                  key={m.id}
                  href={`/meetings/${m.id}`}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle/60"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm">{m.title}</span>
                    <Badge variant={m.status === "completed" ? "success" : "neutral"}>
                      {m.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-fg-muted">{format(m.scheduledAt, "MMM d, yyyy")}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
