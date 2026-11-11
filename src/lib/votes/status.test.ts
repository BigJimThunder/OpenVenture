import { describe, expect, it } from "vitest";
import { effectiveRoundStatus, isAwaitingReveal, isVotingOpen } from "./status";

const now = new Date("2026-11-11T12:00:00Z");

describe("effectiveRoundStatus", () => {
  it("treats an open round past its deadline as closed", () => {
    const round = { status: "open" as const, closesAt: new Date("2026-11-11T11:59:59Z") };
    expect(effectiveRoundStatus(round, now)).toBe("closed");
    expect(isVotingOpen(round, now)).toBe(false);
    expect(isAwaitingReveal(round, now)).toBe(true);
  });

  it("keeps an open round open before its deadline, or with no deadline", () => {
    expect(effectiveRoundStatus({ status: "open", closesAt: "2026-11-12T00:00:00Z" }, now)).toBe("open");
    expect(effectiveRoundStatus({ status: "open", closesAt: null }, now)).toBe("open");
  });

  it("never reopens or un-reveals a round", () => {
    const future = "2026-12-01T00:00:00Z";
    expect(effectiveRoundStatus({ status: "closed", closesAt: future }, now)).toBe("closed");
    expect(effectiveRoundStatus({ status: "revealed", closesAt: "2026-01-01T00:00:00Z" }, now)).toBe("revealed");
    expect(isAwaitingReveal({ status: "revealed", closesAt: null }, now)).toBe(false);
    expect(isAwaitingReveal({ status: "cancelled", closesAt: null }, now)).toBe(false);
  });
});
