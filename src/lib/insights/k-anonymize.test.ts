import { describe, it, expect } from "vitest";
import { kAnonymize, SUPPRESSED_LABEL } from "./k-anonymize";

describe("kAnonymize (the demographic suppression guard)", () => {
  it("passes large buckets through, sorted descending", () => {
    const out = kAnonymize([
      { label: "A", count: 8 },
      { label: "B", count: 12 },
    ]);
    expect(out).toEqual([
      { label: "B", count: 12 },
      { label: "A", count: 8 },
    ]);
  });

  it("collapses small buckets into the suppressed bucket", () => {
    const out = kAnonymize([
      { label: "A", count: 10 },
      { label: "B", count: 3 },
      { label: "C", count: 2 },
    ]);
    expect(out).toEqual([
      { label: "A", count: 10 },
      { label: SUPPRESSED_LABEL, count: 5 },
    ]);
    expect(out.find((b) => b.label === "B")).toBeUndefined();
  });

  it("drops the suppressed bucket entirely when it's still under the threshold", () => {
    const out = kAnonymize([
      { label: "A", count: 10 },
      { label: "B", count: 2 },
      { label: "C", count: 1 },
    ]);
    // 3 suppressed people < minCell 5 → not even the aggregate is shown.
    expect(out).toEqual([{ label: "A", count: 10 }]);
  });

  it("a single small bucket disappears completely", () => {
    expect(kAnonymize([{ label: "A", count: 2 }])).toEqual([]);
  });

  it("boundary: exactly minCell is shown", () => {
    expect(kAnonymize([{ label: "A", count: 5 }])).toEqual([{ label: "A", count: 5 }]);
  });

  it("zero-count buckets contribute nothing", () => {
    expect(kAnonymize([{ label: "A", count: 0 }])).toEqual([]);
  });

  it("empty input", () => {
    expect(kAnonymize([])).toEqual([]);
  });

  it("respects a custom minCell", () => {
    const out = kAnonymize([{ label: "A", count: 3 }], 3);
    expect(out).toEqual([{ label: "A", count: 3 }]);
  });

  it("no output bucket except the suppressed one is ever below minCell", () => {
    // Fuzz-ish sweep over deterministic inputs.
    for (let n = 0; n < 50; n++) {
      const buckets = Array.from({ length: (n % 7) + 1 }, (_, i) => ({
        label: `b${i}`,
        count: (n * 7 + i * 13) % 11,
      }));
      for (const b of kAnonymize(buckets)) {
        if (b.label !== SUPPRESSED_LABEL) {
          expect(b.count).toBeGreaterThanOrEqual(5);
        }
      }
    }
  });
});
