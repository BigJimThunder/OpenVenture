"use server";

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
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
  DECLINE_REASONS,
  USE_OF_FUNDS,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";
import { appUrl, emailLayout, escapeHtml, notifyMany, sendEmailSafe } from "@/lib/notify";
import { defaultFounderEmail, sendFounderEmail } from "@/lib/founder-emails";
import { orgSettings } from "@/lib/org-settings";
import { decideVoteRound, type DecisionInput } from "@/lib/pipeline/decision";
import { isVotingOpen } from "@/lib/votes/status";
import { atomic, guard, guardFailure, lock } from "@/lib/pipeline/atomic";

function revalidateVote(memoId: string | null, applicationId?: string) {
  revalidatePath("/memos");
  if (memoId) {
    revalidatePath(`/memos/${memoId}`);
    revalidatePath(`/memos/${memoId}/vote`);
  }
  if (applicationId) revalidatePath(`/pipeline/${applicationId}`);
  revalidatePath("/pipeline");
  revalidatePath("/inbox");
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
    // One open round per memo, and a round is never left without its voter
    // list: the round and its eligibility rows are written together, after
    // re-checking under a lock that nobody opened one a moment ago.
    const round = { id: randomUUID(), memoId: m.memo.id };
    try {
      await atomic((q) => [
        lock(q, "memo", m.memo.id),
        guard(
          q,
          sql`not exists (select 1 from ${voteRound} where ${voteRound.memoId} = ${m.memo.id} and ${voteRound.status} = 'open')`,
          "already_open"
        ),
        q.insert(voteRound).values({
          id: round.id,
          orgId: ctx.org.id,
          applicationId: m.applicationId,
          memoId: m.memo.id,
          meetingId: input.meetingId,
          title: `IC vote: ${m.companyName}`,
          opensAt: now,
          closesAt,
          quorum: input.quorum,
          status: "open",
        }),
        ...(eligibleVoters.length > 0
          ? [
              q.insert(voteEligibility).values(
                eligibleVoters.map((v) => ({
                  voteRoundId: round.id,
                  memberId: v.id,
                  isRecused: input.recusedMemberIds.includes(v.id),
                }))
              ),
            ]
          : []),
      ]);
    } catch (e) {
      if (guardFailure(e) === "already_open") throw new ActionError("A vote is already open on this memo");
      throw e;
    }

    // Ballot-box email to everyone eligible. `after()` keeps the function
    // alive until the sends settle — a bare promise is dropped on serverless.
    const recipients = eligibleVoters.filter((v) => !input.recusedMemberIds.includes(v.id));
    const orgName = ctx.org.name;
    const voteUrl = appUrl(`/memos/${m.memo.id}/vote`);
    const closes = closesAt.toLocaleString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: ctx.org.timezone ?? "UTC",
      timeZoneName: "short",
    });
    after(() =>
      notifyMany(
        recipients.map(
          (v) => () =>
            sendEmailSafe({
              to: v.email,
              subject: `Vote open: ${m.companyName}`,
              html: emailLayout({
                orgName,
                heading: `IC vote: ${m.companyName}`,
                bodyHtml: `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a">${escapeHtml(ctx.member.displayName)} opened a blind vote on ${escapeHtml(m.companyName)}. Read the memo, then cast your ballot — nobody, the chair included, can see any ballot until it is revealed.</p><p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#27272a">Voting closes ${escapeHtml(closes)}.</p>`,
                cta: { label: "Cast your ballot", url: voteUrl },
                footer: `You're receiving this because you're an eligible voter at ${orgName}.`,
              }),
            })
        )
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
    if (!isVotingOpen(round)) throw new ActionError("This vote has closed");

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

    // A ballot must never land (or change) after the reveal. The status was
    // read a moment ago, so the write takes its turn with the reveal on the
    // round and re-checks that voting is still open as it commits.
    const now = new Date();
    try {
      await atomic((q) => [
        lock(q, "round", round.id),
        guard(
          q,
          sql`exists (select 1 from ${voteRound} where ${voteRound.id} = ${round.id} and ${voteRound.status} = 'open' and (${voteRound.closesAt} is null or ${voteRound.closesAt} > now()))`,
          "not_open"
        ),
        q
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
          }),
      ]);
    } catch (e) {
      if (guardFailure(e) === "not_open") throw new ActionError("This vote has closed");
      throw e;
    }

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
    try {
      await atomic((q) => [
        // Takes its turn with ballots in flight (see submitVote).
        lock(q, "round", round.id),
        guard(
          q,
          sql`exists (select 1 from ${voteRound} where ${voteRound.id} = ${round.id} and ${voteRound.status} in ('open', 'closed'))`,
          "not_awaiting_reveal"
        ),
        ...(round.quorum
          ? [
              guard(
                q,
                sql`(select count(*) from ${vote} where ${vote.voteRoundId} = ${round.id}) >= ${round.quorum}`,
                "below_quorum"
              ),
            ]
          : []),
        q
          .update(voteRound)
          .set({ status: "revealed", revealedAt: now, revealedByMemberId: ctx.member.id })
          .where(and(eq(voteRound.id, round.id), eq(voteRound.orgId, ctx.org.id))),
      ]);
    } catch (e) {
      const failed = guardFailure(e);
      if (failed === "not_awaiting_reveal") throw new ActionError("This vote was already revealed");
      if (failed === "below_quorum") throw new ActionError(`Quorum is ${round.quorum}; not enough have voted`);
      throw e;
    }

    revalidateVote(round.memoId, round.applicationId);
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
    await atomic((q) => [
      q
        .update(voteRound)
        .set({ outcome: input.outcome, outcomeNote: input.note, decidedByMemberId: ctx.member.id })
        .where(and(eq(voteRound.id, round.id), eq(voteRound.orgId, ctx.org.id))),
      // Revisit / no quorum decide nothing — the memo stays circulated.
      ...(round.memoId && (input.outcome === "fund" || input.outcome === "decline")
        ? [
            q
              .update(memo)
              .set({ status: "decided", decidedAt: now, updatedAt: now })
              .where(and(eq(memo.id, round.memoId), eq(memo.orgId, ctx.org.id))),
          ]
        : []),
    ]);

    revalidateVote(round.memoId, round.applicationId);
    return {
      data: { ok: true },
      activity: {
        verb: "vote.decided",
        entityType: "vote_round",
        entityId: round.id,
        entityLabel: companyName,
        summary: OUTCOME_SUMMARY[input.outcome](companyName),
      },
    };
  },
});

