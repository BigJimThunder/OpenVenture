import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/db";
import {
  activity,
  application,
  company,
  grant,
  grantPool,
  memo,
  pipelineStage,
  voteRound,
  type DeclineReason,
  type UseOfFunds,
  type VoteOutcome,
} from "@/db/schema";
import { ActionError } from "@/lib/actions/safe-action";
import { formatMoney } from "@/lib/utils";
import { atomic } from "./atomic";
import { assertStageGates, findLiveGrant, stageMoveWrites } from "./moves";

/**
 * The decision chain: one call records the club's decision on a revealed
 * vote and carries it all the way through — outcome on the round, memo marked
 * decided, application moved to its terminal stage, and (for a fund) a
 * proposed grant in the chosen pool. All reads and checks happen first; the
 * writes then commit together or not at all.
 *
 * The budget guard deliberately stays at approval time (approveGrant): a
 * proposed grant commits nothing against the pool.
 */

export type DecisionInput =
  | {
      outcome: "fund";
      note?: string;
      /** Pool and amount are required unless the application already has a live grant. */
      poolId?: string;
      /** Decimal string, e.g. "1200" or "1200.50". */
      amount?: string;
      useOfFunds: UseOfFunds;
      useOfFundsNarrative?: string;
    }
  | { outcome: "decline"; note?: string; declineReason: DeclineReason }
  | {
      outcome: "revisit" | "no_quorum";
      note?: string;
      nextStep?: string;
      nextStepDue?: Date | null;
    };

export type DecisionResult = {
  roundId: string;
  applicationId: string;
  memoId: string | null;
  companyName: string;
  outcome: VoteOutcome;
  /** Fund only: the grant now attached to the application. */
  grantId: string | null;
  grantCreated: boolean;
  amount: string | null;
  poolName: string | null;
  /** One sentence for the activity feed. */
  summary: string;
};

type Actor = { orgId: string; memberId: string; memberName: string };

async function terminalStage(orgId: string, kind: "won" | "lost") {
  const [stage] = await db
    .select()
    .from(pipelineStage)
    .where(
      and(
        eq(pipelineStage.orgId, orgId),
        eq(pipelineStage.kind, kind),
        isNull(pipelineStage.archivedAt)
      )
    )
    .orderBy(asc(pipelineStage.position))
    .limit(1);
  if (!stage) {
    throw new ActionError(
      kind === "won"
        ? "This pipeline has no funded stage — add one in Settings → Pipeline"
        : "This pipeline has no declined stage — add one in Settings → Pipeline"
    );
  }
  return stage;
}

