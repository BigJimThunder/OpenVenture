import { describe, expect, it } from "vitest";
import {
  ACCEPT_ATTRIBUTE,
  chunkCountFor,
  CHUNK_BYTES,
  cleanFilename,
  fileTypeFor,
  formatBytes,
  matchesSignature,
} from "./files";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(values.flatMap((v) => (typeof v === "string" ? [...v].map((c) => c.charCodeAt(0)) : [v])));

describe("allowed files", () => {
  it("decides the type from the extension, and only for documents and pictures", () => {
    expect(fileTypeFor("Deck v3.PDF")?.mime).toBe("application/pdf");
    expect(fileTypeFor("photo.jpeg")?.mime).toBe("image/jpeg");
    expect(fileTypeFor("budget.xlsx")?.label).toBe("Excel");
    for (const name of ["page.html", "logo.svg", "run.exe", "script.js", "archive.zip", "noextension", "x.pdf.html"]) {
      expect(fileTypeFor(name), name).toBeNull();
    }
    expect(ACCEPT_ATTRIBUTE).toContain(".pdf");
    expect(ACCEPT_ATTRIBUTE).not.toContain("html");
  });

  it("checks the first bytes against the claimed type", () => {
    expect(matchesSignature("application/pdf", bytes("%PDF-1.7\n"))).toBe(true);
    expect(matchesSignature("application/pdf", bytes("<html><script>"))).toBe(false);
    expect(matchesSignature("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(matchesSignature("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature("image/jpeg", bytes(0x89, "PNG"))).toBe(false);
    expect(matchesSignature("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(
      matchesSignature("application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes("PK", 3, 4))
    ).toBe(true);
    expect(matchesSignature("text/csv", bytes("name,amount\nAcme,100\n"))).toBe(true);
    expect(matchesSignature("text/plain", bytes("MZ", 0x90, 0x00, 0x03))).toBe(false);
    expect(matchesSignature("text/html", bytes("<html>"))).toBe(false);
  });
});

describe("file helpers", () => {
  it("cleans a filename without losing it", () => {
    expect(cleanFilename("C:\\Users\\me\\Deck \"final\".pdf")).toBe("Deck final.pdf");
    expect(cleanFilename("../../etc/passwd")).toBe("passwd");
    expect(cleanFilename("\u0000\u0001")).toBe("file");
    expect(cleanFilename("a".repeat(400) + ".pdf").length).toBe(160);
  });

  it("counts chunks and formats sizes", () => {
    expect(chunkCountFor(1)).toBe(1);
    expect(chunkCountFor(CHUNK_BYTES)).toBe(1);
    expect(chunkCountFor(CHUNK_BYTES + 1)).toBe(2);
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatBytes(18 * 1024 * 1024)).toBe("18 MB");
  });
});
