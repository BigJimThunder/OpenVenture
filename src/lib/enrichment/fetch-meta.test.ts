import { describe, it, expect } from "vitest";
import { parseSiteMeta } from "./fetch-meta";

const FULL_PAGE = `<!doctype html>
<html>
<head>
  <title>Loop Labs — smarter campus laundry</title>
  <meta name="description" content="Loop Labs builds IoT sensors for shared laundry rooms.">
  <meta property="og:title" content="Loop Labs">
  <meta property="og:description" content="IoT sensors that tell you when the dryer&#39;s free &amp; your load is done.">
  <link rel="icon" href="/static/favicon.png">
  <link rel="apple-touch-icon" href="/static/touch-180.png">
  <style>body { color: red }</style>
  <script>window.analytics = "should never appear";</script>
</head>
<body>
  <h1>Never haul laundry downstairs for nothing again</h1>
  <p>Real-time machine availability for every dorm.</p>
  <svg><path d="M0 0"/></svg>
</body>
</html>`;

describe("parseSiteMeta", () => {
  const meta = parseSiteMeta(FULL_PAGE, "https://looplabs.example/");

  it("prefers og:title over <title>", () => {
    expect(meta.title).toBe("Loop Labs");
  });

  it("prefers og:description and decodes entities", () => {
    expect(meta.description).toBe(
      "IoT sensors that tell you when the dryer's free & your load is done."
    );
  });

  it("prefers the apple-touch-icon and resolves it against the page URL", () => {
    expect(meta.faviconUrl).toBe("https://looplabs.example/static/touch-180.png");
  });

  it("extracts visible text without scripts, styles, or svg", () => {
    expect(meta.textExcerpt).toContain("Never haul laundry downstairs");
    expect(meta.textExcerpt).toContain("Real-time machine availability");
    expect(meta.textExcerpt).not.toContain("should never appear");
    expect(meta.textExcerpt).not.toContain("color: red");
  });

  it("falls back to <title> and meta description when no OG tags", () => {
    const m = parseSiteMeta(
      `<head><title> Plain   Site </title><meta content="A plain description." name="description"></head>`,
      "https://plain.example/"
    );
    expect(m.title).toBe("Plain Site");
    expect(m.description).toBe("A plain description."); // attr order reversed on purpose
  });

  it("handles single-quoted and unquoted attributes", () => {
    const m = parseSiteMeta(
      `<meta property='og:description' content='Quoted differently.'><link rel=icon href=/fav.ico>`,
      "https://q.example/sub/page"
    );
    expect(m.description).toBe("Quoted differently.");
    expect(m.faviconUrl).toBe("https://q.example/fav.ico");
  });

  it("defaults the favicon to /favicon.ico when no link tag exists", () => {
    const m = parseSiteMeta(`<title>x</title>`, "https://nofav.example/");
    expect(m.faviconUrl).toBe("https://nofav.example/favicon.ico");
  });

  it("returns nulls on empty or garbage input", () => {
    const m = parseSiteMeta("", "https://empty.example/");
    expect(m.title).toBeNull();
    expect(m.description).toBeNull();
    expect(m.textExcerpt).toBeNull();
  });

  it("ignores meta tags with empty content", () => {
    const m = parseSiteMeta(
      `<meta property="og:description" content="  "><meta name="description" content="Fallback wins.">`,
      "https://e.example/"
    );
    expect(m.description).toBe("Fallback wins.");
  });

  it("drops javascript: favicon hrefs", () => {
    const m = parseSiteMeta(
      `<link rel="icon" href="javascript:alert(1)">`,
      "https://xss.example/"
    );
    expect(m.faviconUrl).toBeNull();
  });
});
