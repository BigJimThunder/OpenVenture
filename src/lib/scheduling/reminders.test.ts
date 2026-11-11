import { describe, expect, it } from "vitest";
import { manualReminderKey, reminderKey, scheduleReminderDue, termsInReminderWindow } from "./reminders";

const term = { key: "2027-spring", name: "Spring 2027", start: "2027-01-13", end: "2027-05-08" };
const due = (today: string, extra: { confirmed?: boolean; lastReminderDay?: string } = {}) =>
  scheduleReminderDue({ term, today, confirmed: false, ...extra });

describe("scheduleReminderDue", () => {
  it("opens three days before the term and closes fourteen days in", () => {
    expect(due("2027-01-09")).toBeNull();
    expect(due("2027-01-10")).toBe(1);
    expect(due("2027-01-13")).toBe(1);
    expect(due("2027-01-26")).toBe(2);
    expect(due("2027-01-27")).toBeNull();
  });

  it("moves to the second reminder six days into the term", () => {
    expect(due("2027-01-18")).toBe(1);
    expect(due("2027-01-19")).toBe(2);
  });

  it("never reminds someone who has confirmed", () => {
    expect(due("2027-01-13", { confirmed: true })).toBeNull();
  });

  it("leaves three days between reminders, automatic or manual", () => {
    expect(due("2027-01-19", { lastReminderDay: "2027-01-18" })).toBeNull();
    expect(due("2027-01-21", { lastReminderDay: "2027-01-18" })).toBe(2);
  });

  it("does not chase a schedule for a term that is already over", () => {
    expect(scheduleReminderDue({ term: { start: "2027-01-13", end: "2027-01-20" }, today: "2027-01-22", confirmed: false })).toBeNull();
  });
});

describe("keys", () => {
  it("allows two automatic reminders per member per term, and one manual per day", () => {
    expect(reminderKey("2027-spring", "m1", 1)).toBe("2027-spring:m1:1");
    expect(reminderKey("2027-spring", "m1", 2)).toBe("2027-spring:m1:2");
    expect(manualReminderKey("2027-spring", "m1", "2027-01-14")).toBe("2027-spring:m1:2027-01-14");
  });
});

describe("termsInReminderWindow", () => {
  it("finds the term about to start even while the previous one is finishing", () => {
    const fall = { key: "f", name: "Fall", start: "2026-09-28", end: "2027-01-11" };
    expect(termsInReminderWindow([fall, term], "2027-01-11").map((t) => t.key)).toEqual(["2027-spring"]);
    expect(termsInReminderWindow([fall, term], "2026-11-11")).toEqual([]);
  });
});
