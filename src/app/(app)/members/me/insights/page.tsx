import type { Metadata } from "next";
import { EyeOffIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import {
  getRevealedOutcomeBallots,
  getMemberSectorAffinity,
} from "@/lib/queries/insights";
import { yesRate, calibration, contrarianRecord } from "@/lib/insights/calibration";
import { formatPct } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { StageBadge } from "@/components/patterns/stage-badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My investor profile" };
export const dynamic = "force-dynamic";

export default async function SelfInsightsPage() {
  const ctx = await requireCtx();
  const [ballots, affinity] = await Promise.all([
    getRevealedOutcomeBallots(ctx.org.id),
    getMemberSectorAffinity(ctx.org.id, ctx.member.id),
  ]);

  const yr = yesRate(ballots, ctx.member.id);
  const cal = calibration(ballots, ctx.member.id);
  const contrarian = contrarianRecord(ballots, ctx.member.id);

  return (
    <div className="pb-10">
      <PageHeader
        title="My investor profile"
        description={
          <span className="flex items-center gap-1.5">
            <EyeOffIcon className="size-3.5" />
            Private to you. Built only from revealed votes and recorded outcomes — the mirror
            no commercial VC tool gives you.
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 pb-4 lg:grid-cols-4">
        <StatCard
          label="Your yes-rate"
          value={yr.mine != null ? formatPct(yr.mine, 0) : "—"}
          hint={
            yr.club != null
              ? `club average ${formatPct(yr.club, 0)} · ${yr.myVotes} votes`
              : "no revealed votes yet"
          }
        />
        <StatCard
          label="Conviction on winners"
          value={cal.onWinners != null ? cal.onWinners.toFixed(1) : "—"}
          hint={`${cal.winnersCount} companies with meaningful outcomes`}
        />
        <StatCard
          label="Conviction on dormant"
          value={cal.onDormant != null ? cal.onDormant.toFixed(1) : "—"}
          hint={`${cal.dormantCount} that went quiet`}
        />
        <StatCard
          label="Calibration spread"
          value={
            cal.spread != null ? (cal.spread >= 0 ? `+${cal.spread.toFixed(1)}` : cal.spread.toFixed(1)) : "—"
          }
          hint={
            cal.spread == null
              ? "needs outcomes on both sides"
              : cal.spread > 0
                ? "your enthusiasm tracks reality"
                : "your favorites underperform — worth sitting with"
          }
        />
      </div>

      <div className="grid gap-3 px-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contrarian record</CardTitle>
            <CardDescription>
              Rounds where you voted against the room — and what happened next.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {contrarian.length === 0 ? (
              <p className="text-xs text-fg-muted">
                You&apos;ve voted with the majority in every revealed round so far. Neither good
                nor bad — but blind voting exists so you don&apos;t have to.
              </p>
            ) : (
              contrarian.map((c) => (
                <div
                  key={c.roundId}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    You voted <strong className="capitalize">{c.myVote}</strong> against the majority
                  </span>
                  <Badge
                    variant={c.vindicated == null ? "neutral" : c.vindicated ? "success" : "danger"}
                  >
                    {c.vindicated == null ? "outcome pending" : c.vindicated ? "you were right" : "the room was right"}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sector affinity</CardTitle>
            <CardDescription>Where your sourcing actually concentrates.</CardDescription>
          </CardHeader>
          <CardContent>
            {affinity.length === 0 ? (
              <p className="text-xs text-fg-muted">
                No sourced applications yet — bring the club a company and this fills in.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {affinity.map((a) => (
                  <StageBadge
                    key={a.sectorName}
                    name={`${a.sectorName} · ${a.sourced}`}
                    colorToken={a.colorToken}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
