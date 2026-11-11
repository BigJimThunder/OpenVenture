import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileTextIcon, MessageSquareIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { getMemosList } from "@/lib/queries/memos";
import { formatRef } from "@/lib/refs";
import type { MemoStatus } from "@/db/schema";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Money } from "@/components/patterns/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MEMO_STATUS, REC_LABEL } from "@/components/memos/memo-labels";

export const metadata: Metadata = { title: "Memos" };
export const dynamic = "force-dynamic";

/** What needs the club's attention first: memos waiting on a vote, then work in progress. */
const ORDER: MemoStatus[] = ["circulated", "in_review", "draft", "decided"];

type MemoRow = Awaited<ReturnType<typeof getMemosList>>[number];

function MemoList({ items }: { items: MemoRow[] }) {
  return (
    <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
      {items.map((m) => (
        <li key={m.id}>
          <Link
            href={`/memos/${m.id}`}
            className="flex flex-col gap-1 border-b border-border px-4 py-3 transition-colors last:border-0 hover:bg-bg-subtle/60 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 font-mono text-[11.5px] text-fg-subtle">{formatRef("memo", m.ref)}</span>
                <span className="truncate text-sm font-medium">{m.title}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                <span>{m.authorName}</span>
                <span>edited {formatDistanceToNow(m.updatedAt, { addSuffix: true })}</span>
                {m.status === "draft" && m.sectionsTotal > 0 && (
                  <span className="tnum">
                    {m.sectionsFilled}/{m.sectionsTotal} sections written
                  </span>
                )}
                {m.currentVersionNo > 0 && <span className="tnum">v{m.currentVersionNo}</span>}
                {m.openComments > 0 && (
                  <span className="tnum flex items-center gap-1">
                    <MessageSquareIcon className="size-3" />
                    {m.openComments}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-sm sm:w-48 sm:justify-end">
              {m.recommendation && <Badge variant="outline">{REC_LABEL[m.recommendation]}</Badge>}
              <Money value={m.proposedAmount} className="font-medium sm:w-16 sm:text-right" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function MemosPage() {
  const ctx = await requireCtx();
  const memos = await getMemosList(ctx.org.id);
  const canWrite = can(ctx.member.role, "contribute");
  const groups = ORDER.map((s) => ({ status: s, items: memos.filter((m) => m.status === s) })).filter(
    (g) => g.items.length > 0
  );
  const archived = memos.filter((m) => m.status === "archived");

  return (
    <div className="pb-10">
      <PageHeader
        title="Memos"
        description="The written case for each grant. Write it from the template, circulate it to the club, then vote."
      />
      <div className="flex flex-col gap-6 px-4 md:px-6">
        {memos.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon />}
            title="No memos yet"
            description="A memo is the one-page argument for (or against) funding a company. The club reads it before it votes, and it stays as the record of why."
            steps={[
              "Open an application that has had its coffee chat and press Start memo. One memo per application.",
              "Fill in the template's sections. If AI is switched on, it can draft the empty ones from the application for you to edit.",
              "Circulate it. Every member gets a link and a numbered snapshot is saved.",
              "A partner opens the blind vote from the memo.",
            ]}
            action={
              canWrite ? (
                <Button asChild className="max-md:h-10">
                  <Link href="/pipeline">Pick an application</Link>
                </Button>
              ) : undefined
            }
            secondaryAction={
              can(ctx.member.role, "manageClub") ? (
                <Button variant="secondary" asChild className="max-md:h-10">
                  <Link href="/settings#templates">Edit the memo template</Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            {groups.length === 0 && (
              <p className="text-sm text-fg-muted">
                Every memo is archived. Start a new one from an application in the pipeline.
              </p>
            )}
            {groups.map((g) => (
              <section key={g.status} aria-labelledby={`memos-${g.status}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                  <h2 id={`memos-${g.status}`} className="text-xs font-medium text-fg-muted">
                    {MEMO_STATUS[g.status].label} <span className="tnum text-fg-subtle">· {g.items.length}</span>
                  </h2>
                  <span className="text-xs text-fg-subtle">{MEMO_STATUS[g.status].hint}</span>
                </div>
                <MemoList items={g.items} />
              </section>
            ))}
            {archived.length > 0 && (
              <details>
                <summary className="cursor-pointer py-1 text-xs font-medium text-fg-muted">
                  Archived <span className="tnum text-fg-subtle">· {archived.length}</span>
                </summary>
                <div className="mt-2">
                  <MemoList items={archived} />
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  );
}
