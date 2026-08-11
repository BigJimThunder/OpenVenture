import type { Metadata } from "next";
import { format } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import {
  getQuarterlyReport,
  currentFiscalQuarter,
} from "@/lib/queries/reports";
import { roleAtLeast } from "@/lib/actions/context";
import { formatMoney } from "@/lib/utils";
import { TIER_META } from "@/components/grants/outcomes-table";
import type { OutcomeTier } from "@/db/schema";
import { PageHeader } from "@/components/patterns/page-header";
import { QuarterPicker } from "@/components/reports/quarter-picker";
import { PrintButton } from "@/components/reports/print-button";
import { CommentaryEditor } from "@/components/reports/commentary-editor";

export const metadata: Metadata = { title: "LP Reports" };
export const dynamic = "force-dynamic";

const USE_LABELS: Record<string, string> = {
  incorporation: "Incorporation", legal: "Legal", api_credits: "API credits",
  hosting: "Hosting", hardware: "Hardware", design: "Design",
  marketing: "Marketing", travel: "Travel", prototyping: "Prototyping", other: "Other",
};

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  const fyStart = ctx.org.fiscalYearStartMonth;
  const current = currentFiscalQuarter(fyStart);
  const fiscalYear = Number(params.fy ?? current.fiscalYear);
  const quarter = Math.min(4, Math.max(1, Number(params.q ?? current.quarter))) as 1 | 2 | 3 | 4;

  const report = await getQuarterlyReport(ctx.org.id, fiscalYear, quarter, fyStart);
  const canEdit = roleAtLeast(ctx.member.role, "partner");

  return (
    <div className="pb-10">
      <div className="print:hidden">
        <PageHeader
          title="LP Reports"
          description="What a GP owes the people who fund the pool — generated from real data, signed with real words."
          actions={
            <div className="flex items-center gap-2">
              <QuarterPicker fiscalYear={fiscalYear} quarter={quarter} />
              <PrintButton />
            </div>
          }
        />
      </div>

      {/* The letter — print styles turn this into a clean document. */}
      <article className="mx-auto max-w-2xl px-6 print:max-w-none print:px-0">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-xl font-semibold tracking-tight">{ctx.org.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Quarterly letter · FY{fiscalYear} Q{quarter} ·{" "}
            {format(report.window.start, "MMM d, yyyy")} – {format(new Date(report.window.end.getTime() - 86400000), "MMM d, yyyy")}
          </p>
        </header>

        <p className="prose-surface mb-4 text-sm">Dear members and supporters,</p>

        <CommentaryEditor
          fiscalYear={fiscalYear}
          quarter={quarter}
          commentaryDoc={
            report.commentaryDoc
              ? {
                  id: report.commentaryDoc.id,
                  contentJson: report.commentaryDoc.contentJson,
                }
              : null
          }
          canEdit={canEdit}
        />

        <section className="mt-8">
          <h2 className="mb-2 text-md font-semibold">Deployment</h2>
          {report.poolSummary ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Pool" value={formatMoney(report.poolSummary.total)} />
              <Stat label="Deployed to date" value={formatMoney(report.poolSummary.deployed)} />
              <Stat label="This quarter" value={formatMoney(report.quarterDollars)} />
              <Stat label="Remaining" value={formatMoney(report.poolSummary.remaining)} />
            </div>
          ) : (
            <p className="text-sm text-fg-muted">No pool configured.</p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-md font-semibold">Pipeline, quarter in review</h2>
          <p className="prose-surface text-sm">
            We received <strong className="tnum">{report.applicationsReceived}</strong> applications
            this quarter, funded <strong className="tnum">{report.funded}</strong>, and declined{" "}
            <strong className="tnum">{report.declined}</strong> — every decline with a recorded
            reason and a reply to the founder.
          </p>
        </section>

        {report.grants.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-md font-semibold">Grants issued</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-fg-subtle">
                  <th className="py-1.5">Company</th>
                  <th className="py-1.5">Use of funds</th>
                  <th className="py-1.5 text-right">Amount</th>
                  <th className="py-1.5 text-right">Issued</th>
                </tr>
              </thead>
              <tbody>
                {report.grants.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 font-medium">{g.companyName}</td>
                    <td className="py-1.5 text-fg-muted">{USE_LABELS[g.useOfFunds]}</td>
                    <td className="tnum py-1.5 text-right">{formatMoney(g.amountAwarded)}</td>
                    <td className="tnum py-1.5 text-right text-fg-muted">
                      {g.issuedAt ? format(g.issuedAt, "MMM d") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-2 text-md font-semibold">Portfolio update</h2>
          {report.tierMoves.length > 0 ? (
            <ul className="prose-surface list-disc pl-5 text-sm">
              {report.tierMoves.map((t, i) => (
                <li key={i} className="my-1">
                  <strong>{t.companyName}</strong> reached{" "}
                  <em>{TIER_META[t.tier as OutcomeTier]?.label ?? t.tier}</em>
                  {t.note ? ` — ${t.note}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">No outcome-tier changes recorded this quarter.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.portfolioNow
              .filter((p) => p.tier)
              .map((p) => (
                <span
                  key={p.tier}
                  className="tnum rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-xs"
                >
                  {TIER_META[p.tier as OutcomeTier]?.label ?? p.tier} · {p.count}
                </span>
              ))}
          </div>
        </section>

        <footer className="mt-10 border-t border-border pt-4 text-sm text-fg-muted">
          <p>
            Thank you for making this pool possible. Every number above is drawn live from our
            operating system and auditable to the underlying decision.
          </p>
          <p className="mt-3">— The partners, {ctx.org.name}</p>
        </footer>
      </article>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel p-3 print:border-0 print:p-0">
      <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className="tnum mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}
