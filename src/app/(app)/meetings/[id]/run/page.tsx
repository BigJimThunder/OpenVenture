import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { getMeetingDetail } from "@/lib/queries/meetings";
import { RunMode } from "@/components/meetings/run-mode";

export const metadata: Metadata = { title: "Run meeting" };
export const dynamic = "force-dynamic";

export default async function RunMeetingPage({ params }: PageProps<"/meetings/[id]/run">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMeetingDetail(ctx.org.id, id);
  if (!detail) notFound();
  // Run mode writes on arrival (it starts the meeting), so it is for contributors
  // and only while the meeting is still live.
  if (
    !can(ctx.member.role, "contribute") ||
    detail.meeting.status === "completed" ||
    detail.meeting.status === "cancelled"
  ) {
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
        presenterName: i.presenterName,
        applicationId: i.item.applicationId,
        voteRoundId: i.item.voteRoundId,
        memoIdForVote: i.voteMemoId,
        startedAt: i.item.startedAt?.toISOString() ?? null,
        endedAt: i.item.endedAt?.toISOString() ?? null,
      }))}
      members={detail.members}
      attendance={Object.fromEntries(detail.attendanceRows.map((a) => [a.memberId, a.status]))}
      actions={detail.actions}
      viewerMemberId={ctx.member.id}
    />
  );
}
