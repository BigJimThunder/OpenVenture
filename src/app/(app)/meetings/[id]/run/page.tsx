import { notFound, redirect } from "next/navigation";
import { requireCtx } from "@/lib/actions/context";
import { getMeetingDetail } from "@/lib/queries/meetings";
import { RunMode } from "@/components/meetings/run-mode";

export const dynamic = "force-dynamic";

export default async function RunMeetingPage({ params }: PageProps<"/meetings/[id]/run">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMeetingDetail(ctx.org.id, id);
  if (!detail) notFound();
  if (detail.meeting.status === "completed" || detail.meeting.status === "cancelled") {
    redirect(`/meetings/${id}`);
  }

  return (
    <RunMode
      meeting={{
        id: detail.meeting.id,
        title: detail.meeting.title,
        status: detail.meeting.status,
        durationMinutes: detail.meeting.durationMinutes,
      }}
      items={detail.items.map((i) => ({
        id: i.item.id,
        title: i.item.title,
        kind: i.item.kind,
        status: i.item.status,
        durationMinutes: i.item.durationMinutes,
        notes: i.item.notes,
        applicationId: i.item.applicationId,
        voteRoundId: i.item.voteRoundId,
        memoIdForVote: null,
      }))}
      members={detail.members}
      attendance={Object.fromEntries(detail.attendanceRows.map((a) => [a.memberId, a.status]))}
    />
  );
}
