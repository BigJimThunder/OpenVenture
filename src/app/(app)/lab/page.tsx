import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { FlaskConicalIcon, GitBranchIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getCapTablesList } from "@/lib/queries/captable";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { NewCapTableDialog } from "@/components/lab/new-cap-table-dialog";

export const metadata: Metadata = { title: "Cap Table Lab" };
export const dynamic = "force-dynamic";

export default async function LabPage() {
  const ctx = await requireCtx();
  const tables = await getCapTablesList(ctx.org.id);

  return (
    <div className="pb-10">
      <PageHeader
        title="Cap Table Lab"
        description="A dilution sandbox for advising grantees — and training yourselves. Every number shows its work."
        actions={<NewCapTableDialog />}
      />
      <div className="px-6">
        {tables.length === 0 ? (
          <EmptyState
            icon={<FlaskConicalIcon />}
            title="No cap tables yet"
            description="Start from a preset — the accelerator '$125K for 7%' deal is the one every founder should model before signing."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-panel">
            {tables.map((t) => (
              <Link
                key={t.id}
                href={`/lab/${t.id}`}
                className="flex items-center justify-between border-b border-border px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-subtle/60"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {t.isScenario ? (
                    <GitBranchIcon className="size-4 shrink-0 text-fg-subtle" />
                  ) : (
                    <FlaskConicalIcon className="size-4 shrink-0 text-fg-subtle" />
                  )}
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  {t.isScenario && <Badge variant="info">scenario</Badge>}
                  {t.companyName && <Badge variant="neutral">{t.companyName}</Badge>}
                </div>
                <span className="tnum shrink-0 text-xs text-fg-muted">
                  {t.eventCount} events · {formatDistanceToNow(t.updatedAt, { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        )}
        <p className="mt-4 text-2xs text-fg-subtle">
          Educational modeling only — not legal or financial advice. Verify against the
          company&apos;s own records before anyone signs anything.
        </p>
      </div>
    </div>
  );
}
