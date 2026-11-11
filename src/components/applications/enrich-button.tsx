"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { enrichCompany } from "@/lib/actions/enrichment";
import { Button } from "@/components/ui/button";

const FIELD_LABELS: Record<string, string> = {
  oneLiner: "one-liner",
  description: "description",
  logoUrl: "logo",
  sector: "sector",
};

export function EnrichButton({
  companyId,
  applicationId,
}: {
  companyId: string;
  applicationId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const res = await enrichCompany({ companyId, applicationId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const { filled, skippedLocked } = res.data;
    if (filled.length === 0) {
      toast.info(
        skippedLocked.length > 0
          ? "Nothing to fill — remaining fields are locked."
          : "Nothing new found — the empty fields stayed empty."
      );
    } else {
      toast.success(`Filled ${filled.map((f) => FIELD_LABELS[f] ?? f).join(", ")} from the website.`);
    }
    router.refresh();
  }

  return (
    <Button size="sm" variant="secondary" onClick={run} disabled={busy} className="max-md:h-10">
      <SparklesIcon />
      {busy ? "Reading site…" : "Enrich from website"}
    </Button>
  );
}
