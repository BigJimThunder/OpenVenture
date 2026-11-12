import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  ChevronRightIcon,
  ClockIcon,
  EyeOffIcon,
  FileTextIcon,
  LockIcon,
  ShieldCheckIcon,
  UsersIcon,
  VoteIcon,
} from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getMemoDetail, getVoteRoundResults } from "@/lib/queries/memos";
import { getDecisionContext } from "@/lib/queries/applications";
import { getPools, getPoolSummary } from "@/lib/queries/grants";
import { effectiveRoundStatus } from "@/lib/votes/status";
import { suggestGrantAmount } from "@/lib/votes/suggest";
import { can } from "@/lib/permissions";
import { formatRef } from "@/lib/refs";
import { formatMoney } from "@/lib/utils";
import { EmptyState } from "@/components/patterns/empty-state";
import { Button } from "@/components/ui/button";
import { VoteForm } from "@/components/votes/vote-form";
import { RevealPanel } from "@/components/votes/reveal-panel";
import { RevealControls } from "@/components/votes/reveal-controls";
import { DecisionDialog } from "@/components/votes/decision-dialog";
import { DecisionSummary } from "@/components/applications/decision-summary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "IC vote" };

const RECOMMENDATION_LABEL: Record<string, string> = {
  fund: "fund",
  decline: "decline",
  watch: "watch",
  more_diligence: "more diligence",
};

