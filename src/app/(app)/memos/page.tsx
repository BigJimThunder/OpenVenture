import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FileTextIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMemosList } from "@/lib/queries/memos";
import type { MemoStatus } from "@/db/schema";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Money } from "@/components/patterns/money";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Memos" };
export const dynamic = "force-dynamic";

const STATUS_META: Record<MemoStatus, { label: string; variant: "neutral" | "info" | "warning" | "success" }> = {
  draft: { label: "Draft", variant: "neutral" },
  in_review: { label: "In review", variant: "info" },
  circulated: { label: "Circulated", variant: "warning" },
  decided: { label: "Decided", variant: "success" },
  archived: { label: "Archived", variant: "neutral" },
};

const ORDER: MemoStatus[] = ["circulated", "in_review", "draft", "decided", "archived"];

export default async function MemosPage() {
  const ctx = await requireCtx();
  const memos = await getMemosList(ctx.org.id);
  const groups = ORDER.map((s) => ({ status: s, items: memos.filter((m) => m.status === s) })).filter(
    (g) => g.items.length > 0
  );

  return (
    <div className="pb-10">
      <PageHeader
        title="Memos"
        description="Write from the template, circulate to the club, then open a blind vote."
      />
      <div className="flex flex-col gap-6 px-6">
        {memos.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon />}
            title="No memos yet"
            description="Start one from an application — the template guides the structure."
          />
        ) : (
          groups.map((g) => (
            <section key={g.status}>
              <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                {STATUS_META[g.status].label} · {g.items.length}
              </h2>
              <div className="overflow-hidden rounded-lg border border-border bg-panel">
                {g.items.map((m) => (
                  <Link
                    key={m.id}
                    href={`/memos/${m.id}`}
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle/60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{m.title}</span>
                        <Badge variant={STATUS_META[m.status].variant}>
                          {STATUS_META[m.status].label}
                          {m.currentVersionNo > 0 ? ` · v${m.currentVersionNo}` : ""}
                        </Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-fg-muted">
                        {m.authorName} · updated {formatDistanceToNow(m.updatedAt, { addSuffix: true })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs text-fg-muted">
                      {m.recommendation && (
                        <span className="capitalize">{m.recommendation.replace("_", " ")}</span>
                      )}
                      <Money value={m.proposedAmount} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
