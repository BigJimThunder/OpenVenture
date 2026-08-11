import Link from "next/link";
import type { Metadata } from "next";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDownIcon, FileTextIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMyWork, slaBreachDays, isOverdue } from "@/lib/queries/dashboard";
import { formatMoney, cn } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph, PRIORITY_ORDER } from "@/components/patterns/priority-glyph";
import { EmptyState } from "@/components/patterns/empty-state";
import { ActionItemRow } from "@/components/meetings/action-item-row";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

export default async function MyWorkPage() {
  const ctx = await requireCtx();
  const data = await getMyWork(ctx.org.id, ctx.member.id);

  const owned = [...data.owned].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      new Date(a.enteredStageAt).getTime() - new Date(b.enteredStageAt).getTime()
  );

  const total = owned.length + data.tasks.length + data.memos.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader
        title="My work"
        meta={`${owned.length} owned · ${data.sourcedCount} sourced all-time`}
      />

      <main className="flex-1 overflow-y-auto pb-12">
        {total === 0 && (
          <EmptyState
            title="Nothing assigned to you"
            description="Applications you own, memos you're writing, and action items land here."
            className="py-16"
          />
        )}

        {owned.length > 0 && (
          <>
            <GroupHeader title="Applications I own" count={owned.length} />
            {owned.map((a) => {
              const breach = slaBreachDays(a.enteredStageAt, a.slaDays);
              return (
                <Row key={a.id} href={`/pipeline?peek=${a.id}`}>
                  <PriorityGlyph priority={a.priority} />
                  <Ref>{formatRef("application", a.ref)}</Ref>
                  <span className="truncate text-sm font-medium">{a.companyName}</span>
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11.5px] text-fg-muted">
                    <StageDot colorToken={a.stageColor} />
                    {a.stageName}
                  </span>
                  {breach && (
                    <span className="shrink-0 text-[11.5px] text-danger">
                      SLA {breach}d breached
                    </span>
                  )}
                  <span className="tnum ml-auto shrink-0 text-xs text-fg-muted">
                    {a.amountRequested ? formatMoney(a.amountRequested) : ""}
                  </span>
                  <span className="w-14 shrink-0 text-right text-[11.5px] text-fg-subtle">
                    {formatDistanceToNowStrict(a.enteredStageAt)}
                  </span>
                </Row>
              );
            })}
          </>
        )}

        {data.memos.length > 0 && (
          <>
            <GroupHeader title="My memos" count={data.memos.length} />
            {data.memos.map((m) => (
              <Row key={m.id} href={`/memos/${m.id}`}>
                <FileTextIcon className="size-3.5 shrink-0 text-fg-muted" />
                <Ref>{formatRef("memo", m.ref)}</Ref>
                <span className="truncate text-sm font-medium">{m.title}</span>
                <span className="shrink-0 text-[11.5px] text-fg-muted capitalize">{m.status}</span>
                <span className="ml-auto shrink-0 text-[11.5px] text-fg-subtle">
                  {formatDistanceToNowStrict(m.updatedAt, { addSuffix: true })}
                </span>
              </Row>
            ))}
          </>
        )}

        {data.tasks.length > 0 && (
          <>
            <GroupHeader title="Action items" count={data.tasks.length} />
            {data.tasks.map((t) => (
              <ActionItemRow key={t.id} item={t} overdue={isOverdue(t.dueAt)} />
            ))}
          </>
        )}
      </main>

      <ScreenFooter>
        <span>
          <Kbd>C</Kbd> new
        </span>
        <span>
          <Kbd>⌘K</Kbd> commands
        </span>
      </ScreenFooter>
    </div>
  );
}

function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex h-8.5 items-center gap-2 border-b border-border bg-bg-subtle px-4">
      <ChevronDownIcon className="size-3 text-fg-subtle" />
      <span className="text-xs font-semibold">{title}</span>
      <span className="tnum text-[11.5px] text-fg-subtle">{count}</span>
    </div>
  );
}

function Row({ href, children }: { href?: string; children: React.ReactNode }) {
  const className = "flex h-9 items-center gap-2.5 border-b border-border px-4 transition-colors";
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={cn(className, "hover:bg-bg-subtle")}>
      {children}
    </Link>
  );
}

function Ref({ children }: { children: React.ReactNode }) {
  return <span className="w-14 shrink-0 font-mono text-[11.5px] text-fg-subtle">{children}</span>;
}
