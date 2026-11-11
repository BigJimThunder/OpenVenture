import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { KanbanIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getPipeline, getPipelineLookups } from "@/lib/queries/applications";
import { activeFilterCount, applyPipelineFilters, parsePipelineFilters } from "@/lib/pipeline/filters";
import { requestNow } from "@/lib/pipeline/clock";
import { can } from "@/lib/permissions";
import { cn, formatMoney, seasonStartYear } from "@/lib/utils";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { EmptyState } from "@/components/patterns/empty-state";
import { PipelineView } from "@/components/applications/pipeline-view";
import { PipelineFilters } from "@/components/applications/pipeline-filters";
import { PeekPanel, PeekPanelSkeleton } from "@/components/applications/peek-panel";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const [data, lookups] = await Promise.all([
    getPipeline(ctx.org.id),
    getPipelineLookups(ctx.org.id),
  ]);

  const peekId = typeof params.peek === "string" ? params.peek : undefined;
  const view = params.view === "list" ? "list" : "board";
  const filters = parsePipelineFilters(params);
  const canContribute = can(ctx.member.role, "contribute");

  const seasons = [...new Set(data.apps.map((a) => seasonStartYear(new Date(a.appliedAt))))].sort(
    (a, b) => b - a
  );
  const apps = applyPipelineFilters(data.apps, filters, ctx.member.id);
  const filtered = { ...data, apps };

  const activeStageIds = new Set(data.stages.filter((s) => s.kind === "active").map((s) => s.id));
  const open = apps.filter((a) => a.status === "open" && activeStageIds.has(a.stageId));
  const requested = open.reduce((n, a) => n + Number(a.amountRequested ?? 0), 0);

  const viewHref = (v: "board" | "list") => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && key !== "view" && key !== "peek") next.set(key, value);
    }
    if (v === "list") next.set("view", "list");
    const qs = next.toString();
    return qs ? `/pipeline?${qs}` : "/pipeline";
  };

  return (
    <NuqsAdapter>
      <div className="flex h-full min-h-0 flex-col">
        <ScreenHeader
          title="Pipeline"
          meta={`${open.length} open · ${formatMoney(requested)} requested`}
          actions={
            <div className="hidden items-center gap-2 md:flex">
              <Kbd>⌘K</Kbd>
              <div className="flex overflow-hidden rounded-[5px] border border-border">
                {(["board", "list"] as const).map((v, i) => (
                  <Link
                    key={v}
                    href={viewHref(v)}
                    aria-current={view === v ? "page" : undefined}
                    className={cn(
                      "flex h-6 items-center px-2.5 text-[11.5px] capitalize",
                      i > 0 && "border-l border-border",
                      view === v ? "bg-bg-subtle font-medium" : "text-fg-subtle hover:text-fg"
                    )}
                  >
                    {v}
                  </Link>
                ))}
              </div>
            </div>
          }
        />

        <div className="flex h-9.5 shrink-0 items-center border-b border-border px-4 max-md:h-12 max-md:px-3">
          <PipelineFilters
            filters={filters}
            seasons={seasons}
            members={lookups.members}
            sectors={lookups.sectors}
          />
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            {data.apps.length === 0 ? (
              <div className="p-4 md:p-6">
                <EmptyState
                  icon={<KanbanIcon />}
                  title="No applications yet"
                  description="This is where every company that asks the club for a grant lives, from first contact to a decision."
                  steps={[
                    "Applications arrive from your public form, from an import, or when a member adds one by hand.",
                    "Each one moves left to right: screen it, meet the founder for a coffee chat, write a memo, vote.",
                    "Every application ends as funded or declined — a decline always carries a recorded reason.",
                  ]}
                  action={canContribute ? <NewApplicationDialog /> : undefined}
                />
              </div>
            ) : apps.length === 0 ? (
              <p className="px-4 py-16 text-center text-sm text-fg-muted">
                No applications match {activeFilterCount(filters) === 1 ? "this filter" : "these filters"}.{" "}
                <Link href={view === "list" ? "/pipeline?view=list" : "/pipeline"} className="text-accent hover:underline">
                  Clear filters
                </Link>
              </p>
            ) : (
              <PipelineView data={filtered} view={view} now={requestNow()} />
            )}
          </div>
          {peekId && (
            <Suspense key={peekId} fallback={<PeekPanelSkeleton />}>
              <PeekPanel
                orgId={ctx.org.id}
                applicationId={peekId}
                stages={data.stages}
                members={lookups.members}
                viewerRole={ctx.member.role}
              />
            </Suspense>
          )}
        </div>

        <ScreenFooter
          note={
            canContribute
              ? view === "board"
                ? "Drag a card to move it · dropping on Declined asks for a reason"
                : "Select a row, then use the keys"
              : "Read-only access — open any application to read it"
          }
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> select
          </span>
          <span>
            <Kbd>Space</Kbd> peek
          </span>
          <span>
            <Kbd>↵</Kbd> open
          </span>
          {canContribute && (
            <>
              <span>
                <Kbd>1</Kbd>–<Kbd>4</Kbd> priority
              </span>
              <span>
                <Kbd>A</Kbd> assign me
              </span>
              <span>
                <Kbd>D</Kbd> decline
              </span>
            </>
          )}
          <span>
            <Kbd>⌘K</Kbd> commands
          </span>
        </ScreenFooter>
      </div>
    </NuqsAdapter>
  );
}
