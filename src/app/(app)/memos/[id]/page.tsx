import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { HistoryIcon, VoteIcon } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { member } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { aiConfigured } from "@/lib/ai";
import { isAiDraft } from "@/lib/ai/memo-draft";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getMemoDetail } from "@/lib/queries/memos";
import { formatRef } from "@/lib/refs";
import { PageHeader } from "@/components/patterns/page-header";
import { Money } from "@/components/patterns/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemoEditor, type AiAvailability } from "@/components/memos/memo-editor";
import { MemoActions } from "@/components/memos/memo-toolbar";
import { CommentsRail, CommentsSheet } from "@/components/memos/comments-rail";
import { MEMO_STATUS, REC_LABEL } from "@/components/memos/memo-labels";

export const metadata: Metadata = { title: "Memo" };
export const dynamic = "force-dynamic";

export default async function MemoPage({ params }: PageProps<"/memos/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMemoDetail(ctx.org.id, id);
  if (!detail) notFound();

  const { memo: m, draftSections, versions, comments, rounds } = detail;
  const openRound = rounds.find((r) => r.status === "open");
  const closed = m.status === "decided" || m.status === "archived";
  const canWrite = can(ctx.member.role, "contribute");
  const isAdmin = can(ctx.member.role, "manageClub");

  const members = await db
    .select({ id: member.id, name: member.displayName })
    .from(member)
    .where(and(eq(member.orgId, ctx.org.id), eq(member.status, "active")));

  const ai: AiAvailability = !aiConfigured()
    ? { available: false, reason: "Add an ANTHROPIC_API_KEY to enable drafts." }
    : !orgSettings(ctx.org).ai.enabled
      ? {
          available: false,
          reason: isAdmin ? "AI drafts are off — Settings → AI." : "AI drafts are switched off for this club.",
        }
      : { available: true };

  const status = MEMO_STATUS[m.status];

  return (
    <div className="pb-10">
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Link href="/memos" className="hover:text-fg">
              Memos
            </Link>
            <span aria-hidden>/</span>
            <span className="font-mono">{formatRef("memo", m.ref)}</span>
          </span>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            {m.title}
            <Badge variant={status.variant}>
              {status.label}
              {m.currentVersionNo > 0 ? ` · v${m.currentVersionNo}` : ""}
            </Badge>
          </span>
        }
        description={
          <>
            {detail.companyOneLiner ? `${detail.companyOneLiner} · ` : ""}Written by {detail.authorName} ·{" "}
            <Link href={`/pipeline/${detail.applicationId}`} className="text-accent hover:underline">
              Open the application
            </Link>
          </>
        }
        actions={
          <>
            <CommentsSheet memoId={m.id} comments={comments} />
            {rounds.length > 0 && (
              <Button variant="secondary" className="max-md:h-10" asChild>
                <Link href={`/memos/${m.id}/vote`}>
                  <VoteIcon />
                  {openRound ? "Vote is open" : "See the vote"}
                </Link>
              </Button>
            )}
            <MemoActions
              memoId={m.id}
              title={m.title}
              status={m.status}
              recommendation={m.recommendation}
              proposedAmount={m.proposedAmount}
              amountRequested={detail.amountRequested}
              authorMemberId={m.authorMemberId}
              hasOpenRound={Boolean(openRound)}
              hasAnyRound={rounds.length > 0}
              members={members.filter((mm) => mm.id !== ctx.member.id)}
            />
          </>
        }
      />

      {/* The proposal at a glance — edited from the menu, so it can't be changed by a stray tap. */}
      <dl className="mx-4 mb-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-panel text-sm shadow-xs md:mx-6 md:max-w-xl">
        <div className="px-3 py-2.5 md:px-4">
          <dt className="text-xs text-fg-muted">Recommendation</dt>
          <dd className="mt-0.5 font-medium">
            {m.recommendation ? REC_LABEL[m.recommendation] : <span className="text-fg-subtle">Not set</span>}
          </dd>
        </div>
        <div className="px-3 py-2.5 md:px-4">
          <dt className="text-xs text-fg-muted">Proposed</dt>
          <dd className="mt-0.5 font-medium">
            <Money value={m.proposedAmount} />
          </dd>
        </div>
        <div className="px-3 py-2.5 md:px-4">
          <dt className="text-xs text-fg-muted">Requested</dt>
          <dd className="mt-0.5 font-medium">
            <Money value={detail.amountRequested} />
          </dd>
        </div>
      </dl>

      {m.status === "archived" && (
        <p className="mx-4 mb-4 rounded-lg border border-border bg-bg-subtle px-4 py-2.5 text-sm text-fg-muted md:mx-6">
          This draft is archived and read-only.
        </p>
      )}

      <div className="grid gap-x-6 gap-y-4 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <MemoEditor
          memoId={m.id}
          sections={draftSections.map((s) => ({
            id: s.id,
            title: s.title,
            guidance: s.guidance,
            required: s.required ?? false,
            contentJson: s.contentJson,
            wordCount: s.wordCount,
            aiDraft: isAiDraft(s.contentJson),
          }))}
          editable={!closed && canWrite}
          ai={ai}
        />
        <aside className="flex min-w-0 flex-col gap-6">
          <section className="hidden lg:block" aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="mb-2 text-xs font-medium text-fg-muted">
              Comments
            </h2>
            <CommentsRail memoId={m.id} comments={comments} />
          </section>
          <section aria-labelledby="versions-heading">
            <h2 id="versions-heading" className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <HistoryIcon className="size-3.5" />
              Versions
            </h2>
            {versions.length === 0 ? (
              <p className="text-sm text-fg-muted">
                None yet. Circulating saves a numbered snapshot the club votes on; the draft stays
                editable afterwards.
              </p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/memos/${m.id}/versions/${v.id}`}
                      className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 text-sm transition-colors hover:bg-bg-subtle max-md:min-h-11"
                    >
                      <span className="font-medium">Version {v.versionNo}</span>
                      <span className="tnum truncate text-xs text-fg-subtle">
                        {v.createdByName ? `${v.createdByName} · ` : ""}
                        {format(v.createdAt, "MMM d, p")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
