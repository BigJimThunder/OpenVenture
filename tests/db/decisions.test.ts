import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs, settleDeferred } from "./world";
import { addApplication, addVoteRound, castBallot, seedClub } from "./fixtures";
import {
  application,
  applicationDemographics,
  company,
  grant,
  memo,
  stageHistory,
  vote,
  voteEligibility,
  voteRound,
} from "../../src/db/schema";
import { decideVote, openVoteRound, revealVoteRound, submitVote } from "../../src/lib/actions/votes";
import { getVoteRoundResults } from "../../src/lib/queries/memos";
import { intakeSchema, receiveApplication } from "../../src/lib/intake";

describe(`decisions (${driver})`, () => {
  it("a fund decision recorded three times at once creates one grant", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const { round, memo: m } = await addVoteRound(org.id, app.id, people.partner.member.id, [people.partner.member.id], "revealed");

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        actAs(people.partner.as, () =>
          decideVote({ roundId: round.id, outcome: "fund", poolId: pool.id, amount: "400", useOfFunds: "other", emailFounder: false })
        )
      )
    );
    await settleDeferred();
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(grant).where(eq(grant.applicationId, app.id))).toHaveLength(1);
    const [after] = await db.select().from(application).where(eq(application.id, app.id));
    expect(after.status).toBe("funded");
    expect(after.stageId).toBe(stages[2].id);
    const [roundAfter] = await db.select().from(voteRound).where(eq(voteRound.id, round.id));
    expect(roundAfter.outcome).toBe("fund");
    const [memoAfter] = await db.select().from(memo).where(eq(memo.id, m.id));
    expect(memoAfter.status).toBe("decided");
    // Exactly one move into the funded stage was recorded.
    const moves = await db
      .select()
      .from(stageHistory)
      .where(and(eq(stageHistory.applicationId, app.id), eq(stageHistory.toStageId, stages[2].id)));
    expect(moves).toHaveLength(1);
  });

  it("fund and decline racing each other leave exactly one decision", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const { round } = await addVoteRound(org.id, app.id, people.partner.member.id, [people.partner.member.id], "revealed");
    const results = await Promise.all([
      actAs(people.partner.as, () =>
        decideVote({ roundId: round.id, outcome: "fund", poolId: pool.id, amount: "400", useOfFunds: "other", emailFounder: false })
      ),
      actAs(people.admin.as, () =>
        decideVote({ roundId: round.id, outcome: "decline", declineReason: "too_early", founderEmail: { send: false } })
      ),
    ]);
    await settleDeferred();
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [after] = await db.select().from(application).where(eq(application.id, app.id));
    const grants = await db.select().from(grant).where(eq(grant.applicationId, app.id));
    if (after.status === "funded") expect(grants).toHaveLength(1);
    else {
      expect(after.status).toBe("declined");
      expect(grants).toHaveLength(0);
    }
  });

  it("only one vote round opens per memo, and it always has its voter list", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const [m] = await db
      .insert(memo)
      .values({ orgId: org.id, ref: 900, applicationId: app.id, title: "Memo", status: "circulated", authorMemberId: people.partner.member.id })
      .returning();
    const results = await Promise.all(
      [1, 2, 3].map(() => actAs(people.partner.as, () => openVoteRound({ memoId: m.id })))
    );
    await settleDeferred();
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rounds = await db.select().from(voteRound).where(eq(voteRound.memoId, m.id));
    expect(rounds).toHaveLength(1);
    const voters = await db.select().from(voteEligibility).where(eq(voteEligibility.voteRoundId, rounds[0].id));
    // admin, partner and analyst vote; read_only does not.
    expect(voters).toHaveLength(3);
  });
});

