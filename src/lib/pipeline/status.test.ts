import { describe, expect, it } from "vitest";
import { statusPatchForMove } from "./status";

describe("statusPatchForMove", () => {
  it("reopens a declined application moved back to an active stage", () => {
    expect(statusPatchForMove("declined", "active")).toEqual({
      status: "open",
      decidedAt: "clear",
      clearDecline: true,
      reopened: true,
    });
  });

  it("reopens a funded application moved back to an active stage", () => {
    const patch = statusPatchForMove("funded", "active");
    expect(patch.status).toBe("open");
    expect(patch.reopened).toBe(true);
    expect(patch.decidedAt).toBe("clear");
  });

  it("leaves decision fields alone on an ordinary open → active move", () => {
    expect(statusPatchForMove("open", "active")).toEqual({
      status: "open",
      decidedAt: "keep",
      clearDecline: false,
      reopened: false,
    });
  });

  it("brings an on-hold application back to open in an active stage", () => {
    const patch = statusPatchForMove("on_hold", "active");
    expect(patch.status).toBe("open");
    expect(patch.reopened).toBe(false);
  });

  it("declines on a lost stage and keeps the reason the caller is about to write", () => {
    expect(statusPatchForMove("open", "lost")).toEqual({
      status: "declined",
      decidedAt: "set",
      clearDecline: false,
      reopened: false,
    });
  });

  it("funds on a won stage and drops any stale decline reason", () => {
    expect(statusPatchForMove("declined", "won")).toEqual({
      status: "funded",
      decidedAt: "set",
      clearDecline: true,
      reopened: false,
    });
  });

  it("parks on a parked stage", () => {
    expect(statusPatchForMove("open", "parked").status).toBe("on_hold");
    expect(statusPatchForMove("declined", "parked")).toMatchObject({
      status: "on_hold",
      reopened: true,
      clearDecline: true,
    });
  });
});
