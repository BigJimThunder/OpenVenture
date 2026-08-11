"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { toast } from "sonner";
import { recordVoteOutcome } from "@/lib/actions/votes";
import type { VoteDecision, VoteOutcome } from "@/db/schema";
import { formatMoney, cn } from "@/lib/utils";
import { ChartFrame, ChartTooltip, axisProps, gridProps } from "@/components/patterns/chart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type Ballot = {
  memberName: string;
  decision: VoteDecision | null;
  conviction: number | null;
  rationale: string | null;
  suggestedAmount: string | null;
};

export function RevealPanel({
  ballots,
  missing,
  scaleMax,
  outcome,
  outcomeNote,
  roundId,
  canRecord,
  applicationId,
}: {
  ballots: Ballot[];
  missing: string[];
  scaleMax: number;
  outcome: VoteOutcome | null;
  outcomeNote: string | null;
  roundId: string;
  canRecord: boolean;
  applicationId: string;
}) {
  const fund = ballots.filter((b) => b.decision === "fund").length;
  const decline = ballots.filter((b) => b.decision === "decline").length;
  const abstain = ballots.filter((b) => b.decision === "abstain").length;
  const avgConviction =
    ballots.filter((b) => b.conviction != null).reduce((n, b) => n + (b.conviction ?? 0), 0) /
    Math.max(1, ballots.filter((b) => b.conviction != null).length);
  const suggested = ballots
    .map((b) => (b.suggestedAmount ? Number(b.suggestedAmount) : null))
    .filter((n): n is number => n != null);

  const histogram = Array.from({ length: scaleMax }, (_, i) => ({
    conviction: String(i + 1),
    Fund: ballots.filter((b) => b.conviction === i + 1 && b.decision === "fund").length,
    Decline: ballots.filter((b) => b.conviction === i + 1 && b.decision === "decline").length,
  }));

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardContent className="grid grid-cols-3 gap-3 p-4 text-center">
          <div>
            <div className="tnum text-xl font-semibold text-success">{fund}</div>
            <div className="text-2xs uppercase tracking-wide text-fg-subtle">Fund</div>
          </div>
          <div>
            <div className="tnum text-xl font-semibold text-danger">{decline}</div>
            <div className="text-2xs uppercase tracking-wide text-fg-subtle">Decline</div>
          </div>
          <div>
            <div className="tnum text-xl font-semibold">{avgConviction.toFixed(1)}</div>
            <div className="text-2xs uppercase tracking-wide text-fg-subtle">
              Avg conviction{abstain > 0 ? ` · ${abstain} abstain` : ""}
            </div>
          </div>
        </CardContent>
      </Card>

      <ChartFrame
        title="Conviction distribution"
        height={180}
        empty={ballots.length === 0 && "No ballots"}
      >
        <BarChart data={histogram} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="conviction" {...axisProps} />
          <YAxis {...axisProps} allowDecimals={false} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--bg-subtle)" }} />
          <Bar dataKey="Fund" stackId="a" fill="var(--cat-4)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="Decline" stackId="a" fill="var(--cat-7)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartFrame>

      {suggested.length > 0 && (
        <p className="px-1 text-xs text-fg-muted">
          Suggested checks: {suggested.map((n) => formatMoney(n)).join(" · ")}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ballots — lowest conviction first</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {ballots.map((b, i) => (
            <div key={i} className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{b.memberName}</span>
                <span className="flex items-center gap-2">
                  {b.conviction != null && (
                    <span className="tnum text-xs text-fg-muted">{b.conviction}/5</span>
                  )}
                  <Badge
                    variant={
                      b.decision === "fund"
                        ? "success"
                        : b.decision === "decline"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {b.decision}
                  </Badge>
                </span>
              </div>
              {b.rationale && (
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{b.rationale}</p>
              )}
            </div>
          ))}
          {missing.length > 0 && (
            <p className="text-xs text-fg-subtle">Didn&apos;t vote: {missing.join(", ")}</p>
          )}
        </CardContent>
      </Card>

      <OutcomeRecorder
        roundId={roundId}
        outcome={outcome}
        outcomeNote={outcomeNote}
        canRecord={canRecord}
        applicationId={applicationId}
        fundWon={fund > decline}
      />
    </div>
  );
}

function OutcomeRecorder({
  roundId,
  outcome,
  outcomeNote,
  canRecord,
  applicationId,
  fundWon,
}: {
  roundId: string;
  outcome: VoteOutcome | null;
  outcomeNote: string | null;
  canRecord: boolean;
  applicationId: string;
  fundWon: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function record(o: VoteOutcome) {
    setBusy(true);
    const res = await recordVoteOutcome({ roundId, outcome: o, note: note || undefined });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Outcome recorded: ${o}`);
    router.refresh();
  }

  if (outcome) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="text-sm">
            Outcome:{" "}
            <Badge variant={outcome === "fund" ? "success" : outcome === "decline" ? "danger" : "neutral"}>
              {outcome}
            </Badge>
            {outcomeNote && <p className="mt-1 text-xs text-fg-muted">{outcomeNote}</p>}
          </div>
          {outcome === "fund" && (
            <Button size="sm" asChild>
              <Link href={`/pipeline/${applicationId}`}>Create the grant →</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!canRecord) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record the outcome</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          rows={2}
          placeholder="Decision note — conditions, amount agreed, next steps…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={busy}
            onClick={() => record("fund")}
            className={cn(!fundWon && "opacity-80")}
          >
            Fund
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => record("decline")}>
            Decline
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => record("revisit")}>
            Revisit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
