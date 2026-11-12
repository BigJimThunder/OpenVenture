import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs } from "./world";
import { addApplication, addMember, addProposedGrant, seedClub } from "./fixtures";
import { activity, apiToken, applicationNote, grant, member, session } from "../../src/db/schema";
import { getCtx, withTokenAuth } from "../../src/lib/actions/context";
import { addApplicationNote } from "../../src/lib/actions/applications";
import { approveGrant, createPool } from "../../src/lib/actions/grants";
import { updateMemberRole, offboardMember } from "../../src/lib/actions/members";
import { generateToken } from "../../src/lib/mcp/tokens";
import { claimSignInMail, maySignIn } from "../../src/lib/sign-in-policy";

async function issueToken(orgId: string, memberId: string, scope: "read" | "write") {
  const t = generateToken();
  await db.insert(apiToken).values({ orgId, memberId, name: "assistant", tokenHash: t.tokenHash, prefix: t.prefix, scope });
  return { headers: { authorization: `Bearer ${t.token}` } };
}

afterEach(() => {
  delete process.env.BOOTSTRAP_ADMIN_EMAIL;
});

describe(`roles (${driver})`, () => {
  it("each action enforces its own minimum role", async () => {
    const { people } = await seedClub();
    const pool = { name: "Extra pool", fiscalYear: 2027, totalBudget: 500 };
    for (const role of ["read_only", "analyst", "partner"] as const) {
      expect(await actAs(people[role].as, () => createPool(pool))).toMatchObject({ ok: false, code: "forbidden" });
    }
    expect(await actAs(people.admin.as, () => createPool(pool))).toMatchObject({ ok: true });
    expect(await actAs({}, () => createPool(pool))).toMatchObject({ ok: false, code: "auth" });
  });

  it("a member of one club cannot act on another club's records", async () => {
    const a = await seedClub();
    const b = await seedClub();
    const { company } = await addApplication(b.org.id, b.stages[0].id);
    const theirs = await addProposedGrant(b.org.id, b.pool.id, company.id, "100.00");
    // getCtx resolves the acting member's own org; the other org's grant is invisible to it.
    const res = await actAs(a.people.admin.as, () => approveGrant({ grantId: theirs.id }));
    expect(res.ok).toBe(false);
    const [after] = await db.select().from(grant).where(eq(grant.id, theirs.id));
    expect(after.status).toBe("proposed");
  });

  it("an offboarded member is locked out at once: no context, no sessions, no tokens", async () => {
    const { org, people } = await seedClub();
    const leaver = people.analyst;
    await db.insert(session).values({
      id: "s1",
      token: "tok-1",
      userId: leaver.member.userId!,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const token = await issueToken(org.id, leaver.member.id, "write");

    expect((await actAs(people.admin.as, () => offboardMember({ memberId: leaver.member.id }))).ok).toBe(true);

    expect(await actAs(leaver.as, () => getCtx())).toBeNull();
    expect(await db.select().from(session).where(eq(session.userId, leaver.member.userId!))).toHaveLength(0);
    expect(await actAs(token, () => withTokenAuth(() => getCtx()))).toBeNull();
    const [revoked] = await db.select().from(apiToken).where(eq(apiToken.memberId, leaver.member.id));
    expect(revoked.revokedAt).not.toBeNull();
  });
});

describe(`access tokens (${driver})`, () => {
  it("a token is a credential only inside the MCP endpoint's scope", async () => {
    const { org, people } = await seedClub();
    const token = await issueToken(org.id, people.admin.member.id, "write");
    // Pages, server actions, exports and the cron route all resolve identity this way:
    expect(await actAs(token, () => getCtx())).toBeNull();
    expect(await actAs(token, () => createPool({ name: "Token pool", fiscalYear: 2027, totalBudget: 1 }))).toMatchObject({
      ok: false,
      code: "auth",
    });
    // The MCP endpoint opts in:
    const ctx = await actAs(token, () => withTokenAuth(() => getCtx()));
    expect(ctx).toMatchObject({ via: "token", tokenScope: "write" });
    expect(ctx!.member.id).toBe(people.admin.member.id);
  });

  it("a write token reaches only the actions that opted in — never money or roles", async () => {
    const { org, people, stages, pool } = await seedClub();
    const { application: app, company } = await addApplication(org.id, stages[0].id);
    const g = await addProposedGrant(org.id, pool.id, company.id, "100.00");
    const token = await issueToken(org.id, people.admin.member.id, "write");
    const viaMcp = <T>(run: () => Promise<T>) => actAs(token, () => withTokenAuth(run));

    expect(await viaMcp(() => addApplicationNote({ applicationId: app.id, body: "from my assistant" }))).toMatchObject({ ok: true });
    expect(await db.select().from(applicationNote)).toHaveLength(1);

    // The member is an admin, and could do all of this in the app. The token cannot.
    expect(await viaMcp(() => approveGrant({ grantId: g.id }))).toMatchObject({ ok: false, code: "forbidden" });
    expect(await viaMcp(() => createPool({ name: "Token pool", fiscalYear: 2027, totalBudget: 1 }))).toMatchObject({ ok: false, code: "forbidden" });
    expect(
      await viaMcp(() => updateMemberRole({ memberId: people.analyst.member.id, role: "admin" }))
    ).toMatchObject({ ok: false, code: "forbidden" });
    const [after] = await db.select().from(grant).where(eq(grant.id, g.id));
    expect(after.status).toBe("proposed");
  });

  it("a read token cannot mutate anything, opted-in or not", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    const token = await issueToken(org.id, people.partner.member.id, "read");
    const res = await actAs(token, () => withTokenAuth(() => addApplicationNote({ applicationId: app.id, body: "x" })));
    expect(res).toMatchObject({ ok: false, code: "forbidden" });
    expect(await db.select().from(applicationNote)).toHaveLength(0);
  });

  it("expired and revoked tokens resolve to nobody", async () => {
    const { org, people } = await seedClub();
    const expired = generateToken();
    await db.insert(apiToken).values({
      orgId: org.id, memberId: people.partner.member.id, name: "old", tokenHash: expired.tokenHash, prefix: expired.prefix,
      scope: "write", expiresAt: new Date(Date.now() - 1000),
    });
    const revoked = generateToken();
    await db.insert(apiToken).values({
      orgId: org.id, memberId: people.partner.member.id, name: "gone", tokenHash: revoked.tokenHash, prefix: revoked.prefix,
      scope: "write", revokedAt: new Date(),
    });
    for (const t of [expired, revoked]) {
      const who = { headers: { authorization: `Bearer ${t.token}` } };
      expect(await actAs(who, () => withTokenAuth(() => getCtx()))).toBeNull();
    }
  });
});

describe(`sign-in policy (${driver})`, () => {
  it("only invited or active members may receive a sign-in email", async () => {
    const { org, people } = await seedClub();
    const invited = await addMember(org.id, "analyst", { status: "invited", userId: null, email: "New.Member@Club.test" });
    const gone = await addMember(org.id, "analyst", { status: "alumni", offboardedAt: new Date() });

    expect(await maySignIn(people.partner.member.email)).toBe(true);
    expect(await maySignIn("new.member@club.test")).toBe(true); // case-insensitive
    expect(await maySignIn(invited.member.email.toUpperCase())).toBe(true);
    expect(await maySignIn("stranger@elsewhere.test")).toBe(false);
    expect(await maySignIn(gone.member.email)).toBe(false);
    expect(await maySignIn("")).toBe(false);
  });

  it("a fresh deployment is open to its first person — or reserved for the break-glass address", async () => {
    expect(await maySignIn("first@anywhere.test")).toBe(true);
    process.env.BOOTSTRAP_ADMIN_EMAIL = "Owner@Club.test";
    expect(await maySignIn("first@anywhere.test")).toBe(false);
    expect(await maySignIn("owner@club.test")).toBe(true);
  });

  it("one address cannot be sent sign-in emails without limit", async () => {
    await seedClub();
    const sent = [];
    for (let i = 0; i < 9; i++) sent.push(await claimSignInMail("member@club.test", "link"));
    expect(sent.filter(Boolean)).toHaveLength(6);
    // The limit is per address and per kind.
    expect(await claimSignInMail("someone-else@club.test", "link")).toBe(true);
    expect(await claimSignInMail("member@club.test", "code")).toBe(true);
  });

  it("break-glass is never silent: it is written to the activity log", async () => {
    const { org } = await seedClub();
    const outsider = await addMember(org.id, "analyst");
    process.env.BOOTSTRAP_ADMIN_EMAIL = outsider.member.email;
    const ctx = await actAs(outsider.as, () => getCtx());
    expect(ctx!.member.role).toBe("admin");
    const log = await db.select().from(activity).where(eq(activity.verb, "member.break_glass"));
    expect(log).toHaveLength(1);
    expect(log[0].summary).toContain("BOOTSTRAP_ADMIN_EMAIL");
    // Promoted once, logged once.
    await actAs(outsider.as, () => getCtx());
    expect(await db.select().from(activity).where(eq(activity.verb, "member.break_glass"))).toHaveLength(1);
    const [row] = await db.select().from(member).where(eq(member.id, outsider.member.id));
    expect(row.role).toBe("admin");
  });
});
