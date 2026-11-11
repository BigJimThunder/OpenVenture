import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { format } from "date-fns";
import { ChevronLeftIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getAnnualReportView } from "@/lib/queries/annual-report";
import { annualSummary, buildPublication, parseRecipients } from "@/lib/reports/annual";
import { NoAccess } from "@/components/patterns/no-access";
import { Badge } from "@/components/ui/badge";
import { Publication } from "@/components/reports/annual/publication";
import { ReaderActions } from "@/components/reports/annual/report-actions";

export const metadata: Metadata = { title: "Annual report" };
export const dynamic = "force-dynamic";

export default async function AnnualReportReaderPage({ params }: { params: Promise<{ fy: string }> }) {
  const ctx = await requireCtx();
  const fiscalYear = Number((await params).fy);
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) notFound();

  const view = await getAnnualReportView(ctx.org, fiscalYear);
  if (!view) redirect(`/reports/annual/${fiscalYear}`);
  const { report, content, derived } = view;
  const canContribute = can(ctx.member.role, "contribute");

  // A draft is the working copy of the people writing it.
  if (report.status === "draft" && !canContribute) {
    return (
      <NoAccess
        title="This report is still being written"
        description="You will be able to read it here once a partner finalizes it."
      />
    );
  }

  const pub = buildPublication(content, derived);
  const recipients = parseRecipients(orgSettings(ctx.org).reports.lpEmails);

  return (
    <div className="min-h-full bg-bg-subtle pb-16 print:min-h-0 print:bg-transparent print:pb-0">
      <div className="sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 md:px-6">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link
              href="/reports/annual"
              className="flex items-center gap-1 text-fg-muted hover:text-fg"
              aria-label="All annual reports"
            >
              <ChevronLeftIcon className="size-4" />
              <span className="max-sm:hidden">Annual reports</span>
            </Link>
            <span className="truncate font-semibold">{derived.label}</span>
            {report.status === "draft" ? (
              <Badge variant="warning">Draft</Badge>
            ) : report.status === "sent" ? (
              <Badge variant="success">Sent</Badge>
            ) : (
              <Badge variant="info">Final</Badge>
            )}
            <span className="truncate text-xs text-fg-subtle max-md:hidden">
              {report.status === "draft"
                ? "Numbers are live until a partner finalizes"
                : report.sentAt
                  ? `Sent ${format(report.sentAt, "MMM d, yyyy")} to ${report.sentTo?.length ?? 0}`
                  : report.finalizedAt
                    ? `Numbers frozen ${format(report.finalizedAt, "MMM d, yyyy")}`
                    : ""}
            </span>
          </div>
          <ReaderActions
            reportId={report.id}
            fiscalYear={fiscalYear}
            status={report.status}
            recipients={recipients}
            summary={annualSummary(content, derived)}
            canEditDraft={canContribute}
          />
        </div>
      </div>

      <div className="px-3 pt-5 md:px-6 md:pt-8 print:p-0">
        <Publication pub={pub} draft={report.status === "draft"} />
      </div>
    </div>
  );
}
