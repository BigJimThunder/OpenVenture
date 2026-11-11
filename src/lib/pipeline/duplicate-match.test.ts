import { describe, expect, it } from "vitest";
import {
  matchDuplicates,
  nameSimilarity,
  normalizeCompanyName,
  normalizeDomain,
  NAME_MATCH_THRESHOLD,
  type DuplicateRow,
} from "./duplicate-match";

describe("normalizeDomain", () => {
  it("strips scheme, www, path, port and case", () => {
    expect(normalizeDomain("https://www.LectureLoop.app/pricing?x=1")).toBe("lectureloop.app");
    expect(normalizeDomain("lectureloop.app:443/")).toBe("lectureloop.app");
  });
  it("rejects things that are not a hostname", () => {
    expect(normalizeDomain("not a domain")).toBe("");
    expect(normalizeDomain("localhost")).toBe("");
    expect(normalizeDomain(null)).toBe("");
  });
});

describe("normalizeCompanyName", () => {
  it("drops legal suffixes and punctuation", () => {
    expect(normalizeCompanyName("Lecture Loop, Inc.")).toBe("lecture loop");
    expect(normalizeCompanyName("The NightOwl Security Co")).toBe("nightowl security");
  });
  it("keeps a name made only of noise words", () => {
    expect(normalizeCompanyName("Labs")).toBe("labs");
  });
});

describe("nameSimilarity", () => {
  it("treats spacing and suffix variants as identical", () => {
    expect(nameSimilarity("LectureLoop", "Lecture Loop Inc")).toBe(1);
  });
  it("scores a one-letter typo above the threshold", () => {
    expect(nameSimilarity("Quokka Health", "Quoka Health")).toBeGreaterThanOrEqual(
      NAME_MATCH_THRESHOLD
    );
  });
  it("keeps different companies with a shared word below the threshold", () => {
    expect(nameSimilarity("Ferrite Robotics", "Trailhead Robotics")).toBeLessThan(
      NAME_MATCH_THRESHOLD
    );
    expect(nameSimilarity("AquaSense", "ChirpDeck")).toBeLessThan(0.3);
  });
  it("is zero for empty input", () => {
    expect(nameSimilarity("", "Quokka")).toBe(0);
  });
});

describe("matchDuplicates", () => {
  const rows: DuplicateRow[] = [
    { applicationId: "a", ref: 1, companyName: "Lecture Loop", domain: "lectureloop.app", applicantEmail: "sam@school.edu" },
    { applicationId: "b", ref: 2, companyName: "Quokka Health", domain: null, applicantEmail: "kim@school.edu" },
    { applicationId: "c", ref: 3, companyName: "Ferrite Robotics", domain: "ferrite.dev", applicantEmail: null },
  ];

  it("matches on normalized domain first", () => {
    expect(
      matchDuplicates({ companyName: "Something Else", domain: "https://www.lectureloop.app" }, rows)
    ).toEqual([{ applicationId: "a", ref: 1, companyName: "Lecture Loop", reason: "same domain" }]);
  });

  it("matches on applicant email, case-insensitively", () => {
    expect(matchDuplicates({ companyName: "Koala", applicantEmail: "KIM@school.edu" }, rows)).toEqual([
      { applicationId: "b", ref: 2, companyName: "Quokka Health", reason: "same applicant email" },
    ]);
  });

  it("matches on a fuzzy company name", () => {
    const out = matchDuplicates({ companyName: "Ferrite Robotics Inc." }, rows);
    expect(out).toEqual([
      { applicationId: "c", ref: 3, companyName: "Ferrite Robotics", reason: "similar name" },
    ]);
  });

  it("orders domain > email > name and reports one reason per application", () => {
    const out = matchDuplicates(
      { companyName: "Quokka Health", domain: "ferrite.dev", applicantEmail: "sam@school.edu" },
      rows
    );
    expect(out.map((c) => [c.applicationId, c.reason])).toEqual([
      ["c", "same domain"],
      ["a", "same applicant email"],
      ["b", "similar name"],
    ]);
  });

  it("excludes the application being viewed and returns nothing for an empty query", () => {
    expect(matchDuplicates({ companyName: "Lecture Loop" }, rows, { excludeApplicationId: "a" })).toEqual([]);
    expect(matchDuplicates({}, rows)).toEqual([]);
    expect(matchDuplicates({ companyName: "ab" }, rows)).toEqual([]);
  });
});