const OUTCOME_SUMMARY: Record<(typeof VOTE_OUTCOMES)[number], (company: string) => string> = {
  fund: (c) => `The club voted to fund ${c}`,
  decline: (c) => `The club voted to decline ${c}`,
  revisit: (c) => `The club will revisit ${c}`,
  no_quorum: (c) => `The ${c} vote did not reach quorum`,
};

const founderEmailChoice = z
  .object({ send: z.boolean(), body: z.string().max(6000).optional() })
  .optional();

/**
 * The decision chain in one action. After reveal, a partner records what the
 * club decided and the rest follows atomically (see lib/pipeline/decision):
 *   fund     → outcome, memo decided, application → Funded, proposed grant
 *   decline  → outcome, memo decided, application → Declined with its reason
 *   revisit / no quorum → outcome, application stays put with a next step
 * `recordVoteOutcome`, `moveApplicationStage` and `createGrant` remain usable
 * on their own for the odd case that doesn't fit.
 */
export const decideVote = authedAction({
  minRole: "partner",
  input: z.discriminatedUnion("outcome", [
    z.object({
      roundId: z.string().uuid(),
      outcome: z.literal("fund"),
      note: z.string().max(2000).optional(),
      /** Pool and amount are required unless the application already has a live grant. */
      poolId: z.string().uuid().optional(),
      amount: z
        .string()
        .trim()
        .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1200 or 1200.50")
        .optional(),
      useOfFunds: z.enum(USE_OF_FUNDS).default("other"),
      useOfFundsNarrative: z.string().max(2000).optional(),
      /** Omitted → the club's Founder emails setting decides. */
      emailFounder: z.boolean().optional(),
    }),
    z.object({
      roundId: z.string().uuid(),
      outcome: z.literal("decline"),
      note: z.string().max(2000).optional(),
      declineReason: z.enum(DECLINE_REASONS, { message: "Choose a decline reason" }),
      founderEmail: founderEmailChoice,
    }),
    z.object({
      roundId: z.string().uuid(),
      outcome: z.enum(["revisit", "no_quorum"]),
      note: z.string().max(2000).optional(),
      nextStep: z.string().max(200).optional(),
      nextStepDue: z.coerce.date().nullable().optional(),
    }),
  ]),
  handler: async (input, ctx) => {
    const { roundId, ...rest } = input;
    const result = await decideVoteRound(
      { orgId: ctx.org.id, memberId: ctx.member.id, memberName: ctx.member.displayName },
      roundId,
      rest as DecisionInput
    );

    if (input.outcome === "fund") {
      const force = input.emailFounder;
      if (force !== false) {
        after(() =>
          sendFounderEmail("funded", result.applicationId, {
            amount: result.amount,
            force: force === true,
          })
        );
      }
    } else if (input.outcome === "decline") {
      const choice = input.founderEmail;
      if (!choice) {
        after(() => sendFounderEmail("declined", result.applicationId));
      } else if (choice.send) {
        after(() =>
          sendFounderEmail("declined", result.applicationId, {
            customBody: choice.body,
            force: true,
          })
        );
      }
    }

    revalidateVote(result.memoId, result.applicationId);
    revalidatePath("/grants");
    revalidatePath("/grants/budget");
    return {
      data: {
        applicationId: result.applicationId,
        grantId: result.grantId,
        grantCreated: result.grantCreated,
        amount: result.amount,
        poolName: result.poolName,
      },
      activity: {
        verb: "vote.decided",
        entityType: "vote_round",
        entityId: result.roundId,
        entityLabel: result.companyName,
        summary: result.summary,
      },
    };
  },
});

/**
 * The "you're funded" note as the founder would receive it, for the amount
 * currently in the decision dialog. Read-only.
 */
export const getFundedEmailPreview = authedAction({
  minRole: "partner",
  input: z.object({
    applicationId: z.string().uuid(),
    amount: z.string().max(20).optional(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        companyName: company.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");
    const amount = input.amount && Number(input.amount) > 0 ? input.amount : null;
    const email = defaultFounderEmail("funded", {
      orgName: ctx.org.name,
      companyName: app.companyName,
      firstName: (app.applicantName ?? "").trim().split(/\s+/)[0] ?? "",
      amount,
    });
    return {
      data: {
        applicantEmail: app.applicantEmail,
        subject: email.subject,
        body: email.body,
        clubSendsByDefault: orgSettings(ctx.org).founderEmails.funded,
      },
    };
  },
});
