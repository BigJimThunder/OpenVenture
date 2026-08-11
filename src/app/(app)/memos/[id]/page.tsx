import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { HistoryIcon, VoteIcon } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { getMemoDetail } from "@/lib/queries/memos";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemoEditor } from "@/components/memos/memo-editor";
import { MemoToolbar } from "@/components/memos/memo-toolbar";
import { CommentsRail } from "@/components/memos/comments-rail";

export const dynamic = "force-dynamic";

export default async function MemoPage({ params }: PageProps<"/memos/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMemoDetail(ctx.org.id, id);
  if (!detail) notFound();

  const { memo: m, draftSections, versions, comments, rounds } = detail;
  const openRound = rounds.find((r) => r.status === "open");
  const latestRound = rounds[0];
  const closed = m.status === "decided" || m.status === "archived";

  const members = await db
    .select({ id: member.id, name: member.displayName })
    .from(member)
    .where(and(eq(member.orgId, ctx.org.id), eq(member.status, "active")));

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {m.title}
            <Badge
              variant={
                m.status === "decided" ? "success" : m.status === "circulated" ? "warning" : "neutral"
              }
            >
              {m.status}
              {m.currentVersionNo > 0 ? ` · v${m.currentVersionNo}` : ""}
            </Badge>
          </span>
        }
        description={
          <>
            {detail.companyOneLiner ?? ""} · by {detail.authorName} ·{" "}
            <Link href={`/pipeline/${detail.applicationId}`} className="text-accent hover:underline">
              view application
            </Link>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            {latestRound && (
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/memos/${m.id}/vote`}>
                  <VoteIcon />
                  {openRound ? "Vote open" : "Vote"}
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="px-6 pb-4">
        <MemoToolbar
          memoId={m.id}
          status={m.status}
          recommendation={m.recommendation}
          proposedAmount={m.proposedAmount}
          hasOpenRound={!!openRound}
          viewerRole={ctx.member.role}
          members={members.filter((mm) => mm.id !== ctx.member.id)}
        />
      </div>

      <div className="grid gap-3 px-6 lg:grid-cols-[1fr_300px]">
        <MemoEditor
          sections={draftSections.map((s) => ({
            id: s.id,
            title: s.title,
            guidance: s.guidance,
            contentJson: s.contentJson,
            wordCount: s.wordCount,
          }))}
          editable={!closed}
        />
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              Comments
            </h2>
            <CommentsRail memoId={m.id} comments={comments} />
          </div>
          {versions.length > 0 && (
            <div>
              <h2 className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                <HistoryIcon className="size-3" />
                Versions
              </h2>
              <div className="flex flex-col">
                {versions.map((v) => (
                  <Link
                    key={v.id}
                    href={`/memos/${m.id}/versions/${v.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-bg-subtle"
                  >
                    <span>v{v.versionNo}</span>
                    <span className="text-2xs text-fg-subtle">
                      {format(v.createdAt, "MMM d, p")}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
