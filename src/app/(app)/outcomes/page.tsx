import type { Metadata } from "next";
import { requireCtx } from "@/lib/actions/context";
import { getOutcomesList } from "@/lib/queries/grants";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { OutcomesTable } from "@/components/grants/outcomes-table";

export const metadata: Metadata = { title: "Outcomes" };
export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const ctx = await requireCtx();
  const rows = await getOutcomesList(ctx.org.id);

  return (
    <div className="pb-10">
      <PageHeader
        title="Outcomes"
        description="Where grantees end up — the grant-world power-law lesson. Check in quarterly; stale rows are flagged."
      />
      <div className="px-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No portfolio companies yet"
            description="Companies appear here once a grant is issued to them."
          />
        ) : (
          <OutcomesTable
            rows={rows.map((r) => ({
              ...r,
              grantTotal: Number(r.grantTotal),
              outcomeUpdatedAt: r.outcomeUpdatedAt?.toISOString() ?? null,
              firstIssuedAt: r.firstIssuedAt,
            }))}
          />
        )}
      </div>
    </div>
  );
}
