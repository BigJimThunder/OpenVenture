import type { Metadata, Route } from "next";
import { formatDistanceToNow } from "date-fns";
import { FlaskConicalIcon, GitBranchIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getCapTablesList, getCapEventsByTable } from "@/lib/queries/captable";
import { foldCapTable } from "@/lib/captable/engine";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Panel } from "@/components/patterns/data-panel";
import { ListRow } from "@/components/patterns/data-list";
import { SegmentBar } from "@/components/patterns/data-segment-bar";
import { Badge } from "@/components/ui/badge";
import { NewCapTableDialog } from "@/components/lab/new-cap-table-dialog";
import { ownershipSegments } from "@/components/lab/ownership";
import { holderColors } from "@/components/lab/format";

export const metadata: Metadata = { title: "Cap Table Lab" };
export const dynamic = "force-dynamic";

export default async function LabPage() {
  const ctx = await requireCtx();
  const [tables, eventsByTable] = await Promise.all([
    getCapTablesList(ctx.org.id),
    getCapEventsByTable(ctx.org.id),
  ]);
  const canContribute = can(ctx.member.role, "contribute");

  return (
    <div className="pb-10">
      <PageHeader
        title="Cap Table Lab"
        description="Sit down with a founder, model the offer in front of them, and show what it does to their ownership. Every number expands into its arithmetic."
        actions={canContribute ? <NewCapTableDialog /> : undefined}
      />
      <div className="px-4 md:px-6">
        {tables.length === 0 ? (
          <EmptyState
            icon={<FlaskConicalIcon />}
            title="Model the offer before the founder signs it"
            description="A founder says “an accelerator offered $125K for 7%” or “I won $60K on a SAFE”. This is where you work out what that costs them."
            steps={[
              "Start from a preset that matches the situation, or a blank table.",
              "Add what has happened so far to the ledger: founder shares, SAFEs, notes, an option pool.",
              "Preview a priced round and read the before and after, line by line.",
            ]}
            action={canContribute ? <NewCapTableDialog /> : undefined}
          />
        ) : (
          <Panel bodyClassName="[&>*:last-child]:border-b-0 overflow-hidden rounded-lg">
            {tables.map((t) => {
              const events = eventsByTable[t.id] ?? [];
              let rows: ReturnType<typeof foldCapTable>["rows"] = [];
              try {
                rows = foldCapTable(events).rows;
              } catch {
                // A ledger that no longer folds still lists; the workbench explains why.
              }
              return (
                <ListRow
                  key={t.id}
                  href={`/lab/${t.id}` as Route}
                  leading={
                    t.isScenario ? (
                      <GitBranchIcon className="size-4 text-fg-subtle" />
                    ) : (
                      <FlaskConicalIcon className="size-4 text-fg-subtle" />
                    )
                  }
                  title={t.name}
                  meta={
                    <>
                      {t.isScenario && <Badge variant="info">Scenario</Badge>}
                      {t.companyName && <Badge variant="neutral">{t.companyName}</Badge>}
                      <span className="tnum shrink-0">
                        {t.eventCount} {t.eventCount === 1 ? "event" : "events"}
                      </span>
                      <span className="truncate text-fg-subtle">
                        edited {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                        {t.createdByName ? ` · ${t.createdByName}` : ""}
                      </span>
                    </>
                  }
                  trailing={
                    rows.length > 0 ? (
                      <SegmentBar
                        segments={ownershipSegments(rows, holderColors(events))}
                        label="Ownership"
                        height="h-2"
                        className="w-20 sm:w-40"
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </Panel>
        )}
        <p className="mt-3 max-w-prose text-xs text-fg-subtle">
          Educational modeling only, not legal or financial advice. Check it against the
          company&apos;s own documents before anyone signs anything.
        </p>
      </div>
    </div>
  );
}
