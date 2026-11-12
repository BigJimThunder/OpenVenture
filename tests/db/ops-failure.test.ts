import { describe, expect, it, vi } from "vitest";
import { driver } from "./db";
import { seedClub } from "./fixtures";
import { lastDailyRun, runDaily } from "../../src/lib/automation/run";

// One job is broken for this file.
vi.mock("../../src/lib/automation/schedule-reminders", () => ({
  scheduleReminders: async () => {
    throw new Error("schedule reminders are broken");
  },
}));

describe(`a failing job (${driver})`, () => {
  it("makes the run not ok, is recorded, and does not stop the other jobs", async () => {
    await seedClub();
    const report = await runDaily();
    expect(report.ok).toBe(false);
    const jobs = report.orgs[0].jobs;
    expect(jobs.scheduleReminders).toMatchObject({ error: expect.stringMatching(/schedule reminders are broken \(ref [0-9a-f]{8}\)/) });
    // Jobs before and after the broken one still ran.
    expect(jobs.autoCloseVotes).not.toHaveProperty("error");
    expect(jobs.housekeeping).toMatchObject({ emails: 0 });
    expect(await lastDailyRun()).toMatchObject({ ok: false, failures: 1 });
  });
});
