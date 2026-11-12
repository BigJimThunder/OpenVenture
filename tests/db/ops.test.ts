import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { testDb as db, driver } from "./db";
import { seedClub } from "./fixtures";
import { jobRun, member } from "../../src/db/schema";
import { lastDailyRun, runDaily } from "../../src/lib/automation/run";
import { setEmailPref } from "../../src/lib/email-prefs";
import { loadRoster } from "../../src/lib/automation/jobs";

describe(`operations (${driver})`, () => {
  it("every daily run is recorded, with who started it", async () => {
    await seedClub();
    expect(await lastDailyRun()).toBeNull();
    const report = await runDaily(new Date(), "admin");
    expect(report.ok).toBe(true);
    const last = await lastDailyRun();
    expect(last).toMatchObject({ ok: true, failures: 0, trigger: "admin" });
    expect(last!.finishedAt).not.toBeNull();
    await runDaily();
    expect(await db.select().from(jobRun)).toHaveLength(2);
    expect((await lastDailyRun())!.trigger).toBe("schedule");
  });

  it("a member's email choices are stored per kind and reach the jobs' roster", async () => {
    const { org, people } = await seedClub();
    await setEmailPref(people.analyst.member.id, "digest", false);
    await setEmailPref(people.analyst.member.id, "reminders", false);
    await setEmailPref(people.analyst.member.id, "reminders", true);
    const [row] = await db.select().from(member).where(eq(member.id, people.analyst.member.id));
    expect(row.emailPrefs).toEqual({ digest: false, reminders: true });
    const roster = await loadRoster(org.id);
    expect(roster.byId.get(people.analyst.member.id)!.emailPrefs).toEqual({ digest: false, reminders: true });
    expect(roster.byId.get(people.partner.member.id)!.emailPrefs).toEqual({});
  });
});
