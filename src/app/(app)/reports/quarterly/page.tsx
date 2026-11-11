import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { aiConfigured } from "@/lib/ai";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { currentFiscalQuarter, getQuarterlyLetter } from "@/lib/queries/reports";
import { longDate } from "@/lib/reports/quarterly";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/patterns/page-header";
import { PrintButton } from "@/components/reports/print-button";
import { QuarterPicker } from "@/components/reports/quarter-picker";
import { QuarterlyLetterSheet } from "@/components/reports/quarterly/quarterly-letter";

export const metadata: Metadata = { title: "Quarterly letter" };
export const dynamic = "force-dynamic";

export default async function QuarterlyLetterPage({ searchParams }: PageProps<"/reports/quarterly">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const current = currentFiscalQuarter(ctx.org.fiscalYearStartMonth);
  const fy = Number(params.fy);
  const q = Number(params.q);
  const fiscalYear = Number.isInteger(fy) && fy >= 2000 && fy <= 2100 ? fy : current.fiscalYear;
  const quarter = (Number.isInteger(q) && q >= 1 && q <= 4 ? q : current.quarter) as 1 | 2 | 3 | 4;

  const view = await getQuarterlyLetter(ctx.org, fiscalYear, quarter);
  const settings = orgSettings(ctx.org);
  const canEdit = can(ctx.member.role, "partnerWork");
  const { status, report } = view;

  const description =
    status === "sent" && report?.sentAt
      ? `Sent to ${report.sentTo?.length ?? 0} ${report.sentTo?.length === 1 ? "person" : "people"} on ${format(report.sentAt, "MMM d, yyyy")}. The figures are frozen as of ${format(report.finalizedAt ?? report.sentAt, "MMM d")}.`
      : status === "final" && report?.finalizedAt
        ? `Finalized ${format(report.finalizedAt, "MMM d, yyyy")}. The figures are frozen; it has not been sent yet.`
        : canEdit
          ? "The figures write themselves from the ledger. You write the opening and what comes next, then finalize to freeze the numbers."
          : "A draft. The figures are live; the partners write the opening and finalize it.";

  return (
    <div className="print:pb-0">
      {/* Page margins for the PDF; a toast still on screen must not print over the page. */}
      <style>{`@media print { @page { margin: 20mm 22mm; } [data-sonner-toaster] { display: none !important; } }`}</style>
      <div className="print:hidden">
        <PageHeader
          eyebrow={
            <>
              <Link href="/reports" className="hover:text-fg hover:underline">
                Reports
              </Link>{" "}
              / Quarterly letters
            </>
          }
          title={
            <span className="flex flex-wrap items-center gap-2">
              FY{fiscalYear} Q{quarter} letter
              <Badge variant={status === "sent" ? "success" : status === "final" ? "info" : "neutral"}>
                {status === "sent" ? "Sent" : status === "final" ? "Final" : "Draft"}
              </Badge>
            </span>
          }
          description={description}
          actions={
            <>
              <QuarterPicker fiscalYear={fiscalYear} quarter={quarter} />
              <PrintButton />
            </>
          }
        />
      </div>
      <QuarterlyLetterSheet
        // A different quarter is a different letter: start its editor state fresh.
        key={`${fiscalYear}-${quarter}-${status}`}
        clubName={ctx.org.name}
        fiscalYear={fiscalYear}
        quarter={quarter}
        status={status}
        letter={view.letter}
        initialContent={view.content}
        canEdit={canEdit}
        ai={!aiConfigured() ? "no_key" : settings.ai.enabled ? "on" : "club_off"}
        dateline={longDate((report?.finalizedAt ?? new Date()).toISOString(), true)}
        lpEmails={settings.reports.lpEmails}
      />
    </div>
  );
}
