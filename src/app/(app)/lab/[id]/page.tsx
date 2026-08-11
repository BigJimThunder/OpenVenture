import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/actions/context";
import { getCapTableDetail } from "@/lib/queries/captable";
import { foldCapTable } from "@/lib/captable/engine";
import type { CapTableState } from "@/lib/captable/types";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { LabWorkbench } from "@/components/lab/workbench";
import { TableActions } from "@/components/lab/table-actions";

export const dynamic = "force-dynamic";

export default async function CapTablePage({ params }: PageProps<"/lab/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getCapTableDetail(ctx.org.id, id);
  if (!detail) notFound();

  let state: CapTableState | null = null;
  let foldError: string | null = null;
  try {
    state = foldCapTable(detail.events);
  } catch (e) {
    foldError = e instanceof Error ? e.message : "The ledger failed to compute";
  }

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {detail.table.name}
            {detail.table.isScenario && <Badge variant="info">scenario</Badge>}
            {detail.companyName && <Badge variant="neutral">{detail.companyName}</Badge>}
          </span>
        }
        description="Immutable event ledger — every derived number expands to show its work. Not legal or financial advice."
        actions={
          <TableActions capTableId={detail.table.id} tableName={detail.table.name} />
        }
      />
      <div className="px-6">
        <LabWorkbench
          capTableId={detail.table.id}
          events={detail.events}
          state={state}
          foldError={foldError}
        />
      </div>
    </div>
  );
}