export async function decideVoteRound(
  actor: Actor,
  roundId: string,
  input: DecisionInput
): Promise<DecisionResult> {
  const [row] = await db
    .select({
      round: voteRound,
      app: {
        id: application.id,
        stageId: application.stageId,
        status: application.status,
        enteredStageAt: application.enteredStageAt,
        amountRequested: application.amountRequested,
        companyId: application.companyId,
      },
      companyName: company.name,
    })
    .from(voteRound)
    .innerJoin(application, eq(voteRound.applicationId, application.id))
    .innerJoin(company, eq(application.companyId, company.id))
    .where(and(eq(voteRound.id, roundId), eq(voteRound.orgId, actor.orgId)))
    .limit(1);
  if (!row) throw new ActionError("Vote round not found");
  const { round, app, companyName } = row;
  if (round.status !== "revealed") {
    throw new ActionError("Reveal the vote before recording a decision");
  }
  if (round.outcome) {
    throw new ActionError(`A decision is already recorded for this vote (${round.outcome.replace("_", " ")})`);
  }

  const now = new Date();
  const note = input.note?.trim() || null;
  const stages = await db.select().from(pipelineStage).where(eq(pipelineStage.orgId, actor.orgId));
  const fromStage = stages.find((s) => s.id === app.stageId) ?? null;
  const liveStages = stages.filter((s) => !s.archivedAt);

  const base = {
    roundId: round.id,
    applicationId: app.id,
    memoId: round.memoId,
    companyName,
    outcome: input.outcome,
  };
  const appActivity = (verb: string, summary: string) => ({
    orgId: actor.orgId,
    actorMemberId: actor.memberId,
    actorType: "member" as const,
    verb,
    entityType: "application",
    entityId: app.id,
    entityLabel: companyName,
    summary,
  });
  const roundWrite = (q: typeof db) =>
    q
      .update(voteRound)
      .set({ outcome: input.outcome, outcomeNote: note, decidedByMemberId: actor.memberId })
      .where(eq(voteRound.id, round.id));
  const memoWrite = (q: typeof db) =>
    round.memoId
      ? [
          q
            .update(memo)
            .set({ status: "decided", decidedAt: now, updatedAt: now })
            .where(and(eq(memo.id, round.memoId), eq(memo.orgId, actor.orgId))),
        ]
      : [];

  if (input.outcome === "fund") {
    const [wonStage, liveGrant] = await Promise.all([
      terminalStage(actor.orgId, "won"),
      findLiveGrant(app.id),
    ]);

    // An application has at most one live grant: if one exists the decision
    // links it; otherwise this proposes it.
    let proposal: { id: string; poolId: string; poolName: string; amount: string } | null = null;
    if (!liveGrant) {
      let amount: Decimal;
      try {
        amount = new Decimal(input.amount ?? "");
      } catch {
        throw new ActionError("Enter the grant amount");
      }
      if (!amount.isFinite() || amount.lte(0)) {
        throw new ActionError("The grant amount must be more than zero");
      }
      if (amount.gt(1_000_000)) throw new ActionError("That amount is too large");
      if (!input.poolId) throw new ActionError("Choose the pool the grant comes from");
      const [pool] = await db
        .select({ id: grantPool.id, name: grantPool.name })
        .from(grantPool)
        .where(and(eq(grantPool.id, input.poolId), eq(grantPool.orgId, actor.orgId)))
        .limit(1);
      if (!pool) throw new ActionError("Pool not found");
      proposal = { id: randomUUID(), poolId: pool.id, poolName: pool.name, amount: amount.toFixed(2) };
    }

    const needsMove = app.stageId !== wonStage.id || app.status !== "funded";
    if (app.stageId !== wonStage.id) {
      await assertStageGates(app.id, fromStage, wonStage, liveStages);
    }

    const grantId = liveGrant?.id ?? proposal!.id;
    const awarded = liveGrant?.amountAwarded ?? proposal!.amount;
    const summary = proposal
      ? `The club voted to fund ${companyName} — ${formatMoney(proposal.amount)} proposed from ${proposal.poolName}`
      : `The club voted to fund ${companyName}`;
    const narrative = input.useOfFundsNarrative?.trim() || null;
    const useOfFunds = input.useOfFunds;

    await atomic((q) => [
      roundWrite(q),
      ...memoWrite(q),
      ...(needsMove
        ? stageMoveWrites(q, {
            orgId: actor.orgId,
            memberId: actor.memberId,
            app,
            toStage: wonStage,
            now,
            note: note ?? "Funded by IC vote",
          }).statements
        : []),
      ...(proposal
        ? [
            q.insert(grant).values({
              id: proposal.id,
              orgId: actor.orgId,
              poolId: proposal.poolId,
              applicationId: app.id,
              companyId: app.companyId,
              memoId: round.memoId,
              voteRoundId: round.id,
              status: "proposed",
              amountRequested: app.amountRequested,
              amountAwarded: proposal.amount,
              useOfFunds,
              useOfFundsNarrative: narrative,
            }),
            q.insert(activity).values({
              orgId: actor.orgId,
              actorMemberId: actor.memberId,
              actorType: "member",
              verb: "grant.proposed",
              entityType: "grant",
              entityId: proposal.id,
              entityLabel: companyName,
              summary: `${actor.memberName} proposed a ${formatMoney(proposal.amount)} grant to ${companyName}`,
            }),
          ]
        : []),
      q.insert(activity).values(appActivity("application.funded", summary)),
    ]);

    return {
      ...base,
      grantId,
      grantCreated: proposal !== null,
      amount: awarded,
      poolName: proposal?.poolName ?? null,
      summary,
    };
  }

  if (input.outcome === "decline") {
    const lostStage = await terminalStage(actor.orgId, "lost");
    const needsMove = app.stageId !== lostStage.id || app.status !== "declined";
    const summary = `The club voted to decline ${companyName}`;

    await atomic((q) => [
      roundWrite(q),
      ...memoWrite(q),
      ...(needsMove
        ? stageMoveWrites(q, {
            orgId: actor.orgId,
            memberId: actor.memberId,
            app,
            toStage: lostStage,
            now,
            declineReason: input.declineReason,
            declineNote: note ?? undefined,
          }).statements
        : []),
      q.insert(activity).values(appActivity("application.declined", summary)),
    ]);

    return { ...base, grantId: null, grantCreated: false, amount: null, poolName: null, summary };
  }

  // Revisit / no quorum: nothing is decided, so the memo stays circulated and
  // the application stays where it is — with a next step so it isn't orphaned.
  const nextStep = input.nextStep?.trim() || null;
  const summary =
    input.outcome === "revisit"
      ? `The club will revisit ${companyName}${nextStep ? ` — ${nextStep}` : ""}`
      : `The ${companyName} vote did not reach quorum${nextStep ? ` — ${nextStep}` : ""}`;

  await atomic((q) => [
    roundWrite(q),
    ...(nextStep
      ? [
          q
            .update(application)
            .set({ nextStep, nextStepDue: input.nextStepDue ?? null, updatedAt: now })
            .where(and(eq(application.id, app.id), eq(application.orgId, actor.orgId))),
        ]
      : []),
    q.insert(activity).values(appActivity("application.vote_inconclusive", summary)),
  ]);

  return { ...base, grantId: null, grantCreated: false, amount: null, poolName: null, summary };
}
