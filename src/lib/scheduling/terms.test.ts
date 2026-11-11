import { describe, expect, it } from "vitest";
import {
  currentTerm,
  defaultTermFor,
  previousTerm,
  suggestNextTerm,
  termForDate,
  termKeyFor,
  validateTerms,
  type Term,
} from "./terms";

const fall: Term = { key: "2026-fall", name: "Fall 2026", start: "2026-08-25", end: "2026-12-12" };
const spring: Term = { key: "2027-spring", name: "Spring 2027", start: "2027-01-13", end: "2027-05-08" };
const NY = "America/New_York";

describe("currentTerm", () => {
  it("is the term containing today", () => {
    expect(currentTerm({ terms: [spring, fall] }, new Date("2026-11-11T15:00:00Z"), NY)).toEqual(fall);
  });

  it("is the next term during a break, and the last one after everything", () => {
    expect(currentTerm({ terms: [fall, spring] }, new Date("2026-12-25T15:00:00Z"), NY)).toEqual(spring);
    expect(currentTerm({ terms: [fall, spring] }, new Date("2027-07-01T15:00:00Z"), NY)).toEqual(spring);
    expect(currentTerm({ terms: [] }, new Date(), NY)).toBeNull();
  });

  it("uses the club's date, not UTC's", () => {
    // 03:00 UTC on Aug 25 is still Aug 24 in New York: the term has not started.
    const single = { terms: [{ ...fall }, { key: "x", name: "Summer", start: "2026-06-01", end: "2026-08-24" }] };
    expect(currentTerm(single, new Date("2026-08-25T03:00:00Z"), NY)?.key).toBe("x");
    expect(currentTerm(single, new Date("2026-08-25T05:00:00Z"), NY)?.key).toBe("2026-fall");
  });
});

describe("termForDate / previousTerm", () => {
  it("includes both end days", () => {
    expect(termForDate([fall], "2026-08-25")).toEqual(fall);
    expect(termForDate([fall], "2026-12-12")).toEqual(fall);
    expect(termForDate([fall], "2026-12-13")).toBeNull();
  });

  it("finds the term before", () => {
    expect(previousTerm([spring, fall], spring)).toEqual(fall);
    expect(previousTerm([spring, fall], fall)).toBeNull();
  });
});

describe("defaults", () => {
  it("picks the term in session, or the next one in a break", () => {
    expect(defaultTermFor("semester", "2026-11-11")).toMatchObject({ key: "2026-fall", name: "Fall 2026" });
    expect(defaultTermFor("semester", "2026-06-20")).toMatchObject({ key: "2026-fall" });
    expect(defaultTermFor("semester", "2026-12-28")).toMatchObject({ key: "2027-spring" });
    expect(defaultTermFor("quarter", "2026-11-11")).toMatchObject({ key: "2026-fall", start: "2026-09-28" });
    expect(defaultTermFor("quarter", "2026-02-01")).toMatchObject({ key: "2026-winter" });
  });

  it("suggests the term after the last one on file", () => {
    expect(suggestNextTerm("semester", [fall], "2026-11-11")).toMatchObject({ key: "2027-spring" });
    expect(suggestNextTerm("quarter", [{ ...fall, start: "2026-09-28" }], "2026-11-11")).toMatchObject({
      key: "2027-winter",
      name: "Winter 2027",
    });
    expect(suggestNextTerm("semester", [], "2026-11-11")).toMatchObject({ key: "2026-fall" });
  });

  it("never suggests a term that overlaps or repeats one on file", () => {
    let terms: Term[] = [];
    for (let i = 0; i < 8; i++) terms = [...terms, suggestNextTerm("quarter", terms, "2026-11-11")];
    expect(validateTerms(terms)).toEqual([]);
    expect(new Set(terms.map((t) => t.key)).size).toBe(8);
  });

  it("makes a unique key from a typed name", () => {
    expect(termKeyFor("Fall 2026", new Set())).toBe("fall-2026");
    expect(termKeyFor("Fall 2026", new Set(["fall-2026"]))).toBe("fall-2026-2");
    expect(termKeyFor("  ", new Set())).toBe("term");
  });
});

describe("validateTerms", () => {
  it("accepts a clean list", () => {
    expect(validateTerms([fall, spring])).toEqual([]);
  });

  it("flags a term that ends before it starts", () => {
    expect(validateTerms([{ ...fall, end: "2026-08-01" }])).toEqual([
      expect.objectContaining({ key: "2026-fall", field: "end" }),
    ]);
  });

  it("flags overlaps on the later term, including a shared day", () => {
    const issues = validateTerms([fall, { ...spring, start: "2026-12-12" }]);
    expect(issues).toEqual([expect.objectContaining({ key: "2027-spring", field: "start" })]);
    expect(issues[0].message).toContain("Fall 2026");
  });

  it("flags impossible dates and blank names", () => {
    const issues = validateTerms([{ key: "a", name: " ", start: "2026-02-30", end: "2026-05-01" }]);
    expect(issues.map((i) => i.field).sort()).toEqual(["name", "start"]);
  });
});
