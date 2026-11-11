import { describe, expect, it } from "vitest";
import { cleanMoney, groupThousands } from "./money-input";

describe("cleanMoney", () => {
  it("keeps digits and a single decimal point", () => {
    expect(cleanMoney("$1,500.509")).toBe("1500.50");
    expect(cleanMoney("12.3.4")).toBe("12.34");
    expect(cleanMoney("abc")).toBe("");
    expect(cleanMoney("2400.")).toBe("2400.");
  });

  it("drops the fraction for whole-dollar fields", () => {
    expect(cleanMoney("1,500.75", 0)).toBe("1500");
  });
});

describe("groupThousands", () => {
  it("groups the whole part without touching the fraction", () => {
    expect(groupThousands("1234567.5")).toBe("1,234,567.5");
    expect(groupThousands("999")).toBe("999");
    expect(groupThousands("1000.")).toBe("1,000.");
    expect(groupThousands("")).toBe("");
  });
});
