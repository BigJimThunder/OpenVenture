import { ConstructionIcon } from "lucide-react";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";

export function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <div className="px-6">
        <EmptyState
          icon={<ConstructionIcon />}
          title={`${title} ships in ${phase}`}
          description="This module is on the roadmap — the schema is already in place. Track progress in the repo."
        />
      </div>
    </div>
  );
}
