import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyPipelineFilters,
  DEFAULT_FILTERS,
  parsePipelineFilters,
  type FilterableApp,
} from "./filters";

const ME = "11111111-1111-4111-8111-111111111111";
const TOM = "22222222-2222-4222-8222-222222222222";
const HEALTH = "33333333-3333-4333-8333-333333333333";

const app = (over: Partial<FilterableApp>): FilterableApp => ({
  status: "open",
  appliedAt: new Date("2025-10-01T12:00:00Z"),
  ownerId: null,
  sectorIds: [],
  priority: "none",
  ...over,
});

describe("parsePipelineFilters", () => {
  it("defaults everything and ignores junk", () => {
    expect(parsePipelineFilters({})).toEqual(DEFAULT_FILTERS);
    expect(
      parsePipelineFilters({ status: "bogus", season: "20x5", owner: "nobody", sector: "x", priority: "max" })
    ).toEqual(DEFAULT_FILTERS);
    expect(parsePipelineFilters({ status: ["open", "funded"] })).toEqual(DEFAULT_FILTERS);
  });

  it("accepts every value the filter bar can write", () => {
    expect(
      parsePipelineFilters({ status: "open", season: "2025", owner: "me", sector: HEALTH, priority: "urgent" })
    ).toEqual({ status: "open", season: "2025", owner: "me", sector: HEALTH, priority: "urgent" });
    expect(parsePipelineFilters({ owner: TOM }).owner).toBe(TOM);
    expect(parsePipelineFilters({ owner: "none" }).owner).toBe("none");
  });

  it("counts active filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, owner: "me", priority: "high" })).toBe(2);
  });
});

describe("applyPipelineFilters", () => {
  const apps = [
    app({ ownerId: ME, priority: "urgent", sectorIds: [HEALTH] }),
    app({ ownerId: TOM, status: "declined" }),
    app({ ownerId: null, appliedAt: new Date("2024-09-01T12:00:00Z"), priority: "low" }),
  ];
  const run = (over: Partial<typeof DEFAULT_FILTERS>) =>
    applyPipelineFilters(apps, { ...DEFAULT_FILTERS, ...over }, ME);

  it("returns everything by default", () => {
    expect(run({})).toHaveLength(3);
  });
  it("filters by owner: me, a member, unassigned", () => {
    expect(run({ owner: "me" })).toEqual([apps[0]]);
    expect(run({ owner: TOM })).toEqual([apps[1]]);
    expect(run({ owner: "none" })).toEqual([apps[2]]);
  });
  it("filters by sector, priority, status and season", () => {
    expect(run({ sector: HEALTH })).toEqual([apps[0]]);
    expect(run({ priority: "low" })).toEqual([apps[2]]);
    expect(run({ status: "declined" })).toEqual([apps[1]]);
    expect(run({ season: "2024" })).toEqual([apps[2]]);
  });
  it("combines filters with AND", () => {
    expect(run({ owner: "me", priority: "low" })).toEqual([]);
  });
});
