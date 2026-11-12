import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs } from "./world";
import { addApplication, addProposedGrant, seedClub } from "./fixtures";
import { activity, grant } from "../../src/db/schema";
import { approveGrant, createGrant, issueGrant, markGrantCashed } from "../../src/lib/actions/grants";
import { atomic, guard, guardFailure, lock } from "../../src/lib/pipeline/atomic";

describe(`money (${driver})`, () => {
  it("approves a grant the pool can cover and logs it", async () => {
    const { org, people, stages, pool } = await seedClub({ budget: "1000.00" });
    const { company } = await addApplication(org.id, stages[0].id);
    const g = await addProposedGrant(org.id, pool.id, company.id, "600.00");

    const res = await actAs(people.admin.as, () => approveGrant({ grantId: g.id }));
    expect(res).toMatchObject({ ok: true });
    const [after] = await db.select().from(grant).where(eq(grant.id, g.id));
    expect(after.status).toBe("approved");
    expect(after.approvedByMemberId).toBe(people.admin.member.id);
    const log = await db.select().from(activity).where(eq(activity.verb, "grant.approved"));
    expect(log).toHaveLength(1);
  });

  it("refuses an approval that would overdraw the pool, with the exact shortfall", async () => {
    const { org, people, stages, pool } = await seedClub({ budget: "1000.00" });
    const { company } = await addApplication(org.id, stages[0].id);
    const first = await addProposedGrant(org.id, pool.id, company.id, "600.00");
    const second = await addProposedGrant(org.id, pool.id, company.id, "600.00");

    expect(await actAs(people.admin.as, () => approveGrant({ grantId: first.id }))).toMatchObject({ ok: true });
    const res = await actAs(people.admin.as, () => approveGrant({ grantId: second.id }));
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ code: "error" });
    expect((res as { error: string }).error).toMatch(/overdraw the pool by \$200\.00/);
    const [after] = await db.select().from(grant).where(eq(grant.id, second.id));
    expect(after.status).toBe("proposed");
  });

  it("two approvals racing for the same budget cannot both win", async () => {
    // Each grant alone fits; together they overdraw. Run many rounds so a
    // check-then-write implementation is caught, not just unlucky.
    for (let round = 0; round < 8; round++) {
      const { org, people, stages, pool } = await seedClub({ budget: "1000.00" });
      const { company } = await addApplication(org.id, stages[0].id, `Co ${round}`);
      const grants = await Promise.all(
        ["600.00", "600.00", "600.00"].map((amount) => addProposedGrant(org.id, pool.id, company.id, amount))
      );
      const results = await Promise.all(
        grants.map((g) => actAs(people.admin.as, () => approveGrant({ grantId: g.id })))
      );
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const [{ committed }] = await db
        .select({ committed: sql<string>`coalesce(sum(${grant.amountAwarded}), 0)` })
        .from(grant)
        .where(sql`${grant.poolId} = ${pool.id} and ${grant.status} = 'approved'`);
      expect(Number(committed)).toBeLessThanOrEqual(1000);
    }
  });

  it("the same grant approved twice at once is approved once", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { company } = await addApplication(org.id, stages[0].id);
    const g = await addProposedGrant(org.id, pool.id, company.id, "100.00");
    const results = await Promise.all(
      [1, 2, 3].map(() => actAs(people.admin.as, () => approveGrant({ grantId: g.id })))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(activity).where(eq(activity.verb, "grant.approved"))).toHaveLength(1);
  });

  it("an application gets at most one live grant, however many people propose at once", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { application } = await addApplication(org.id, stages[0].id);
    const results = await Promise.all(
      [1, 2, 3, 4].map(() =>
        actAs(people.analyst.as, () =>
          createGrant({ applicationId: application.id, poolId: pool.id, amountAwarded: 250, useOfFunds: "other" })
        )
      )
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.select().from(grant).where(eq(grant.applicationId, application.id))).toHaveLength(1);
  });

  it("status changes need the status they were offered from", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { company } = await addApplication(org.id, stages[0].id);
    const g = await addProposedGrant(org.id, pool.id, company.id, "100.00");
    // Not approved yet: cannot be issued or cashed.
    expect((await actAs(people.admin.as, () => issueGrant({ grantId: g.id, paymentMethod: "check" }))).ok).toBe(false);
    expect((await actAs(people.partner.as, () => markGrantCashed({ grantId: g.id }))).ok).toBe(false);
    await actAs(people.admin.as, () => approveGrant({ grantId: g.id }));
    const issued = await Promise.all(
      [1, 2].map(() => actAs(people.admin.as, () => issueGrant({ grantId: g.id, paymentMethod: "check" })))
    );
    expect(issued.filter((r) => r.ok)).toHaveLength(1);
  });

  it("a failed guard aborts every write in the unit", async () => {
    const { org, stages, pool } = await seedClub();
    const { company } = await addApplication(org.id, stages[0].id);
    const g = await addProposedGrant(org.id, pool.id, company.id, "100.00");
    let failure: string | null = null;
    try {
      await atomic((q) => [
        lock(q, "grant", g.id),
        q.update(grant).set({ notes: "written before the guard" }).where(eq(grant.id, g.id)),
        guard(q, sql`1 = 2`, "nope"),
        q.update(grant).set({ status: "approved" }).where(eq(grant.id, g.id)),
      ]);
    } catch (e) {
      failure = guardFailure(e);
    }
    expect(failure).toBe("nope");
    const [after] = await db.select().from(grant).where(eq(grant.id, g.id));
    expect(after.status).toBe("proposed");
    expect(after.notes).toBeNull();
    // NULL conditions fail closed too.
    await expect(atomic((q) => [guard(q, sql`null::boolean`, "null_is_no")])).rejects.toSatisfy(
      (e) => guardFailure(e) === "null_is_no"
    );
    // A passing guard lets the unit through.
    await expect(atomic((q) => [guard(q, sql`1 = 1`, "fine")])).resolves.toBeDefined();
  });
});
