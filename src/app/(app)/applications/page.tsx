import type { Metadata } from "next";
import { requireCtx } from "@/lib/actions/context";
import { getPipeline } from "@/lib/queries/applications";
import { PageHeader } from "@/components/patterns/page-header";
import { Board } from "@/components/applications/board";
import { NewApplicationDialog } from "@/components/applications/new-application-dialog";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const ctx = await requireCtx();
  const data = await getPipeline(ctx.org.id);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Applications"
        description="Drag cards between stages. Declines require a reason."
        actions={<NewApplicationDialog />}
      />
      <div className="min-h-0 flex-1">
        <Board data={data} />
      </div>
    </div>
  );
}
