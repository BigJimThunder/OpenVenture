import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  application,
  company,
  pipelineStage,
  stageHistory,
  memo,
  voteRound,
  coffeeChat,
  coffeeChatAttendee,
  grant,
  type DeclineReason,
} from "@/db/schema";
import { ActionError } from "@/lib/actions/safe-action";
import { checkStageGates } from "./gates";
import { statusPatchForMove, type StatusPatch } from "./status";

/**
 * The stage move, as plain functions. `moveApplicationStage` and the vote
 * decision flow both call these so a move behaves identically however it was
 * triggered: same gates, same status rules, same history row.
 */

type Db = typeof db;
export type Stage = typeof pipelineStage.$inferSelect;

export async function loadStageMove(orgId: string, applicationId: string, toStageId: string) {
  const [[app], stages] = await Promise.all([
    db
      .select({
        id: application.id,
        ref: application.ref,
        stageId: application.stageId,
        status: application.status,
        enteredStageAt: application.enteredStageAt,
        declineReason: application.declineReason,
        applicantEmail: application.applicantEmail,
        amountRequested: application.amountRequested,
        companyId: application.companyId,
        companyName: company.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, applicationId), eq(application.orgId, orgId)))
      .limit(1),
    db.select().from(pipelineStage).where(eq(pipelineStage.orgId, orgId)),
  ]);
  if (!app) throw new ActionError("Application not found");
  const toStage = stages.find((s) => s.id === toStageId);
  if (!toStage) throw new ActionError("Stage not found");
  return {
    app,
    toStage,
    fromStage: stages.find((s) => s.id === app.stageId) ?? null,
    liveStages: stages.filter((s) => !s.archivedAt),
  };
}

export type MoveSubject = Awaited<ReturnType<typeof loadStageMove>>["app"];

/**
 * Stage gates: advancing past a flagged stage requires its artifact.
 * Evidence reads memo/voteRound STATUS only — never `vote` rows, which stay
 * behind getVoteRoundResults() until reveal.
 */
export async function assertStageGates(
  applicationId: string,
  fromStage: Stage | null,
  toStage: Stage,
  liveStages: Stage[]
): Promise<void> {
  if (!fromStage) return;
  if (toStage.kind !== "active" && toStage.kind !== "won") return;
  if (Number(toStage.position) <= Number(fromStage.position)) return;

  const [memoRows, voteRows, verdictCounts] = await Promise.all([
    db
      .select({ id: memo.id })
      .from(memo)
      .where(
        and(eq(memo.applicationId, applicationId), inArray(memo.status, ["circulated", "decided"]))
      )
      .limit(1),
    db
      .select({ id: voteRound.id })
      .from(voteRound)
      .where(and(eq(voteRound.applicationId, applicationId), eq(voteRound.status, "revealed")))
      .limit(1),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(coffeeChatAttendee)
      .innerJoin(coffeeChat, eq(coffeeChatAttendee.coffeeChatId, coffeeChat.id))
      .where(
        and(eq(coffeeChat.applicationId, applicationId), isNotNull(coffeeChatAttendee.verdict))
      )
      .groupBy(coffeeChatAttendee.coffeeChatId),
  ]);
  const gate = checkStageGates(fromStage, toStage, liveStages, {
    hasCirculatedMemo: memoRows.length > 0,
    hasRevealedVote: voteRows.length > 0,
    maxVerdictAttendees: verdictCounts.reduce((max, r) => Math.max(max, r.n), 0),
  });
  if (!gate.ok) throw new ActionError(gate.message);
}

/** The one non-cancelled grant an application may have, if any. */
export async function findLiveGrant(applicationId: string) {
  const [row] = await db
    .select({
      id: grant.id,
      status: grant.status,
      amountAwarded: grant.amountAwarded,
      poolId: grant.poolId,
    })
    .from(grant)
    .where(and(eq(grant.applicationId, applicationId), ne(grant.status, "cancelled")))
    .limit(1);
  return row ?? null;
}

export type StageMoveArgs = {
  orgId: string;
  memberId: string;
  app: Pick<MoveSubject, "id" | "stageId" | "status" | "enteredStageAt">;
  toStage: Stage;
  now: Date;
  position?: number;
  note?: string;
  declineReason?: DeclineReason;
  declineNote?: string;
};

/**
 * The writes for one stage move (application row + history row), built on
 * `q` so callers can run them inside `atomic()` alongside their own.
 */
export function stageMoveWrites(q: Db, args: StageMoveArgs): { patch: StatusPatch; statements: PromiseLike<unknown>[] } {
  const { app, toStage, now } = args;
  const patch = statusPatchForMove(app.status, toStage.kind);
  const secondsInPrev = Math.floor((now.getTime() - app.enteredStageAt.getTime()) / 1000);

  const statements = [
    q
      .update(application)
      .set({
        stageId: toStage.id,
        position: args.position != null ? String(args.position) : sql`${application.position}`,
        enteredStageAt: now,
        updatedAt: now,
        status: patch.status,
        ...(patch.decidedAt === "set" ? { decidedAt: now } : {}),
        ...(patch.decidedAt === "clear" ? { decidedAt: null } : {}),
        ...(patch.clearDecline ? { declineReason: null, declineNote: null } : {}),
        ...(toStage.kind === "lost"
          ? { declineReason: args.declineReason, declineNote: args.declineNote?.trim() || null }
          : {}),
        // A decided application has no next step; a stale one would keep
        // nagging its owner from the inbox.
        ...(toStage.kind === "lost" || toStage.kind === "won"
          ? { nextStep: null, nextStepDue: null }
          : {}),
      })
      .where(and(eq(application.id, app.id), eq(application.orgId, args.orgId))),
    q.insert(stageHistory).values({
      orgId: args.orgId,
      applicationId: app.id,
      fromStageId: app.stageId,
      toStageId: toStage.id,
      movedByMemberId: args.memberId,
      secondsInPrevStage: secondsInPrev,
      note: args.note?.trim() || (toStage.kind === "lost" ? args.declineNote?.trim() : undefined) || null,
    }),
  ];
  return { patch, statements };
}
