import Link from "next/link";
import type { Metadata, Route } from "next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CircleCheckIcon, SproutIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMyWork, isOverdue } from "@/lib/queries/dashboard";
import { can } from "@/lib/permissions";
import { formatRef } from "@/lib/refs";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/patterns/kbd";
import { StageDot } from "@/components/patterns/entity-ref";
import { PRIORITY_ORDER } from "@/components/patterns/priority-glyph";
import { EmptyState } from "@/components/patterns/empty-state";
import { ListRow, ListSection } from "@/components/patterns/data-list";
import { ListKeys } from "@/components/patterns/data-list-keys";
import { ApplicationRow, MemoRow } from "../inbox/rows";
import { TaskRow } from "../inbox/task-row";

export const metadata: Metadata = { title: "My work" };
export const dynamic = "force-dynamic";

const MEMO_STATUS: Record<string, string> = {
  draft: "Draft — not circulated yet",
  circulated: "Circulated for comment",
  final: "Final",
  decided: "Decided",
};

const SOURCED_STATUS: Record<string, { label: string; variant: "success" | "neutral" | "outline" }> = {
  funded: { label: "Funded", variant: "success" },
  declined: { label: "Declined", variant: "neutral" },
  withdrawn: { label: "Withdrawn", variant: "neutral" },
  on_hold: { label: "On hold", variant: "outline" },
};

/**
 * My work — the ledger of everything with this member's name on it, whether
 * or not it needs anything today. The Inbox is the subset that is urgent.
 */
export default async function MyWorkPage() {
  const ctx = await requireCtx();
  const data = await getMyWork(ctx.org.id, ctx.member.id);
  const canContribute = can(ctx.member.role, "contribute");

  const owned = [...data.owned].sort(
    (a, b) =>
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.enteredStageAt.getTime() - b.enteredStageAt.getTime()
  );
  const total = owned.length + data.tasks.length + data.memos.length + data.sourced.length;
  const fundedSourced = data.sourced.filter((s) => s.status === "funded").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListKeys />
      <ScreenHeader
        title="My work"
        meta={`${owned.length} owned · ${data.tasks.length} action ${data.tasks.length === 1 ? "item" : "items"}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/members/me/insights">My investor profile</Link>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto pb-12">
        {total === 0 ? (
          <div className="p-4 md:p-6">
            <EmptyState
              icon={<CircleCheckIcon />}
              title="Nothing has your name on it yet"
              description={
                canContribute
                  ? "This is your ledger: everything you own, wrote or brought in, whether or not it needs anything today."
                  : "Read-only members aren't assigned work. The pipeline and insights are open to you."
              }
              steps={
                canContribute
                  ? [
                      "Take an application on the Pipeline — set yourself as its owner.",
                      "Write the memo when it reaches Decision; it is listed here while you draft.",
                      "Action items from meetings land here with their due dates.",
                    ]
                  : undefined
              }
              action={
                <Button asChild>
                  <Link href="/pipeline">Open the pipeline</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            {owned.length > 0 && (
              <ListSection title="Applications I own" count={owned.length}>
                {owned.map((a) => (
                  <ApplicationRow key={a.id} app={a} />
                ))}
              </ListSection>
            )}

            {data.tasks.length > 0 && (
              <ListSection title="Action items" count={data.tasks.length}>
                {data.tasks.map((t) => (
                  <TaskRow key={t.id} item={t} overdue={isOverdue(t.dueAt)} />
                ))}
              </ListSection>
            )}

            {data.memos.length > 0 && (
              <ListSection title="Memos I wrote" count={data.memos.length}>
                {data.memos.map((m) => (
                  <MemoRow
                    key={m.id}
                    memo={m}
                    meta={
                      <>
                        <span className="shrink-0">{MEMO_STATUS[m.status] ?? m.status}</span>
                        <span className="shrink-0 text-fg-subtle">
                          edited {formatDistanceToNowStrict(m.updatedAt, { addSuffix: true })}
                        </span>
                      </>
                    }
                  />
                ))}
              </ListSection>
            )}

            {data.sourced.length > 0 && (
              <ListSection
                title="Companies I brought in"
                count={data.sourced.length}
                note={`${fundedSourced} funded`}
              >
                {data.sourced.map((s) => {
                  const closed = SOURCED_STATUS[s.status];
                  return (
                    <ListRow
                      key={s.id}
                      href={`/pipeline/${s.id}` as Route}
                      leading={<SproutIcon className="size-4 text-fg-subtle" />}
                      refLabel={formatRef("application", s.ref)}
                      title={s.companyName}
                      meta={
                        closed ? (
                          <Badge variant={closed.variant}>{closed.label}</Badge>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1.5">
                            <StageDot colorToken={s.stageColor} />
                            {s.stageName}
                          </span>
                        )
                      }
                      trailing={
                        <span className="tnum text-fg-subtle">{format(s.appliedAt, "MMM yyyy")}</span>
                      }
                    />
                  );
                })}
              </ListSection>
            )}
          </>
        )}
      </div>

      <ScreenFooter note="Everything with your name on it. The Inbox is the part that needs you now.">
        <span>
          <Kbd>J</Kbd> <Kbd>K</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>⌘K</Kbd> search
        </span>
      </ScreenFooter>
    </div>
  );
}
