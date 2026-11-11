import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { ArrowRightIcon, BookOpenIcon, FileTextIcon, MailIcon } from "lucide-react";
import type { ReportStatus } from "@/db/schema";
import { requireCtx } from "@/lib/actions/context";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { getReportsHub, quarterWindow, type HubFundingRow } from "@/lib/queries/reports";
import { periodLabel } from "@/lib/reports/quarterly";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/patterns/data-panel";
import { EmptyState } from "@/components/patterns/empty-state";
import { Money } from "@/components/patterns/money";
import { PageHeader } from "@/components/patterns/page-header";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const STATUS_ORDER: Record<HubFundingRow["status"], number> = { needed: 0, draft: 1, final: 2, sent: 3 };

function StatusBadge({ status }: { status: ReportStatus | "needed" | "none" }) {
  if (status === "needed") return <Badge variant="warning">Needed</Badge>;
  if (status === "none") return <Badge variant="outline">Not started</Badge>;
  if (status === "draft") return <Badge variant="neutral">Draft</Badge>;
  if (status === "final") return <Badge variant="info">Final</Badge>;
  return <Badge variant="success">Sent</Badge>;
}

export default async function ReportsHubPage({ searchParams }: PageProps<"/reports">) {
  const ctx = await requireCtx();
  const params = await searchParams;
  // The quarterly letter used to live here; old links carry ?fy=&q=.
  if (typeof params.fy === "string" || typeof params.q === "string") {
    const qs = new URLSearchParams();
    if (typeof params.fy === "string") qs.set("fy", params.fy);
    if (typeof params.q === "string") qs.set("q", params.q);
    redirect(`/reports/quarterly?${qs.toString()}` as Route);
  }

  const hub = await getReportsHub(ctx.org);
  const settings = orgSettings(ctx.org);
  const canContribute = can(ctx.member.role, "contribute");
  const canPartner = can(ctx.member.role, "partnerWork");
  const fyStart = ctx.org.fiscalYearStartMonth;

  const funding = [...hub.fundingRows].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  const needed = funding.filter((r) => r.status === "needed").length;
  const approver = settings.reports.approverName.trim();

  // The current quarter and the three before it, whether or not anyone has written them.
  const quarters = Array.from({ length: 4 }, (_, i) => {
    const index = hub.current.fiscalYear * 4 + (hub.current.quarter - 1) - i;
    const fiscalYear = Math.floor(index / 4);
    const quarter = ((index % 4) + 1) as 1 | 2 | 3 | 4;
    const { start, end } = quarterWindow(fiscalYear, quarter, fyStart);
    const letter =
      [hub.currentLetter, ...hub.pastLetters].find((l) => l?.fiscalYear === fiscalYear && l.quarter === quarter) ??
      null;
    return {
      fiscalYear,
      quarter,
      letter,
      period: periodLabel({ start: start.toISOString(), end: end.toISOString() }),
      href: `/reports/quarterly?fy=${fiscalYear}&q=${quarter}` as Route,
    };
  });
  const [thisQuarter, ...earlier] = quarters;
  const older = hub.pastLetters.filter(
    (l) => !quarters.some((q) => q.fiscalYear === l.fiscalYear && q.quarter === l.quarter)
  );
  const annual = hub.annual[0] ?? null;

  return (
    <div className="pb-16">
      <PageHeader
        title="Reports"
        description="What the club sends up: a funding request for each company it funds, a letter each quarter, and a report each year. The numbers come from the record; you write the judgment."
      />

      <div className="grid items-start gap-4 px-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel
          title="Funding requests"
          note={
            funding.length === 0
              ? undefined
              : needed > 0
                ? `${needed} to write`
                : "All written"
          }
        >
          {funding.length === 0 ? (
            <EmptyState
              className="m-3 border-0 bg-transparent py-10"
              icon={<FileTextIcon />}
              title="No funding requests yet"
              description="A funding request is the one-page memo that goes to whoever signs off on a grant. One appears here for every company the club votes to fund."
              steps={[
                "Record a Fund decision on a vote, or propose a grant.",
                "Open the request. The company, the ask, the award and the vote are filled in; the memo's sections carry over.",
                "Write why the club is funding it, then a partner finalizes it and sends it for sign-off.",
              ]}
              action={
                <Button asChild size="sm" className="max-md:h-10">
                  <Link href="/pipeline">Go to the pipeline</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {funding.map((row) => {
                const href = `/reports/funding/${row.applicationId}` as Route;
                const actionable = row.status !== "needed" || canContribute;
                const detail =
                  row.status === "sent" && row.sentAt
                    ? `Sent to ${approver || row.sentTo?.[0] || "the approver"} on ${format(row.sentAt, "MMM d")}`
                    : row.status === "final"
                      ? "Final, not sent yet"
                      : row.status === "draft" && row.updatedAt
                        ? `Draft, last edited ${format(row.updatedAt, "MMM d")}`
                        : row.decidedAt
                          ? `Funded ${format(row.decidedAt, "MMM d")}; no request written`
                          : "Funded; no request written";
                const body = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm font-medium">{row.companyName}</span>
                        <StatusBadge status={row.status} />
                      </div>
                      <div className="tnum mt-0.5 truncate text-xs text-fg-muted">{detail}</div>
                    </div>
                    <Money value={row.amount} className="shrink-0 text-sm font-medium" />
                    {actionable && (
                      <span className="hidden shrink-0 items-center gap-1 text-sm text-fg-muted group-hover:text-fg sm:inline-flex">
                        {row.status === "needed" ? "Write" : row.status === "draft" && canContribute ? "Continue" : "Open"}
                        <ArrowRightIcon className="size-3.5" />
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={row.applicationId}>
                    {actionable ? (
                      <Link
                        href={href}
                        className="group flex min-h-14 items-center gap-3 px-3.5 py-2.5 outline-none hover:bg-bg-subtle/60 focus-visible:bg-bg-subtle"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="Quarterly letters">
            <Link
              href={thisQuarter.href}
              className="group flex flex-col gap-2 border-b border-border px-3.5 py-3.5 outline-none hover:bg-bg-subtle/60 focus-visible:bg-bg-subtle"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-2xs font-medium tracking-[0.06em] text-accent uppercase">This quarter</span>
                <StatusBadge status={thisQuarter.letter?.status ?? "none"} />
              </div>
              <div>
                <div className="tnum text-base font-semibold">
                  FY{thisQuarter.fiscalYear} Q{thisQuarter.quarter}
                </div>
                <div className="tnum text-xs text-fg-muted">{thisQuarter.period}</div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-fg">
                <MailIcon className="size-4 text-fg-muted" />
                {thisQuarter.letter
                  ? "Open the letter"
                  : canPartner
                    ? "Write this quarter's letter"
                    : "See the figures so far"}
                <ArrowRightIcon className="size-3.5 text-fg-muted group-hover:text-fg" />
              </span>
            </Link>
            <ul className="divide-y divide-border">
              {[...earlier, ...older.map((l) => ({ ...l, letter: l, period: null, href: `/reports/quarterly?fy=${l.fiscalYear}&q=${l.quarter}` as Route }))].map(
                (q) => (
                  <li key={`${q.fiscalYear}-${q.quarter}`}>
                    <Link
                      href={q.href}
                      className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2 text-sm outline-none hover:bg-bg-subtle/60 focus-visible:bg-bg-subtle"
                    >
                      <span className="tnum min-w-0 truncate">
                        <span className="font-medium">
                          FY{q.fiscalYear} Q{q.quarter}
                        </span>
                        {q.letter?.status === "sent" && q.letter.sentAt && (
                          <span className="text-fg-subtle"> · sent {format(q.letter.sentAt, "MMM d")}</span>
                        )}
                      </span>
                      <StatusBadge status={q.letter?.status ?? "none"} />
                    </Link>
                  </li>
                )
              )}
            </ul>
          </Panel>

          <Panel title="Annual report">
            <Link
              href={"/reports/annual" as Route}
              className="group flex items-start gap-3 px-3.5 py-3.5 outline-none hover:bg-bg-subtle/60 focus-visible:bg-bg-subtle"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-bg-subtle text-fg-muted">
                <BookOpenIcon className="size-4.5" strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                  {annual ? annual.title : "The year in one document"}
                  {annual && <StatusBadge status={annual.status} />}
                </span>
                <span className="mt-0.5 block text-xs text-fg-muted">
                  The year&apos;s grants, the companies behind them and where the money went, laid out to print
                  and send to supporters.
                </span>
              </span>
              <ArrowRightIcon className="mt-1 size-3.5 shrink-0 text-fg-muted group-hover:text-fg" />
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
