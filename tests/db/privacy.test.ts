import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { actAs } from "./world";
import { seedClub } from "./fixtures";
import {
  activity,
  application,
  applicationDemographics,
  applicationNote,
  company,
  contact,
} from "../../src/db/schema";
import { addApplicationNote } from "../../src/lib/actions/applications";
import { eraseApplicantData } from "../../src/lib/actions/privacy";
import { archiveCapTable, createCapTable } from "../../src/lib/actions/captable";
import { intakeSchema, receiveApplication } from "../../src/lib/intake";
import { getActivityLog } from "../../src/lib/queries/activity-log";

async function apply(org: Parameters<typeof receiveApplication>[0], overrides: Record<string, unknown> = {}) {
  const result = await receiveApplication(
    org,
    intakeSchema.parse({
      companyName: "Nimbus Kites",
      website: "nimbuskites.example",
      pitchSummary: "Maya here. We build kites that log wind data for the sailing team.",
      useOfFunds: "Sensors and a season of testing.",
      amountRequested: 900,
      applicantName: "Maya Okafor",
      applicantEmail: "maya@nimbuskites.example",
      major: "Aerospace",
      classYear: 2027,
      howHeard: "My roommate Dev is in the club",
      consentAt: new Date().toISOString(),
      demographics: { gender: "woman", firstGeneration: true },
      ...overrides,
    }),
    "form",
    () => {}
  );
  if (!result.ok) throw new Error("intake failed");
  return result.applicationId;
}

describe(`erasure (${driver})`, () => {
  it("records consent, then removes every personal detail on request and keeps the numbers", async () => {
    const { org, people } = await seedClub();
    const appId = await apply(org);
    const [before] = await db.select().from(application).where(eq(application.id, appId));
    expect(before.consentAt).not.toBeNull();
    await db.insert(contact).values({ orgId: org.id, companyId: before.companyId, firstName: "Maya", lastName: "Okafor", email: "maya@nimbuskites.example" });
    await actAs(people.analyst.as, () => addApplicationNote({ applicationId: appId, body: "Maya seemed nervous but sharp." }));

    // Only an admin may erase.
    expect(await actAs(people.partner.as, () => eraseApplicantData({ applicationId: appId }))).toMatchObject({ ok: false, code: "forbidden" });
    expect(await actAs(people.admin.as, () => eraseApplicantData({ applicationId: appId }))).toMatchObject({ ok: true });

    const [after] = await db.select().from(application).where(eq(application.id, appId));
    expect(after).toMatchObject({
      applicantName: null, applicantEmail: null, pitchSummary: null, useOfFundsNarrative: null,
      major: null, classYear: null, howHeard: null, custom: { erased: true },
    });
    expect(after.erasedAt).not.toBeNull();
    // What the club's books need is still there.
    expect(after.amountRequested).toBe("900.00");
    expect(after.ref).toBe(before.ref);
    expect(after.stageId).toBe(before.stageId);

    expect(await db.select().from(applicationDemographics)).toHaveLength(0);
    expect(await db.select().from(applicationNote)).toHaveLength(0);
    expect(await db.select().from(contact)).toHaveLength(0);
    const [co] = await db.select().from(company).where(eq(company.id, before.companyId));
    expect(co.name).toMatch(/^Erased applicant \(APP-/);
    expect(co.domain).toBeNull();

    // Nothing anywhere in the club's records still names her or the company.
    const everything = JSON.stringify({
      apps: await db.select().from(application),
      companies: await db.select().from(company),
      log: await db.select().from(activity),
    });
    for (const word of ["Maya", "Okafor", "Nimbus", "nimbuskites", "Aerospace", "roommate"]) {
      expect(everything).not.toContain(word);
    }
    // The erasure itself is on the record, without the name.
    const log = await db.select().from(activity).where(eq(activity.verb, "application.personal_data_erased"));
    expect(log).toHaveLength(1);

    // Once only.
    expect((await actAs(people.admin.as, () => eraseApplicantData({ applicationId: appId }))).ok).toBe(false);
  });

  it("a company with another application keeps its name; only the erased application is stripped", async () => {
    const { org, people } = await seedClub();
    const first = await apply(org);
    const second = await apply(org, { applicantName: "Dev Rao", applicantEmail: "dev@nimbuskites.example", pitchSummary: "Second round for the same kites, new sensors." });
    await actAs(people.admin.as, () => eraseApplicantData({ applicationId: first }));
    const [kept] = await db.select().from(application).where(eq(application.id, second));
    expect(kept.applicantName).toBe("Dev Rao");
    const [co] = await db.select().from(company).where(eq(company.id, kept.companyId));
    expect(co.name).toBe("Nimbus Kites");
  });
});

describe(`activity log (${driver})`, () => {
  it("changes with no hand-written summary are still recorded, and the log filters and pages", async () => {
    const { org, people } = await seedClub();
    const appId = await apply(org);
    const [app] = await db.select().from(application).where(eq(application.id, appId));
    const created = await actAs(people.analyst.as, () => createCapTable({ companyId: app.companyId, name: "Seed model" }));
    expect(created.ok).toBe(true);
    const capTableId = (created as { ok: true; data: { capTableId: string } }).data.capTableId;
    expect((await actAs(people.analyst.as, () => archiveCapTable({ capTableId }))).ok).toBe(true);

    const all = await getActivityLog(org.id, {});
    const archived = all.entries.find((e) => e.verb === "cap_table.archived");
    expect(archived).toMatchObject({ entityType: "cap_table", entityId: capTableId, actorName: people.analyst.member.displayName });
    expect(archived!.summary).toBe(`${people.analyst.member.displayName} archived a cap table`);

    expect((await getActivityLog(org.id, { type: "cap_table" })).entries.every((e) => e.entityType === "cap_table")).toBe(true);
    expect((await getActivityLog(org.id, { actor: "system" })).entries.every((e) => e.actorName === null)).toBe(true);
    expect((await getActivityLog(org.id, { q: "archived a cap" })).entries).toHaveLength(1);
    expect((await getActivityLog(org.id, { q: "100%_no_match" })).entries).toHaveLength(0);
    // Another club's log is its own.
    const other = await seedClub();
    expect((await getActivityLog(other.org.id, {})).entries).toHaveLength(0);
  });
});
