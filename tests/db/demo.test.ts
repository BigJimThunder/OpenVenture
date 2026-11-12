import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs } from "./world";
import { addApplication, seedClub } from "./fixtures";
import { applicationNote, organization } from "../../src/db/schema";
import { addApplicationNote } from "../../src/lib/actions/applications";
import { createPool } from "../../src/lib/actions/grants";
import { updateClubPreferences } from "../../src/lib/actions/settings";
import { demoMode, DEMO_REFUSAL } from "../../src/lib/demo";

afterEach(() => {
  delete process.env.DEMO_MODE;
});

async function markAsDemoData(orgId: string) {
  const [org] = await db
    .update(organization)
    .set({ settings: { demo: { seeded: true } } })
    .where(eq(organization.id, orgId))
    .returning();
  return org;
}

describe(`demo mode (${driver})`, () => {
  it("needs both the environment switch and seeded demo data", async () => {
    const { org } = await seedClub();
    expect(demoMode(org)).toBe(false);
    process.env.DEMO_MODE = "1";
    // The switch alone does nothing to a real club.
    expect(demoMode(org)).toBe(false);
    const marked = await markAsDemoData(org.id);
    expect(demoMode(marked)).toBe(true);
    delete process.env.DEMO_MODE;
    expect(demoMode(marked)).toBe(false);
    expect(demoMode(null)).toBe(false);
  });

  it("refuses every change, even from an admin", async () => {
    const { org, people, stages } = await seedClub();
    const { application: app } = await addApplication(org.id, stages[0].id);
    await markAsDemoData(org.id);
    process.env.DEMO_MODE = "1";

    const note = await actAs(people.admin.as, () => addApplicationNote({ applicationId: app.id, body: "hello" }));
    expect(note).toMatchObject({ ok: false, code: "error", error: DEMO_REFUSAL });
    const pool = await actAs(people.admin.as, () => createPool({ name: "Demo pool", fiscalYear: 2027, totalBudget: 5 }));
    expect(pool).toMatchObject({ ok: false, error: DEMO_REFUSAL });
    expect(await db.select().from(applicationNote)).toHaveLength(0);
  });

  it("the demo mark cannot be set through the settings a club can edit", async () => {
    const { org, people } = await seedClub();
    // The preferences action only accepts known sections; `demo` is not one.
    const res = await actAs(people.admin.as, () =>
      updateClubPreferences({ demo: { seeded: true } } as never)
    );
    const [after] = await db.select().from(organization).where(eq(organization.id, org.id));
    process.env.DEMO_MODE = "1";
    expect(demoMode(after)).toBe(false);
    expect(res.ok === false || demoMode(after) === false).toBe(true);
  });
});