describe(`blind votes (${driver})`, () => {
  it("before reveal nobody sees a ballot but their own — not even an admin", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const voters = [people.admin.member.id, people.partner.member.id, people.analyst.member.id];
    const { round } = await addVoteRound(org.id, app.id, people.partner.member.id, voters, "open");
    await castBallot(round.id, people.partner.member.id, "decline");
    await castBallot(round.id, people.analyst.member.id, "fund");

    const seenByAdmin = await getVoteRoundResults(org.id, round.id, people.admin.member.id);
    expect(seenByAdmin).toMatchObject({ revealed: false, submittedCount: 2, eligibleCount: 3, ballots: [], missing: [], myBallot: null });
    const seenByAnalyst = await getVoteRoundResults(org.id, round.id, people.analyst.member.id);
    expect(seenByAnalyst!.ballots).toEqual([]);
    expect(seenByAnalyst!.myBallot).toMatchObject({ decision: "fund" });
    // Nothing in what is returned names another voter's decision.
    expect(JSON.stringify({ ...seenByAdmin, round: undefined })).not.toContain("decline");
  });

  it("a ballot cannot land or change once the round is revealed", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const voters = [people.partner.member.id, people.analyst.member.id];
    const { round } = await addVoteRound(org.id, app.id, people.partner.member.id, voters, "open");

    const ballot = { roundId: round.id, decision: "fund" as const, conviction: 4, rationale: "strong team" };
    expect((await actAs(people.analyst.as, () => submitVote(ballot))).ok).toBe(true);
    expect((await actAs(people.partner.as, () => revealVoteRound({ roundId: round.id }))).ok).toBe(true);

    const late = await actAs(people.analyst.as, () => submitVote({ ...ballot, decision: "decline", rationale: "changed my mind after seeing the room" }));
    expect(late.ok).toBe(false);
    const never = await actAs(people.partner.as, () => submitVote({ ...ballot, rationale: "late ballot" }));
    expect(never.ok).toBe(false);
    const ballots = await db.select().from(vote).where(eq(vote.voteRoundId, round.id));
    expect(ballots).toHaveLength(1);
    expect(ballots[0].decision).toBe("fund");
  });

  it("ballots and a reveal in flight together: every counted ballot was cast before the reveal", async () => {
    for (let i = 0; i < 6; i++) {
      const { org, people, stages } = await seedClub();
      const { application: app } = await addApplication(org.id, stages[1].id);
      const voters = [people.admin.member.id, people.partner.member.id, people.analyst.member.id];
      const { round } = await addVoteRound(org.id, app.id, people.partner.member.id, voters, "open");
      const ballot = { roundId: round.id, decision: "fund" as const, conviction: 3, rationale: "ok" };
      await Promise.all([
        actAs(people.admin.as, () => submitVote(ballot)),
        actAs(people.partner.as, () => revealVoteRound({ roundId: round.id })),
        actAs(people.analyst.as, () => submitVote(ballot)),
      ]);
      const [after] = await db.select().from(voteRound).where(eq(voteRound.id, round.id));
      expect(after.status).toBe("revealed");
      const ballots = await db.select().from(vote).where(eq(vote.voteRoundId, round.id));
      for (const b of ballots) {
        expect(b.updatedAt.getTime()).toBeLessThanOrEqual(after.revealedAt!.getTime() + 50);
      }
      // And nothing changes afterwards.
      const count = ballots.length;
      await actAs(people.analyst.as, () => submitVote({ ...ballot, decision: "decline" }));
      expect(await db.select().from(vote).where(eq(vote.voteRoundId, round.id))).toHaveLength(count);
    }
  });

  it("role gates hold: an analyst cannot reveal, a read-only member cannot vote", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[1].id);
    const { round } = await addVoteRound(org.id, app.id, people.partner.member.id, [people.analyst.member.id], "open");
    expect(await actAs(people.analyst.as, () => revealVoteRound({ roundId: round.id }))).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await actAs(people.read_only.as, () => submitVote({ roundId: round.id, decision: "fund", conviction: 3, rationale: "x" }))
    ).toMatchObject({ ok: false, code: "forbidden" });
    expect(await actAs({}, () => revealVoteRound({ roundId: round.id }))).toMatchObject({ ok: false, code: "auth" });
  });
});

describe(`intake (${driver})`, () => {
  it("applications arriving in the same instant all land, with consecutive numbers and one company per domain", async () => {
    const { org } = await seedClub();
    const inputs = [
      { companyName: "Alpha", website: "https://alpha.example", applicantEmail: "a@alpha.example" },
      { companyName: "Alpha Labs", website: "alpha.example", applicantEmail: "b@alpha.example" },
      { companyName: "Alpha Inc", website: "www.alpha.example/about", applicantEmail: "c@alpha.example" },
      { companyName: "Beta", website: "beta.example", applicantEmail: "d@beta.example" },
      { companyName: "Gamma", applicantEmail: "e@gamma.example", demographics: { gender: "woman", firstGeneration: true } },
      { companyName: "Delta", applicantEmail: "f@delta.example" },
    ].map((raw) => intakeSchema.parse(raw));

    const results = await Promise.all(
      inputs.map((input) => receiveApplication(org, input, "form", () => {}))
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const apps = await db.select().from(application).where(eq(application.orgId, org.id));
    expect(apps.map((a) => a.ref).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    const alpha = await db.select().from(company).where(and(eq(company.orgId, org.id), eq(company.domain, "alpha.example")));
    expect(alpha).toHaveLength(1);
    expect(apps.filter((a) => a.companyId === alpha[0].id)).toHaveLength(3);
    // Every application has its first stage-history row; demographics went with theirs.
    expect(await db.select().from(stageHistory)).toHaveLength(6);
    expect(await db.select().from(applicationDemographics)).toHaveLength(1);
    // No company was left behind without an application.
    const companies = await db.select().from(company).where(eq(company.orgId, org.id));
    for (const c of companies) expect(apps.some((a) => a.companyId === c.id)).toBe(true);
  });
});
