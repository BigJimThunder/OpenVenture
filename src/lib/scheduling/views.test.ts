import { describe, expect, it } from "vitest";
import type { Presence } from "./engine";
import { zonedToUtc } from "./time";
import { viewPresence } from "./views";

const NY = "America/New_York";
const busy = (kind: "class" | "busy" | "meeting" | "coffee_chat", label: string): Presence => ({
  memberId: "dan",
  state: "busy",
  soft: false,
  stranded: false,
  conflict: {
    kind,
    label,
    start: zonedToUtc("2026-11-12", 830, NY),
    end: zonedToUtc("2026-11-12", 930, NY),
    rawStart: zonedToUtc("2026-11-12", 840, NY),
    rawEnd: zonedToUtc("2026-11-12", 920, NY),
  },
});

describe("viewPresence", () => {
  it("hides a class name from other members and reports the class's own times, not the buffer", () => {
    expect(viewPresence(busy("class", "ECON 201"), { memberId: "ana", isAdmin: false }, NY).conflict).toEqual({
      kind: "class",
      label: null,
      startMinute: 840,
      endMinute: 920,
    });
    expect(viewPresence(busy("busy", "Therapy"), { memberId: "ana", isAdmin: false }, NY).conflict?.label).toBeNull();
  });

  it("shows it to the member themselves and to admins", () => {
    expect(viewPresence(busy("class", "ECON 201"), { memberId: "dan", isAdmin: false }, NY).conflict?.label).toBe("ECON 201");
    expect(viewPresence(busy("class", "ECON 201"), { memberId: "ana", isAdmin: true }, NY).conflict?.label).toBe("ECON 201");
  });

  it("shows club meetings and coffee chats to everyone", () => {
    expect(viewPresence(busy("meeting", "General meeting"), { memberId: "ana", isAdmin: false }, NY).conflict?.label).toBe(
      "General meeting"
    );
    expect(viewPresence(busy("coffee_chat", "Acme"), { memberId: "ana", isAdmin: false }, NY).conflict?.label).toBe("Acme");
  });

  it("passes free people through untouched, and midnight ends as 1440", () => {
    const free: Presence = { memberId: "dan", state: "free", soft: true, stranded: false, conflict: null };
    expect(viewPresence(free, { memberId: "ana", isAdmin: false }, NY)).toEqual({
      memberId: "dan",
      state: "free",
      soft: true,
      conflict: null,
    });
    const late = busy("class", "Night lab");
    late.conflict!.rawEnd = zonedToUtc("2026-11-13", 0, NY);
    expect(viewPresence(late, { memberId: "dan", isAdmin: false }, NY).conflict?.endMinute).toBe(1440);
  });
});
