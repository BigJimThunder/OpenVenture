import { describe, expect, it } from "vitest";
import { cleanPastedHtml, docToText, isDocEmpty, parseDoc, safeHref, textToDoc } from "./rich-text";

describe("textToDoc", () => {
  it("splits paragraphs on blank lines and keeps single newlines as breaks", () => {
    expect(textToDoc("One\ntwo\n\n\nThree")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "One" }, { type: "hardBreak" }, { type: "text", text: "two" }] },
        { type: "paragraph", content: [{ type: "text", text: "Three" }] },
      ],
    });
  });

  it("returns one empty paragraph for blank input", () => {
    expect(textToDoc("  \n\n ")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("round-trips through docToText", () => {
    const text = "First paragraph.\n\nSecond, with\na break.";
    expect(docToText(textToDoc(text))).toBe(text);
  });
});

describe("docToText", () => {
  it("flattens headings, lists and quotes into readable text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Risks" }] },
        {
          type: "bulletList",
          content: ["Churn", "Solo founder"].map((t) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: t }] }],
          })),
        },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Third" }] }] }],
        },
        { type: "horizontalRule" },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted", marks: [{ type: "bold" }] }] }] },
      ],
    };
    expect(docToText(doc)).toBe("Risks\n\n- Churn\n- Solo founder\n\n3. Third\n\nQuoted");
  });

  it("is empty for null", () => {
    expect(docToText(null)).toBe("");
  });
});

describe("isDocEmpty", () => {
  it("treats null, empty paragraphs and whitespace as empty", () => {
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty({ type: "doc", content: [{ type: "paragraph" }, { type: "heading", attrs: { level: 2 } }] })).toBe(true);
    expect(isDocEmpty(textToDoc("   "))).toBe(true);
  });

  it("counts text and dividers as content", () => {
    expect(isDocEmpty(textToDoc("x"))).toBe(false);
    expect(isDocEmpty({ type: "doc", content: [{ type: "horizontalRule" }] })).toBe(false);
  });
});

describe("parseDoc", () => {
  it("accepts objects, JSON strings and plain prose", () => {
    const doc = textToDoc("Hello");
    expect(parseDoc(doc)).toBe(doc);
    expect(parseDoc(JSON.stringify(doc))).toEqual(doc);
    expect(parseDoc("Hello")).toEqual(doc);
    expect(parseDoc('{"not":"a doc"}')).toEqual(textToDoc('{"not":"a doc"}'));
    expect(parseDoc(null)).toBeNull();
    expect(parseDoc("")).toBeNull();
  });
});

describe("safeHref", () => {
  it("keeps web, mail and phone links and adds https to bare domains", () => {
    expect(safeHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeHref(" example.com/deck ")).toBe("https://example.com/deck");
    expect(safeHref("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeHref("founder@school.edu")).toBe("mailto:founder@school.edu");
    expect(safeHref("tel:+15551234567")).toBe("tel:+15551234567");
    expect(safeHref("/pipeline/123")).toBe("/pipeline/123");
    // Protocol-relative input never stays scheme-less.
    expect(safeHref("//other.example")).toMatch(/^https:/);
  });

  it("refuses script-capable and malformed links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>1</script>")).toBeNull();
    expect(safeHref("vbscript:x")).toBeNull();
    expect(safeHref("not a link")).toBeNull();
    expect(safeHref("")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("cleanPastedHtml", () => {
  it("strips comments and Word's o:p tags", () => {
    expect(cleanPastedHtml("<!--StartFragment--><p>Hi<o:p></o:p></p><!--EndFragment-->")).toBe("<p>Hi</p>");
  });

  it("turns Word list paragraphs into one real list", () => {
    const word =
      `<p class=MsoListParagraph style='x'><span style='mso-list:Ignore'>·<span style='font:7.0pt'>&nbsp;</span></span>One</p>` +
      `\n<p class=MsoListParagraph><span style='mso-list:Ignore'>·</span>Two</p>`;
    const out = cleanPastedHtml(word);
    expect(out.match(/<ul>/g)).toHaveLength(1);
    expect(out).toContain("<li><p>One</p></li>");
    expect(out).toContain("<li><p>Two</p></li>");
    expect(out).not.toContain("·");
  });

  it("folds deep headings into h3", () => {
    expect(cleanPastedHtml('<h5 style="color:red">Deep</h5>')).toBe("<h3>Deep</h3>");
  });
});
