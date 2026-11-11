import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { ChevronRightIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { can } from "@/lib/permissions";
import { listReports } from "@/lib/reports/store";
import {
  annualProgress,
  currentFiscalYear,
  fiscalYearLabel,
  fiscalYearWindow,
  parseAnnualContent,
} from "@/lib/reports/annual";
import { getAnnualDerived } from "@/lib/queries/annual-report";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Annual reports" };
export const dynamic = "force-dynamic";

export default async function AnnualReportsPage() {
  const ctx = await requireCtx();
  const startMonth = ctx.org.fiscalYearStartMonth;
  const current = currentFiscalYear(startMonth);
  const canContribute = can(ctx.member.role, "contribute");
  const reports = (await listReports(ctx.org.id, "annual")).map((r) => ({
    row: r,
    fiscalYear: Number(r.periodKey.replace(/^FY/, "")),
  }));

  // The year in progress and the one just ended are always offered; older ones only if they exist.
  const years = [...new Set([current, current - 1, ...reports.map((r) => r.fiscalYear)])]
    .filter((y) => Number.isInteger(y))
    .sort((a, b) => b - a);

  const rows = await Promise.all(
    years.map(async (fiscalYear) => {
      const report = reports.find((r) => r.fiscalYear === fiscalYear)?.row ?? null;
      const window = fiscalYearWindow(fiscalYear, startMonth);
      const progress =
        report?.status === "draft"
          ? annualProgress(parseAnnualContent(report.content), await getAnnualDerived(ctx.org, fiscalYear))
          : null;
      return { fiscalYear, report, window, progress };
    })
  );

  return (
    <div className="pb-12">
      <PageHeader
        eyebrow={
          <Link href="/reports" className="hover:text-fg">
            Reports
          </Link>
        }
        title="Annual reports"
        description="One publication a year for the people who fund the pool: the team, what you believe, an essay on every company you backed, and what you would do differently. The app assembles the first draft; members add the voice."
      />
      <div className="px-4 md:px-6">
        <ul className="flex max-w-3xl flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-panel shadow-xs">
          {rows.map(({ fiscalYear, report, window, progress }) => {
            const lastDay = new Date(window.end.getTime() - 86_400_000);
            const running = window.end.getTime() > Date.now();
            const readable = report && (report.status !== "draft" || canContribute);
            const href =
              report && report.status !== "draft"
                ? `/reports/annual/${fiscalYear}/view`
                : `/reports/annual/${fiscalYear}`;
            const body = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold">{fiscalYearLabel(fiscalYear, startMonth)}</span>
                    {report?.status === "draft" && <Badge variant="warning">Draft</Badge>}
                    {report?.status === "final" && <Badge variant="info">Final</Badge>}
                    {report?.status === "sent" && <Badge variant="success">Sent</Badge>}
                    {!report && <Badge variant="outline">Not started</Badge>}
                  </span>
                  <span className="tnum mt-0.5 block text-xs text-fg-muted">
                    {format(window.start, "MMM d, yyyy")} – {format(lastDay, "MMM d, yyyy")}
                    {running ? " · year in progress" : ""}
                    {progress
                      ? ` · ${progress.ready} of ${progress.total} sections ready${progress.summary ? ` · needs ${progress.summary}` : ""}`
                      : ""}
                    {report?.sentAt ? ` · sent ${format(report.sentAt, "MMM d, yyyy")}` : ""}
                  </span>
                </span>
                {(report ? readable : canContribute) && <ChevronRightIcon className="size-4 shrink-0 text-fg-subtle" />}
              </>
            );
            return (
              <li key={fiscalYear}>
                {(report ? readable : canContribute) ? (
                  <Link
                    href={href}
                    className="flex items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-bg-subtle focus-visible:bg-bg-subtle"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3.5 text-fg-muted">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 max-w-3xl text-xs text-fg-muted">
          A fiscal year here starts on the first of {format(new Date(Date.UTC(2000, startMonth - 1, 1)), "MMMM")}.
          Admins change that in Settings.
        </p>
      </div>
    </div>
  );
}