export default async function VotePage({ params }: PageProps<"/memos/[id]/vote">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getMemoDetail(ctx.org.id, id);
  if (!detail) notFound();

  const role = ctx.member.role;
  const canRunVotes = can(role, "runVotes");
  const memoHref = `/memos/${id}` as Route;
  const applicationHref = `/pipeline/${detail.applicationId}` as Route;

  const crumbs = (
    <nav className="flex flex-wrap items-center gap-1 text-xs text-fg-subtle" aria-label="Breadcrumb">
      <Link href={applicationHref} className="rounded transition-colors hover:text-fg max-md:py-2">
        {detail.companyName}
      </Link>
      <ChevronRightIcon className="size-3" />
      <Link href={memoHref} className="rounded font-mono transition-colors hover:text-fg max-md:py-2">
        {formatRef("memo", detail.memo.ref)}
      </Link>
      <ChevronRightIcon className="size-3" />
      <span>Vote</span>
    </nav>
  );

  const latestRound = detail.rounds[0];
  if (!latestRound) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-5 pb-12 md:px-6">
        {crumbs}
        <h1 className="mt-1.5 mb-4 text-lg font-semibold tracking-tight">IC vote: {detail.companyName}</h1>
        <EmptyState
          icon={<VoteIcon />}
          title="No vote has been opened yet"
          description="The club votes on a memo, blind, once it has been circulated."
          steps={[
            "The author circulates the memo so everyone can read it.",
            "A partner opens the vote from the memo and sets when it closes.",
            "Every eligible member seals a ballot here. Nobody sees any ballot until a partner reveals them all at once.",
          ]}
          action={
            <Button variant="secondary" size="sm" asChild className="max-md:h-10">
              <Link href={memoHref}>
                <FileTextIcon />
                {canRunVotes ? "Open the vote from the memo" : "Back to the memo"}
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const results = await getVoteRoundResults(ctx.org.id, latestRound.id, ctx.member.id);
  if (!results) notFound();
  const { round } = results;
  // An open round past its deadline behaves as closed, whatever the row says.
  const status = effectiveRoundStatus(round);
  const votingOpen = status === "open";
  const sealed = status === "open" || status === "closed";
  // Eligibility comes from the round's own list — no role-based guessing, and
  // a recused member sees a notice instead of a form that errors on submit.
  const isEligible = results.viewerIsEligible && !results.viewerIsRecused;

  const context =
    results.revealed || round.outcome ? await getDecisionContext(ctx.org.id, detail.applicationId) : null;

  // Only a partner about to decide needs pools and a suggested amount, and
  // only revealed ballots feed the suggestion.
  const deciding = results.revealed && !round.outcome && canRunVotes;
  const pools = deciding
    ? (
        await Promise.all(
          (await getPools(ctx.org.id)).map(async (p) => {
            const summary = await getPoolSummary(ctx.org.id, p.id);
            return { id: p.id, name: p.name, remaining: summary?.remaining ?? 0 };
          })
        )
      )
    : [];
  const suggestion = deciding
    ? suggestGrantAmount({
        ballots: results.ballots,
        memoProposedAmount: detail.memo.proposedAmount,
        amountRequested: detail.amountRequested,
      })
    : null;

  const amountPresets = [
    ...(detail.memo.proposedAmount ? [{ label: "memo", amount: detail.memo.proposedAmount }] : []),
    ...(detail.amountRequested && detail.amountRequested !== detail.memo.proposedAmount
      ? [{ label: "ask", amount: detail.amountRequested }]
      : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-5 pb-12 md:px-6">
      <header>
        {crumbs}
        <h1 className="mt-1.5 text-lg font-semibold tracking-tight">{round.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {detail.memo.recommendation && (
            <>
              The memo recommends{" "}
              <strong className="font-medium text-fg">
                {RECOMMENDATION_LABEL[detail.memo.recommendation] ?? detail.memo.recommendation}
              </strong>
              {detail.memo.proposedAmount ? (
                <>
                  {" "}
                  at <span className="tnum">{formatMoney(detail.memo.proposedAmount)}</span>
                </>
              ) : null}
              .{" "}
            </>
          )}
          <Link href={memoHref} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            Read the memo
          </Link>
          {votingOpen && isEligible ? " before you vote." : "."}
        </p>
      </header>

      {round.outcome && context && (
        <DecisionSummary
          outcome={round.outcome}
          outcomeNote={round.outcomeNote}
          decidedAt={context.app.decidedAt}
          declineReason={context.app.declineReason}
          declineNote={context.app.declineNote}
          grant={context.grant}
          nextStep={context.app.nextStep}
          links={[
            ...(round.outcome === "fund" && context.grant ? [{ href: "/grants" as Route, label: "View grant" }] : []),
            { href: applicationHref, label: "Open application" },
          ]}
        />
      )}

      {sealed && (
        <>
          {/* Pre-reveal: no tally and no voter list for anyone. Turnout (a bare
              count) is shown only to whoever runs the vote, who needs it for
              quorum; watching it tick would let others infer who just voted. */}
          <section
            className="overflow-hidden rounded-xl border border-border-strong bg-panel shadow-sm"
            aria-label="Sealed ballots"
          >
            <div className="flex items-start gap-3.5 bg-bg-subtle px-4 py-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-fg text-bg">
                <LockIcon className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold">Ballots are sealed</div>
                {canRunVotes ? (
                  <>
                <div className="tnum mt-0.5 text-sm text-fg-muted">
                  {results.submittedCount} of {results.eligibleCount} ballots in
                  {results.recusedCount > 0 ? ` · ${results.recusedCount} recused` : ""}
                  {round.quorum ? ` · quorum ${round.quorum}` : ""}
                </div>
                <div
                  className="mt-2.5 flex h-1.5 gap-0.5"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={results.eligibleCount}
                  aria-valuenow={results.submittedCount}
                  aria-label="Ballots in"
                >
                  {Array.from({ length: Math.max(1, results.eligibleCount) }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        i < results.submittedCount
                          ? "h-full flex-1 rounded-full bg-fg"
                          : "h-full flex-1 rounded-full bg-border-strong/60"
                      }
                    />
                  ))}
                </div>
                  </>
                ) : (
                  <div className="mt-0.5 text-sm text-fg-muted">
                    {results.eligibleCount} members can vote
                    {results.recusedCount > 0 ? ` · ${results.recusedCount} recused` : ""}
                    {round.quorum ? ` · quorum ${round.quorum}` : ""}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-sm">
              <ClockIcon className="size-4 shrink-0 text-fg-subtle" />
              {votingOpen ? (
                round.closesAt ? (
                  <span>
                    Voting closes in{" "}
                    <strong className="font-medium">{formatDistanceToNowStrict(round.closesAt)}</strong>
                    <span className="tnum text-fg-muted"> · {format(round.closesAt, "EEE MMM d, p")}</span>
                  </span>
                ) : (
                  <span>Voting is open until a partner reveals the ballots.</span>
                )
              ) : (
                <span>
                  Voting closed
                  {round.closesAt ? (
                    <span className="tnum text-fg-muted"> {format(round.closesAt, "EEE MMM d, p")}</span>
                  ) : null}
                  . {canRunVotes ? "Reveal when the club is ready." : "Waiting for a partner to reveal the ballots."}
                </span>
              )}
            </div>
            <ul className="grid gap-x-4 gap-y-2.5 border-t border-border px-4 py-3.5 text-xs text-fg-muted sm:grid-cols-3">
              <li className="flex gap-2">
                <EyeOffIcon className="mt-px size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  <strong className="font-medium text-fg">Nobody can peek.</strong> Not the chair, not an
                  admin. Unrevealed ballots never leave the server.
                </span>
              </li>
              <li className="flex gap-2">
                <UsersIcon className="mt-px size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  <strong className="font-medium text-fg">No running tally.</strong>{" "}
                  {canRunVotes
                    ? "You see how many ballots are in, for quorum — never whose, never which way."
                    : "Nobody sees which way it is going, and you can't see who has voted."}
                </span>
              </li>
              <li className="flex gap-2">
                <ShieldCheckIcon className="mt-px size-3.5 shrink-0 text-fg-subtle" />
                <span>
                  <strong className="font-medium text-fg">Revealed all at once.</strong> Every ballot,
                  name and reason, to the whole club, in one step.
                </span>
              </li>
            </ul>
          </section>

          {results.viewerIsRecused ? (
            <section className="flex items-start gap-3 rounded-xl border border-border bg-panel p-4 shadow-xs">
              <EyeOffIcon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
              <div className="text-sm">
                <div className="font-semibold">You&apos;re recused from this vote</div>
                <p className="mt-0.5 text-fg-muted">
                  You won&apos;t cast a ballot. You&apos;ll see the result with everyone else at reveal.
                </p>
              </div>
            </section>
          ) : isEligible && votingOpen ? (
            <VoteForm
              roundId={round.id}
              scaleMin={round.scaleMin}
              scaleMax={round.scaleMax}
              allowAmount={round.allowAmountSuggestion}
              amountPresets={amountPresets}
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
          ) : isEligible ? (
            <section className="rounded-xl border border-border bg-panel p-4 text-sm shadow-xs">
              <div className="font-semibold">
                {results.myBallot ? "Your ballot is in and sealed" : "Voting closed before you cast a ballot"}
              </div>
              <p className="mt-0.5 text-fg-muted">
                {results.myBallot
                  ? "It can't be changed now. It will be shown with your name at reveal."
                  : "You'll see the result with everyone else at reveal."}
              </p>
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-panel p-4 text-sm shadow-xs">
              <div className="font-semibold">You&apos;re not a voter in this round</div>
              <p className="mt-0.5 text-fg-muted">
                Voters are the members who were active when the vote opened. You&apos;ll see the result
                at reveal.
              </p>
            </section>
          )}

          {canRunVotes && (
            <RevealControls
              roundId={round.id}
              submittedCount={results.submittedCount}
              eligibleCount={results.eligibleCount}
              quorum={round.quorum}
              votingOpen={votingOpen}
            />
          )}
        </>
      )}

      {results.revealed && (
        <>
          {!round.outcome &&
            (deciding && context ? (
              <section className="flex flex-col gap-3 rounded-xl border border-accent/30 bg-accent-subtle/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-2xs font-medium tracking-[0.06em] text-accent uppercase">Next</div>
                  <div className="mt-0.5 text-base font-semibold">Record the club&apos;s decision</div>
                  <p className="mt-0.5 text-sm text-fg-muted">
                    One step: the outcome, the application&apos;s stage and the grant.
                  </p>
                </div>
                <DecisionDialog
                  roundId={round.id}
                  applicationId={detail.applicationId}
                  companyName={detail.companyName}
                  tally={{
                    fund: results.ballots.filter((b) => b.decision === "fund").length,
                    decline: results.ballots.filter((b) => b.decision === "decline").length,
                    abstain: results.ballots.filter((b) => b.decision === "abstain").length,
                  }}
                  suggestion={suggestion}
                  pools={pools}
                  existingGrant={context.grant}
                  defaultNarrative={context.app.useOfFundsNarrative}
                  wonStageName={context.wonStageName}
                  lostStageName={context.lostStageName}
                />
              </section>
            ) : (
              <p className="rounded-xl border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
                The ballots are in the open. Waiting for a partner to record the club&apos;s decision.
              </p>
            ))}

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
            revealedAt={round.revealedAt}
          />
        </>
      )}

      {status === "cancelled" || status === "draft" ? (
        <p className="rounded-xl border border-border bg-bg-subtle px-4 py-3 text-sm text-fg-muted">
          This vote was {status === "cancelled" ? "cancelled" : "never opened"}. A partner can open a
          new one from the memo.
        </p>
      ) : null}
    </div>
  );
}
