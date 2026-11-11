import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUpIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getOutcomesList } from "@/lib/queries/grants";
import { getPortfolioConstruction } from "@/lib/queries/insights";
import { formatPct } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Panel } from "@/components/patterns/data-panel";
import { Button } from "@/components/ui/button";
import { OutcomesTable } from "@/components/grants/outcomes-table";
import { TierLadder } from "@/components/grants/tier-ladder";

export const metadata: Metadata = { title: "Outcomes" };
export const dynamic = "force-dynamic";

export default async function OutcomesPage() {
  const ctx = await requireCtx();
  const [rows, portfolio] = await Promise.all([
    getOutcomesList(ctx.org.id),
    getPortfolioConstruction(ctx.org.id),
  ]);
  const unrecorded = rows.filter((r) => r.outcomeTier == null).length;

  return (
    <div className="pb-10">
      <PageHeader
        title="Outcomes"
        description="What became of the companies we funded. We take no equity, so success is how far each one climbed — not what it is worth."
      />
      <div className="flex flex-col gap-3 px-4 md:px-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={<TrendingUpIcon />}
            title="No one to follow up with yet"
            description="A company joins the portfolio when its first grant is paid. From then on, this is where the club keeps track of what happened next."
            steps={[
              "Pay out a grant from the Grants ledger.",
              "Once a quarter, ask the founder how it is going and record where they are on the ladder.",
              "Over a few years the ladder shows the real shape of early-stage outcomes.",
            ]}
            action={
              <Button asChild variant="secondary">
                <Link href="/grants">Open the grants ledger</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
              <Panel
                title="The outcome ladder"
                note={`${portfolio.totalCompanies} ${portfolio.totalCompanies === 1 ? "company" : "companies"} · count and dollars granted`}
              >
                <TierLadder distribution={portfolio.distribution} className="py-1.5" />
              </Panel>
              <Panel title="How to read this">
                <div className="flex flex-col gap-3 p-3.5 text-sm text-fg-muted">
                  <p>
                    <span className="tnum text-xl font-semibold tracking-tight text-fg">
                      {portfolio.hitRate != null ? formatPct(portfolio.hitRate, 0) : "—"}
                    </span>{" "}
                    of funded companies reached revenue or better.
                  </p>
                  <p>
                    Most grants go nowhere, and that is the job. A few hundred dollars for a filing
                    fee is a cheap way to find out whether a student will build the thing. The
                    bottom rungs being full is what an honest early-stage portfolio looks like.
                  </p>
                  <p>
                    What to watch is the top: whether the few that climb are ones we backed with
                    conviction, and whether we are still checking in on the rest.
                  </p>
                  {unrecorded > 0 && (
                    <p className="text-warning">
                      {unrecorded} {unrecorded === 1 ? "company has" : "companies have"} no outcome
                      recorded yet, so the ladder is undercounting.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
            <OutcomesTable
              rows={rows.map((r) => ({
                ...r,
                grantTotal: Number(r.grantTotal),
                outcomeUpdatedAt: r.outcomeUpdatedAt?.toISOString() ?? null,
              }))}
            />
          </>
        )}
      </div>
    </div>
  );
}
