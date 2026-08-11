import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { PlayIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMeetingDetail, getAgendaSuggestions } from "@/lib/queries/meetings";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaBuilder } from "@/components/meetings/agenda-builder";
import { AttendanceGrid } from "@/components/meetings/attendance-grid";
import { ActionItems } from "@/components/meetings/action-items";

export const dynamic = "force-dynamic";

export default async function MeetingPage({ params }: PageProps<"/meetings/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMeetingDetail(ctx.org.id, id);
  if (!detail) notFound();
  const { meeting: m, items, attendanceRows, actions, members } = detail;
  const suggestions =
    m.status === "scheduled" || m.status === "in_progress"
      ? await getAgendaSuggestions(ctx.org.id, m.id)
      : { applications: [], voteRounds: [], overdueActions: [] };

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {m.title}
            <Badge
              variant={
                m.status === "completed"
                  ? "success"
                  : m.status === "in_progress"
                    ? "warning"
                    : "neutral"
              }
            >
              {m.status.replace("_", " ")}
            </Badge>
          </span>
        }
        description={`${format(m.scheduledAt, "EEEE, MMM d 'at' p")} · ${m.durationMinutes} min${
          m.location ? ` · ${m.location}` : ""
        }`}
        actions={
          m.status !== "completed" && m.status !== "cancelled" ? (
            <Button size="sm" asChild>
              <Link href={`/meetings/${m.id}/run`}>
                <PlayIcon />
                {m.status === "in_progress" ? "Resume" : "Start meeting"}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-3 px-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>Agenda</CardTitle>
            </CardHeader>
            <CardContent>
              <AgendaBuilder
                meetingId={m.id}
                editable={m.status !== "completed" && m.status !== "cancelled"}
                items={items.map((i) => ({
                  id: i.item.id,
                  title: i.item.title,
                  kind: i.item.kind,
                  status: i.item.status,
                  durationMinutes: i.item.durationMinutes,
                  presenterName: i.presenterName,
                  companyName: i.companyName,
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
              <ActionItems meetingId={m.id} actions={actions} members={members} />
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
              editable={m.status !== "cancelled"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
