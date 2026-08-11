import { Suspense } from "react";
import type { Metadata } from "next";
import { PlusIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getPipeline } from "@/lib/queries/applications";
import { formatMoney } from "@/lib/utils";
import { ScreenHeader, ScreenFooter } from "@/components/shell/screen-header";
import { Kbd } from "@/components/patterns/kbd";
import { Board } from "@/components/applications/board";
import { PeekPanel, PeekPanelSkeleton } from "@/components/applications/peek-panel";

export const metadata: Metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const data = await getPipeline(ctx.org.id);

  const peekId = typeof params.peek === "string" ? params.peek : undefined;

  const activeStageIds = new Set(
    data.stages.filter((s) => s.kind === "active").map((s) => s.id)
  );
  const open = data.apps.filter((a) => a.status === "open" && activeStageIds.has(a.stageId));
  const requested = open.reduce((n, a) => n + Number(a.amountRequested ?? 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScreenHeader
        title="Pipeline"
        meta={`${open.length} open · ${formatMoney(requested)} requested`}
        actions={
          <>
            <Kbd>⌘K</Kbd>
            <div className="flex overflow-hidden rounded-[5px] border border-border">
              <span className="flex h-6 items-center bg-bg-subtle px-2.5 text-[11.5px] font-medium">
                Board
              </span>
              <span className="flex h-6 items-center border-l border-border px-2.5 text-[11.5px] text-fg-subtle">
                List
              </span>
            </div>
          </>
        }
      />

      <div className="flex h-9.5 shrink-0 items-center gap-1.5 border-b border-border px-4">
        <FilterChip label="Status" value="is Active" />
        <FilterChip label="Season" value={`is ${seasonLabel()}`} />
        <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-dashed border-border-strong px-2 py-0.5 text-[11.5px] text-fg-subtle">
          <PlusIcon className="size-2.5" />
          Filter
          <Kbd>F</Kbd>
        </span>
        <span className="ml-auto text-2xs text-fg-subtle">Save as view</span>
      </div>

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-x-auto">
          <Board data={data} />
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

function FilterChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-border bg-bg-subtle px-2 py-0.5 text-[11.5px] text-fg-muted">
      {label} <span className="text-fg">{value}</span>
    </span>
  );
}

/** Academic year, e.g. "2025–26" — the club's unit of time, not the calendar year. */
function seasonLabel(now = new Date()) {
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}–${String(start + 1).slice(2)}`;
}
