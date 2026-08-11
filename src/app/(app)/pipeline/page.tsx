import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/actions/context";
import { getPipeline } from "@/lib/queries/applications";
import { cn, formatMoney, seasonStartYear } from "@/lib/utils";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { Board } from "@/components/applications/board";
import { AppList } from "@/components/applications/app-list";
import { PipelineFilters } from "@/components/applications/pipeline-filters";
import { PeekPanel, PeekPanelSkeleton } from "@/components/applications/peek-panel";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const data = await getPipeline(ctx.org.id);

  const peekId = typeof params.peek === "string" ? params.peek : undefined;
  const view = params.view === "list" ? "list" : "board";
  const status =
    typeof params.status === "string" && ["open", "funded", "declined", "all"].includes(params.status)
      ? params.status
      : "all";
  const season =
    typeof params.season === "string" && /^\d{4}$/.test(params.season) ? params.season : "all";

  const seasons = [...new Set(data.apps.map((a) => seasonStartYear(new Date(a.appliedAt))))].sort(
    (a, b) => b - a
  );

  const apps = data.apps.filter((a) => {
    if (status !== "all" && a.status !== status) return false;
    if (season !== "all" && seasonStartYear(new Date(a.appliedAt)) !== Number(season)) return false;
    return true;
  });
  const filtered = { ...data, apps };

  const activeStageIds = new Set(
    data.stages.filter((s) => s.kind === "active").map((s) => s.id)
  );
  const open = apps.filter((a) => a.status === "open" && activeStageIds.has(a.stageId));
  const requested = open.reduce((n, a) => n + Number(a.amountRequested ?? 0), 0);

  const viewHref = (v: "board" | "list") => {
    const next = new URLSearchParams();
    if (v === "list") next.set("view", "list");
    if (status !== "all") next.set("status", status);
    if (season !== "all") next.set("season", season);
    const qs = next.toString();
    return qs ? `/pipeline?${qs}` : "/pipeline";
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader
        title="Pipeline"
        meta={`${open.length} open · ${formatMoney(requested)} requested`}
        actions={
          <>
            <Kbd>⌘K</Kbd>
            <div className="flex overflow-hidden rounded-[5px] border border-border">
              <Link
                href={viewHref("board")}
                className={cn(
                  "flex h-6 items-center px-2.5 text-[11.5px]",
                  view === "board" ? "bg-bg-subtle font-medium" : "text-fg-subtle hover:text-fg"
                )}
              >
                Board
              </Link>
              <Link
                href={viewHref("list")}
                className={cn(
                  "flex h-6 items-center border-l border-border px-2.5 text-[11.5px]",
                  view === "list" ? "bg-bg-subtle font-medium" : "text-fg-subtle hover:text-fg"
                )}
              >
                List
              </Link>
            </div>
          </>
        }
      />

      <div className="flex h-9.5 shrink-0 items-center gap-1.5 border-b border-border px-4">
        <PipelineFilters status={status} season={season} seasons={seasons} />
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-x-auto">
          {view === "board" ? <Board data={filtered} /> : <AppList data={filtered} />}
        </main>
        {peekId && (
          <Suspense key={peekId} fallback={<PeekPanelSkeleton />}>
            <PeekPanel orgId={ctx.org.id} applicationId={peekId} stages={data.stages} />
          </Suspense>
        )}
      </div>

      <ScreenFooter note="Drag cards to move stage · declines require a reason">
        <span>
          <Kbd>Space</Kbd> peek
        </span>
        <span>
          <Kbd>↵</Kbd> open
        </span>
        <span>
          <Kbd>⌘K</Kbd> commands
        </span>
      </ScreenFooter>
    </div>
  );
}
