import { notFound } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ArrowLeftIcon, EyeOffIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMemoDetail, getVoteRoundResults } from "@/lib/queries/memos";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { VoteForm } from "@/components/votes/vote-form";
import { RevealPanel } from "@/components/votes/reveal-panel";
import { RevealControls } from "@/components/votes/reveal-controls";

export const dynamic = "force-dynamic";

export default async function VotePage({ params }: PageProps<"/memos/[id]/vote">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMemoDetail(ctx.org.id, id);
  if (!detail) notFound();

  const latestRound = detail.rounds[0];
  if (!latestRound) {
    return (
      <div>
        <PageHeader title={detail.memo.title} description="No vote has been opened on this memo." />
        <div className="px-6">
          <EmptyState
            title="No vote round yet"
            description="A partner can open a blind vote from the memo page once it's circulated."
            action={
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/memos/${id}`}>Back to memo</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const results = await getVoteRoundResults(ctx.org.id, latestRound.id, ctx.member.id);
  if (!results) notFound();
  const { round } = results;
  const isPartnerPlus = ctx.member.role === "admin" || ctx.member.role === "partner";
  const isEligible =
    !!results.myBallot ||
    (round.status === "open" &&
      // eligibility check happens server-side on submit; the form shows for
      // any non-read-only member and errors cleanly if recused
      ctx.member.role !== "read_only");

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {round.title}
            <Badge
              variant={
                round.status === "revealed"
                  ? "success"
                  : round.status === "open"
                    ? "warning"
                    : "neutral"
              }
            >
              {round.status}
            </Badge>
          </span>
        }
        description={
          <>
            {detail.memo.recommendation && (
              <>Author recommends <strong className="capitalize">{detail.memo.recommendation.replace("_", " ")}</strong>
              {detail.memo.proposedAmount ? ` at ${formatMoney(detail.memo.proposedAmount)}` : ""} · </>
            )}
            <Link href={`/memos/${id}`} className="text-accent hover:underline">
              read the memo
            </Link>
          </>
        }
        actions={
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/memos/${id}`}>
              <ArrowLeftIcon />
              Memo
            </Link>
          </Button>
        }
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-3 px-6">
        {/* Participation — the only thing anyone sees pre-reveal. */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            {!results.revealed && <EyeOffIcon className="size-4 shrink-0 text-fg-subtle" />}
            <div className="flex-1">
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">
                  {results.revealed ? "Final participation" : "Ballots are sealed"}
                </span>
                <span className="tnum text-fg-muted">
                  {results.submittedCount} / {results.eligibleCount} voted
                  {results.recusedCount > 0 ? ` · ${results.recusedCount} recused` : ""}
                </span>
              </div>
              <Progress value={(results.submittedCount / Math.max(1, results.eligibleCount)) * 100} />
              {round.closesAt && round.status === "open" && (
                <p className="mt-1.5 text-xs text-warning">
                  Closes {formatDistanceToNow(round.closesAt, { addSuffix: true })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {round.status === "open" && isEligible && (
          <VoteForm
            roundId={round.id}
            scaleMin={round.scaleMin}
            scaleMax={round.scaleMax}
            existing={
              results.myBallot
                ? {
                    decision: results.myBallot.decision,
                    conviction: results.myBallot.conviction,
                    rationale: results.myBallot.rationale,
                    suggestedAmount: results.myBallot.suggestedAmount,
                  }
                : null
            }
          />
        )}

        {isPartnerPlus && (round.status === "open" || round.status === "closed") && (
          <RevealControls roundId={round.id} submittedCount={results.submittedCount} eligibleCount={results.eligibleCount} />
        )}

        {results.revealed && (
          <RevealPanel
            ballots={results.ballots.map((b) => ({
              memberName: b.memberName,
              decision: b.decision,
              conviction: b.conviction,
              rationale: b.rationale,
              suggestedAmount: b.suggestedAmount,
            }))}
            missing={results.missing}
            scaleMax={round.scaleMax}
            outcome={round.outcome}
            outcomeNote={round.outcomeNote}
            roundId={round.id}
            canRecord={isPartnerPlus}
            applicationId={detail.applicationId}
          />
        )}
      </div>
    </div>
  );
}
