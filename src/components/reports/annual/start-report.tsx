"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenIcon } from "lucide-react";
import { toast } from "sonner";
import { startAnnualReport } from "@/lib/actions/annual-report";
import { EmptyState } from "@/components/patterns/empty-state";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";

/** Nothing has been started for this fiscal year: say what the builder will do, and start it. */
export function StartAnnualReport({
  fiscalYear,
  label,
  inProgress,
  notStarted,
}: {
  fiscalYear: number;
  label: string;
  inProgress: boolean;
  notStarted: boolean;
}) {
  const router = useRouter();
  const partner = useCan("partnerWork");
  const contributor = useCan("contribute");
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    const res = await startAnnualReport({ fiscalYear });
    if (!res.ok) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex h-full items-center justify-center p-4 md:p-8">
      <EmptyState
        className="w-full max-w-xl"
        icon={<BookOpenIcon />}
        title={`Annual report ${label}`}
        description={
          notStarted
            ? "This fiscal year has not started, so there is nothing to report on yet."
            : inProgress
              ? "This fiscal year is still running. You can start now and keep it up to date; the numbers follow the records until you finalize."
              : "The report your donors read. We assemble the first draft from the year's records, and you add the voice."
        }
        steps={[
          "The numbers, the team page and a spread for every company you funded are filled in from the app.",
          "Each company gets an essay by one of you. It starts from the memo and the coffee-chat notes; the author rewrites it.",
          "A checklist names what still needs a person. When it is empty, a partner finalizes and sends.",
        ]}
        action={
          notStarted ? undefined : partner ? (
            <Button onClick={start} disabled={busy}>
              {busy ? "Assembling the draft…" : "Start the report"}
            </Button>
          ) : (
            <p className="text-sm text-fg-muted">
              {contributor
                ? "A partner starts the report. Once it exists you can write your essays here."
                : "A partner starts the report. You will be able to read it here once it is finalized."}
            </p>
          )
        }
        secondaryAction={
          <Button variant="ghost" asChild>
            <Link href="/reports/annual">Other years</Link>
          </Button>
        }
      />
    </div>
  );
}
