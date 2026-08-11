"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  voteRound,
  voteEligibility,
  vote,
  memo,
  application,
  company,
  member,
  VOTE_DECISIONS,
  VOTE_OUTCOMES,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { sendEmail } from "@/lib/email";

function revalidateVote(memoId: string | null, applicationId?: string) {
  revalidatePath("/memos");
  if (memoId) revalidatePath(`/memos/${memoId}`);
  if (applicationId) revalidatePath(`/pipeline/${applicationId}`);
  revalidatePath("/");
}

async function loadRound(orgId: string, roundId: string) {
  const [row] = await db
    .select({
      round: voteRound,
      companyName: company.name,
    })
    .from(voteRound)
    .innerJoin(application, eq(voteRound.applicationId, application.id))
    .innerJoin(company, eq(application.companyId, company.id))
    .where(and(eq(voteRound.id, roundId), eq(voteRound.orgId, orgId)))
    .limit(1);
  if (!row) throw new ActionError("Vote round not found");
  return row;
}

/**
 * Open a blind vote on a memo. Eligibility = every active member with a
 * voting role (analyst+), minus explicit recusals.
 */
export const openVoteRound = authedAction({
  minRole: "partner",
  input: z.object({
    memoId: z.string().uuid(),
    closesInHours: z.coerce.number().min(1).max(24 * 14).default(48),
    recusedMemberIds: z.array(z.string().uuid()).default([]),
    quorum: z.coerce.number().int().min(1).optional(),
    meetingId: z.string().uuid().optional(),
  }),
  handler: async (input, ctx) => {
    const [m] = await db
      .select({
        memo: memo,
        companyName: company.name,
        applicationId: application.id,
      })
      .from(memo)
      .innerJoin(application, eq(memo.applicationId, application.id))
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(memo.id, input.memoId), eq(memo.orgId, ctx.org.id)))
      .limit(1);
    if (!m) throw new ActionError("Memo not found");
    if (m.memo.status === "draft") throw new ActionError("Circulate the memo before opening a vote");

    const [existing] = await db
      .select({ id: voteRound.id })
      .from(voteRound)
      .where(and(eq(voteRound.memoId, m.memo.id), eq(voteRound.status, "open")))
      .limit(1);
    if (existing) throw new ActionError("A vote is already open on this memo");

    const voters = await db
      .select({ id: member.id, email: member.email, name: member.displayName, role: member.role })
      .from(member)
      .where(and(eq(member.orgId, ctx.org.id), eq(member.status, "active")));
    const eligibleVoters = voters.filter((v) => v.role !== "read_only");

    const now = new Date();
    const closesAt = new Date(now.getTime() + input.closesInHours * 3600_000);
    const [round] = await db
      .insert(voteRound)
      .values({
        orgId: ctx.org.id,
        applicationId: m.applicationId,
        memoId: m.memo.id,
        meetingId: input.meetingId,
        title: `IC vote: ${m.companyName}`,
        opensAt: now,
        closesAt,
        quorum: input.quorum,
        status: "open",
      })
      .returning();

    await db.insert(voteEligibility).values(
      eligibleVoters.map((v) => ({
        voteRoundId: round.id,
        memberId: v.id,
        isRecused: input.recusedMemberIds.includes(v.id),
      }))
    );

    // Ballot-box email to everyone eligible.
    const base = process.env.BETTER_AUTH_URL ?? "";
    void Promise.allSettled(
      eligibleVoters
        .filter((v) => !input.recusedMemberIds.includes(v.id))
        .map((v) =>
          sendEmail({
            to: v.email,
            subject: `Vote open: ${m.companyName}`,
            html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="font-size:16px;margin:0 0 8px">IC vote: ${m.companyName}</h2>
              <p style="color:#555;font-size:14px">Votes are blind until reveal. Closes ${closesAt.toUTCString()}.</p>
              <p style="margin:16px 0"><a href="${base}/memos/${m.memo.id}/vote" style="background:#4f46e5;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:14px">Cast your vote</a></p>
            </div>`,
          }).catch(() => {})
        )
    );

    revalidateVote(m.memo.id, m.applicationId);
    return {
      data: { roundId: round.id },
      activity: {
        verb: "vote.opened",
        entityType: "vote_round",
        entityId: round.id,
        entityLabel: m.companyName,
        summary: `${ctx.member.displayName} opened a blind vote on ${m.companyName}`,
      },
    };
  },
});

export const submitVote = authedAction({
  minRole: "analyst",
  input: z.object({
    roundId: z.string().uuid(),
    decision: z.enum(VOTE_DECISIONS),
    conviction: z.coerce.number().int().min(1).max(5),
    rationale: z.string().min(1, "A rationale is required — it's how the club learns").max(5000),
    suggestedAmount: z.coerce.number().min(0).max(1_000_000).optional(),
  }),
  handler: async (input, ctx) => {
    const { round } = await loadRound(ctx.org.id, input.roundId);
    if (round.status !== "open") throw new ActionError("This vote is not open");
    if (round.closesAt && round.closesAt < new Date()) throw new ActionError("This vote has closed");

    const [elig] = await db
      .select()
      .from(voteEligibility)
      .where(
        and(
          eq(voteEligibility.voteRoundId, round.id),
          eq(voteEligibility.memberId, ctx.member.id)
        )
      )
      .limit(1);
    if (!elig) throw new ActionError("You're not eligible to vote in this round");
    if (elig.isRecused) throw new ActionError("You're recused from this vote");

    const now = new Date();
    await db
      .insert(vote)
      .values({
        voteRoundId: round.id,
        memberId: ctx.member.id,
        decision: input.decision,
        conviction: input.conviction,
        rationale: input.rationale,
        suggestedAmount: input.suggestedAmount != null ? String(input.suggestedAmount) : null,
      })
      .onConflictDoUpdate({
        target: [vote.voteRoundId, vote.memberId],
        set: {
          decision: input.decision,
          conviction: input.conviction,
          rationale: input.rationale,
          suggestedAmount: input.suggestedAmount != null ? String(input.suggestedAmount) : null,
          updatedAt: now,
        },
      });

    revalidateVote(round.memoId);
    // Deliberately NO activity entry — even "X voted" leaks who's in.
    return { data: { ok: true } };
  },
});

export const revealVoteRound = authedAction({
  minRole: "partner",
  input: z.object({ roundId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const { round, companyName } = await loadRound(ctx.org.id, input.roundId);
    if (round.status !== "open" && round.status !== "closed") {
      throw new ActionError(`Cannot reveal a ${round.status} round`);
    }
    if (round.quorum) {
      const ballots = await db
        .select({ id: vote.id })
        .from(vote)
        .where(eq(vote.voteRoundId, round.id));
      if (ballots.length < round.quorum) {
        throw new ActionError(`Quorum is ${round.quorum}; only ${ballots.length} have voted`);
      }
    }
    const now = new Date();
    await db
      .update(voteRound)
      .set({ status: "revealed", revealedAt: now, revealedByMemberId: ctx.member.id })
      .where(eq(voteRound.id, round.id));

    revalidateVote(round.memoId);
    return {
      data: { ok: true },
      activity: {
        verb: "vote.revealed",
        entityType: "vote_round",
        entityId: round.id,
        entityLabel: companyName,
        summary: `${ctx.member.displayName} revealed the ${companyName} vote`,
      },
    };
  },
});

export const recordVoteOutcome = authedAction({
  minRole: "partner",
  input: z.object({
    roundId: z.string().uuid(),
    outcome: z.enum(VOTE_OUTCOMES),
    note: z.string().max(2000).optional(),
  }),
  handler: async (input, ctx) => {
    const { round, companyName } = await loadRound(ctx.org.id, input.roundId);
    if (round.status !== "revealed") throw new ActionError("Reveal the vote before recording an outcome");

    const now = new Date();
    await db
      .update(voteRound)
      .set({ outcome: input.outcome, outcomeNote: input.note, decidedByMemberId: ctx.member.id })
      .where(eq(voteRound.id, round.id));
    if (round.memoId) {
      await db
        .update(memo)
        .set({ status: "decided", decidedAt: now, updatedAt: now })
        .where(eq(memo.id, round.memoId));
    }

    revalidateVote(round.memoId);
    return {
      data: { ok: true },
      activity: {
        verb: "vote.decided",
        entityType: "vote_round",
        entityId: round.id,
        entityLabel: companyName,
        summary: `The club voted to ${input.outcome === "fund" ? "fund" : input.outcome} ${companyName}`,
      },
    };
  },
});
