import type { Metadata } from "next";
import * as React from "react";
import { format } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { getQuarterlyReport, currentFiscalQuarter } from "@/lib/queries/reports";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import { TIER_META } from "@/components/grants/tiers";
import { USE_OF_FUNDS_LABELS } from "@/components/grants/use-of-funds";
import { OUTCOME_TIERS, type OutcomeTier } from "@/db/schema";
import { PageHeader } from "@/components/patterns/page-header";
import { QuarterPicker } from "@/components/reports/quarter-picker";
import { PrintButton } from "@/components/reports/print-button";
import { CommentaryEditor } from "@/components/reports/commentary-editor";

export const metadata: Metadata = { title: "LP Reports" };
export const dynamic = "force-dynamic";

const tierLabel = (tier: string | null) =>
  tier ? (TIER_META[tier as OutcomeTier]?.label ?? tier) : "Not yet recorded";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const fyStart = ctx.org.fiscalYearStartMonth;
  const current = currentFiscalQuarter(fyStart);
  const fiscalYear = Number(params.fy ?? current.fiscalYear) || current.fiscalYear;
  const quarter = Math.min(4, Math.max(1, Number(params.q ?? current.quarter) || current.quarter)) as
    | 1
    | 2
    | 3
    | 4;

  const report = await getQuarterlyReport(ctx.org.id, fiscalYear, quarter, fyStart);
  const canEdit = can(ctx.member.role, "partnerWork");
  const lastDay = new Date(report.window.end.getTime() - 86_400_000);
  const portfolio = [...report.portfolioNow].sort(
    (a, b) =>
      OUTCOME_TIERS.indexOf(b.tier as OutcomeTier) - OUTCOME_TIERS.indexOf(a.tier as OutcomeTier)
  );

  return (
    <div className="pb-12 print:pb-0">
      {/* Page margins for the PDF. The shell is already hidden in print. */}
      <style>{`@media print { @page { margin: 20mm 22mm; } }`}</style>

      <div className="print:hidden">
        <PageHeader
          title="LP Reports"
          description="The quarterly letter to the people who fund the pool. The numbers come from the ledger; the commentary is the partners' own."
          actions={
            <>
              <QuarterPicker fiscalYear={fiscalYear} quarter={quarter} />
              <PrintButton />
            </>
          }
        />
        {report.inProgress && (
          <p className="mx-auto mb-3 max-w-[46rem] px-4 text-xs text-fg-subtle md:px-6">
            This quarter ends {format(lastDay, "MMMM d")}. Figures are to date and will keep moving
            until then.
          </p>
        )}
      </div>

      <div className="px-3 md:px-6 print:px-0">
        {/* The letter. On screen it is a sheet of paper; in print it is the page. */}
        <article className="mx-auto max-w-[46rem] rounded-lg border border-border bg-panel px-5 py-8 shadow-sm sm:px-10 sm:py-12 md:px-14 print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-black print:shadow-none">
          <div className="prose-surface max-w-none">
          <header className="border-b border-border-strong pb-5 font-sans text-sm">
            <div className="font-display text-xl leading-tight font-semibold tracking-tight sm:text-[1.75rem]">
              {ctx.org.name}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-fg-muted print:text-black">
              <span>Quarterly letter to our supporters</span>
              <span className="tnum">
                FY{fiscalYear} Q{quarter} · {format(report.window.start, "MMM d")} –{" "}
                {format(lastDay, "MMM d, yyyy")}
              </span>
            </div>
          </header>

          <div className="mt-7">
            <p>Dear members and supporters,</p>

            <div className="mt-4 [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0 [&_.tiptap]:min-h-28">
              <CommentaryEditor
                fiscalYear={fiscalYear}
                quarter={quarter}
                commentaryDoc={
                  report.commentaryDoc
                    ? { id: report.commentaryDoc.id, contentJson: report.commentaryDoc.contentJson }
                    : null
                }
                canEdit={canEdit}
              />
            </div>

            <LetterSection title="Deployment">
              {report.poolSummary ? (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 font-sans sm:grid-cols-4">
                  <Figure label="Pool" value={formatMoney(report.poolSummary.total)} />
                  <Figure label="Deployed to date" value={formatMoney(report.poolSummary.deployed)} />
                  <Figure label="This quarter" value={formatMoney(report.quarterDollars)} />
                  <Figure label="Remaining" value={formatMoney(report.poolSummary.remaining)} />
                </dl>
              ) : (
                <p className="text-fg-muted">No grant pool was configured for this fiscal year.</p>
              )}
            </LetterSection>

            <LetterSection title="Pipeline, quarter in review">
              <p>
                We received <strong className="tnum">{report.applicationsReceived}</strong>{" "}
                {report.applicationsReceived === 1 ? "application" : "applications"} this quarter,
                funded <strong className="tnum">{report.funded}</strong>, and declined{" "}
                <strong className="tnum">{report.declined}</strong> — every decline with a recorded
                reason and a reply to the founder.
              </p>
            </LetterSection>

            <LetterSection title="Grants issued">
              {report.grants.length > 0 ? (
                <table className="w-full font-sans text-sm">
                  <thead>
                    <tr className="border-b border-border-strong text-left text-2xs tracking-wide text-fg-muted uppercase print:text-black">
                      <th className="py-2 font-medium">Company</th>
                      <th className="py-2 font-medium max-sm:hidden">Use of funds</th>
                      <th className="py-2 text-right font-medium">Issued</th>
                      <th className="py-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.grants.map((g) => (
                      <tr key={g.id} className="border-b border-border">
                        <td className="py-2 font-medium">
                          {g.companyName}
                          <div className="text-xs font-normal text-fg-muted sm:hidden">
                            {USE_OF_FUNDS_LABELS[g.useOfFunds]}
                          </div>
                        </td>
                        <td className="py-2 text-fg-muted max-sm:hidden print:text-black">
                          {USE_OF_FUNDS_LABELS[g.useOfFunds]}
                        </td>
                        <td className="tnum py-2 text-right text-fg-muted print:text-black">
                          {g.issuedAt ? format(g.issuedAt, "MMM d") : "—"}
                        </td>
                        <td className="tnum py-2 text-right font-medium">{formatMoney(g.amountAwarded)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="py-2 font-medium" colSpan={2}>
                        Total this quarter
                      </td>
                      <td className="max-sm:hidden" />
                      <td className="tnum py-2 text-right font-semibold">
                        {formatMoney(report.quarterDollars)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p>No grants were paid out this quarter.</p>
              )}
            </LetterSection>

            <LetterSection title="Portfolio update">
              {report.tierMoves.length > 0 ? (
                <ul className="list-disc pl-5">
                  {report.tierMoves.map((t, i) => (
                    <li key={i} className="my-1">
                      <strong>{t.companyName}</strong> reached <em>{tierLabel(t.tier)}</em>
                      {t.note ? ` — ${t.note}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No company changed its position on the outcome ladder this quarter.</p>
              )}
              {portfolio.length > 0 && (
                <p className="mt-3">
                  Across everything we have funded, the portfolio stands at:{" "}
                  {portfolio.map((p, i) => (
                    <React.Fragment key={p.tier ?? "none"}>
                      {i > 0 && (i === portfolio.length - 1 ? " and " : ", ")}
                      <span className="tnum">{p.count}</span> {tierLabel(p.tier).toLowerCase()}
                    </React.Fragment>
                  ))}
                  . We take no equity; these are the founders&apos; outcomes, not ours.
                </p>
              )}
            </LetterSection>

            <footer className="mt-10 break-inside-avoid border-t border-border pt-5">
              <p>
                Thank you for making this pool possible. Every number above is drawn from the
                club&apos;s own records and can be traced to the decision behind it.
              </p>
              <p className="mt-4">— The partners, {ctx.org.name}</p>
            </footer>
          </div>
          </div>
        </article>
      </div>
    </div>
  );
}

function LetterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="mb-2.5 break-after-avoid text-[1.1875rem] leading-snug font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-medium tracking-wide text-fg-muted uppercase print:text-black">
        {label}
      </dt>
      <dd className="tnum mt-0.5 text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  );
}
