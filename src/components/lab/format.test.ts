import { describe, expect, it } from "vitest";
import type { CapEventInput } from "@/lib/captable/types";
import { POOL_ID, describeEvent, holderColors, pointChange } from "./format";

const founder = { id: "f1", name: "Jordan Lee", kind: "founder" as const };
const angel = { id: "a1", name: "Angel One", kind: "angel" as const };

describe("pointChange", () => {
  it("reports dilution in percentage points without float noise", () => {
    expect(pointChange(0.3, 0.1)).toEqual({ direction: "down", label: "−20.00 pp" });
    expect(pointChange(0.1, 0.3)).toEqual({ direction: "up", label: "+20.00 pp" });
  });

  it("treats a new holder as starting from zero", () => {
    expect(pointChange(undefined, 0.2)).toEqual({ direction: "up", label: "+20.00 pp" });
  });

  it("calls a change that rounds to zero flat", () => {
    expect(pointChange(0.5, 0.50000001)).toEqual({ direction: "flat", label: "0.00 pp" });
  });
});

describe("describeEvent", () => {
  it("reads a post-money SAFE the way a founder would say it", () => {
    expect(
      describeEvent({
        kind: "safe_issue",
        instrumentId: "s1",
        stakeholder: angel,
        principal: 500_000,
        capType: "post_money",
        valuationCap: 8_000_000,
        discount: 0.2,
        mfn: true,
      })
    ).toBe("$500,000 from Angel One · $8,000,000 post-money cap · 20% discount · MFN");
  });

  it("names the holder on a share issuance", () => {
    expect(
      describeEvent({ kind: "founding_issuance", stakeholder: founder, classId: "common", shares: 4_000_000 })
    ).toBe("4,000,000 common shares to Jordan Lee");
  });
});

describe("holderColors", () => {
  const events: CapEventInput[] = [
    {
      seq: 1,
      effectiveDate: "2026-01-01",
      payload: { kind: "founding_issuance", stakeholder: founder, classId: "common", shares: 100 },
    },
    {
      seq: 2,
      effectiveDate: "2026-01-02",
      payload: {
        kind: "safe_issue",
        instrumentId: "s1",
        stakeholder: angel,
        principal: 1,
        capType: "uncapped",
        mfn: false,
      },
    },
  ];

  it("assigns colors in ledger order and keeps them when holders are added", () => {
    const before = holderColors(events);
    const after = holderColors(events, ["new-investor"]);
    expect(before("f1")).toBe("var(--cat-1)");
    expect(before("a1")).toBe("var(--cat-2)");
    expect(after("f1")).toBe(before("f1"));
    expect(after("new-investor")).toBe("var(--cat-3)");
  });

  it("keeps the unissued pool and unknown holders neutral", () => {
    const colorOf = holderColors(events);
    expect(colorOf(POOL_ID)).toBe("var(--cat-10)");
    expect(colorOf("nobody")).toBe("var(--cat-10)");
  });
});
