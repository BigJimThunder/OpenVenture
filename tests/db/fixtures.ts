import { randomUUID } from "node:crypto";
import { testDb as db } from "./db";
import {
  application,
  company,
  grant,
  grantPool,
  member,
  memo,
  organization,
  pipelineStage,
  user,
  vote,
  voteEligibility,
  voteRound,
  type MemberRole,
} from "../../src/db/schema";
import type { Actor } from "./world";

export type Person = { member: typeof member.$inferSelect; as: Actor };

/** A club with one member per role, a four-stage pipeline and one pool. */
export async function seedClub(opts: { budget?: string } = {}) {
  const [org] = await db
    .insert(organization)
    .values({ name: "Test Ventures", slug: `test-${randomUUID().slice(0, 8)}`, ingestSecret: "ingest-secret" })
    .returning();

  const people = {} as Record<MemberRole, Person>;
  for (const role of ["admin", "partner", "analyst", "read_only"] as const) {
    people[role] = await addMember(org.id, role);
  }

  const stages = await db
    .insert(pipelineStage)
    .values([
      { orgId: org.id, name: "Applied", slug: "applied", position: "1", kind: "active", isEntryStage: true },
      { orgId: org.id, name: "Decision", slug: "decision", position: "2", kind: "active" },
      { orgId: org.id, name: "Funded", slug: "funded", position: "3", kind: "won" },
      { orgId: org.id, name: "Declined", slug: "declined", position: "4", kind: "lost" },
    ])
    .returning();

  const [pool] = await db
    .insert(grantPool)
    .values({ orgId: org.id, name: "FY Pool", fiscalYear: 2026, totalBudget: opts.budget ?? "1000.00" })
    .returning();

  return { org, people, stages, pool };
}

export async function addMember(orgId: string, role: MemberRole, extra: Partial<typeof member.$inferInsert> = {}) {
  const id = randomUUID();
  const email = `${role}-${id.slice(0, 6)}@club.test`;
  await db.insert(user).values({ id, name: role, email, emailVerified: true });
  const [row] = await db
    .insert(member)
    .values({
      orgId,
      userId: id,
      email,
      displayName: `${role} person`,
      role,
      status: "active",
      onboardedAt: new Date(),
      ...extra,
    })
    .returning();
  return { member: row, as: { user: { id, email, name: role } } } satisfies Person;
}

let ref = 0;

export async function addApplication(orgId: string, stageId: string, name = "Acme") {
  const [co] = await db.insert(company).values({ orgId, name }).returning();
  const [app] = await db
    .insert(application)
    .values({ orgId, ref: ++ref, companyId: co.id, stageId, amountRequested: "500.00" })
    .returning();
  return { company: co, application: app };
}

export async function addProposedGrant(orgId: string, poolId: string, companyId: string, amount: string, applicationId?: string) {
  const [row] = await db
    .insert(grant)
    .values({ orgId, poolId, companyId, applicationId, amountAwarded: amount, status: "proposed" })
    .returning();
  return row;
}

/** A circulated memo with a vote round in the given state. */
export async function addVoteRound(
  orgId: string,
  applicationId: string,
  authorMemberId: string,
  voters: string[],
  status: "open" | "closed" | "revealed" = "open"
) {
  const [m] = await db
    .insert(memo)
    .values({ orgId, ref: ++ref, applicationId, title: "Memo", status: "circulated", authorMemberId })
    .returning();
  const [round] = await db
    .insert(voteRound)
    .values({
      orgId,
      applicationId,
      memoId: m.id,
      title: "IC vote",
      status,
      opensAt: new Date(Date.now() - 3_600_000),
      closesAt: new Date(Date.now() + 3_600_000),
      ...(status === "revealed" ? { revealedAt: new Date() } : {}),
    })
    .returning();
  await db.insert(voteEligibility).values(voters.map((memberId) => ({ voteRoundId: round.id, memberId })));
  return { memo: m, round };
}

export async function castBallot(roundId: string, memberId: string, decision: "fund" | "decline" | "abstain" = "fund") {
  await db.insert(vote).values({ voteRoundId: roundId, memberId, decision, conviction: 4, rationale: "because" });
}
