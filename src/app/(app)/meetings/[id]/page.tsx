import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { CalendarIcon, ClockIcon, MapPinIcon, PlayIcon, VideoIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { formatRef } from "@/lib/refs";
import { getMeetingDetail, getAgendaSuggestions } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaBuilder } from "@/components/meetings/agenda-builder";
import { AttendanceGrid } from "@/components/meetings/attendance-grid";
import { ActionItems } from "@/components/meetings/action-items";
import { MeetingActions } from "@/components/meetings/meeting-actions";
import {
  MEETING_KIND_LABEL,
  MEETING_STATUS_BADGE,
  MEETING_STATUS_LABEL,
} from "@/components/meetings/meeting-labels";

export const metadata: Metadata = { title: "Meeting" };
export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMeetingDetail(ctx.org.id, id);
  if (!detail) notFound();
  const { meeting: m, items, attendanceRows, actions, members } = detail;

  const canEdit = can(ctx.member.role, "contribute");
  const live = m.status === "scheduled" || m.status === "in_progress";
  const suggestions =
    live && canEdit
      ? await getAgendaSuggestions(ctx.org.id, m.id)
      : { applications: [], voteRounds: [], overdueActions: [] };

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/meetings" className="hover:text-fg">
              Meetings
            </Link>
            <span aria-hidden>/</span>
            <span className="font-mono">{formatRef("meeting", m.ref)}</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {m.title}
            <Badge variant={MEETING_STATUS_BADGE[m.status]}>{MEETING_STATUS_LABEL[m.status]}</Badge>
          </span>
        }
        description={
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5 text-fg-subtle" />
              {format(m.scheduledAt, "EEEE, MMM d 'at' p")}
            </span>
            <span className="tnum flex items-center gap-1.5">
              <ClockIcon className="size-3.5 text-fg-subtle" />
              {m.durationMinutes} min · {MEETING_KIND_LABEL[m.kind]}
            </span>
            {m.location && (
              <span className="flex items-center gap-1.5">
                <MapPinIcon className="size-3.5 text-fg-subtle" />
                {m.location}
              </span>
            )}
            {m.videoUrl && (
              <a
                href={m.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-accent hover:underline"
              >
                <VideoIcon className="size-3.5" />
                Join by video
              </a>
            )}
          </span>
        }
        actions={
          canEdit ? (
            <>
              {live && (
                <Button className="max-md:h-10 max-sm:flex-1" asChild>
                  <Link href={`/meetings/${m.id}/run`}>
                    <PlayIcon />
                    {m.status === "in_progress" ? "Resume meeting" : "Start meeting"}
                  </Link>
                </Button>
              )}
              <MeetingActions
                status={m.status}
                hasRecord={attendanceRows.length > 0 || Boolean(m.recapSentAt)}
                meeting={{
                  id: m.id,
                  title: m.title,
                  kind: m.kind,
                  scheduledAt: m.scheduledAt,
                  durationMinutes: m.durationMinutes,
                  location: m.location,
                  videoUrl: m.videoUrl,
                }}
              />
            </>
          ) : undefined
        }
      />

      {m.status === "cancelled" && (
        <p className="mx-4 mb-3 rounded-lg border border-border bg-bg-subtle px-4 py-2.5 text-sm text-fg-muted md:mx-6">
          This meeting was cancelled. Its agenda is kept{canEdit ? " — restore it from the menu above to run it after all." : "."}
        </p>
      )}

      <div className="grid gap-3 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              <AgendaBuilder
                meetingId={m.id}
                meetingMinutes={m.durationMinutes}
                editable={live && canEdit}
                items={items.map((i) => ({
                  id: i.item.id,
                  title: i.item.title,
                  kind: i.item.kind,
                  status: i.item.status,
                  durationMinutes: i.item.durationMinutes,
                  presenterMemberId: i.item.presenterMemberId,
                  presenterName: i.presenterName,
                  applicationId: i.item.applicationId,
                  voteRoundId: i.item.voteRoundId,
                  notes: i.item.notes,
                }))}
                suggestions={suggestions}
                members={members}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Action items</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionItems
                meetingId={m.id}
                actions={actions}
                members={members}
                editable={canEdit && m.status !== "cancelled"}
                viewerMemberId={ctx.member.id}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
          </CardHeader>
          <CardContent>
            <AttendanceGrid
              meetingId={m.id}
              members={members}
              attendance={Object.fromEntries(attendanceRows.map((a) => [a.memberId, a.status]))}
              editable={canEdit && m.status !== "cancelled"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
