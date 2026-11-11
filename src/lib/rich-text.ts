import type { JSONContent } from "@tiptap/react";

/**
 * Pure helpers for the Tiptap JSON every prose surface stores (memo sections,
 * docs, report commentary). No editor, no DOM — safe on the server.
 */

export type RichDoc = JSONContent;

/** Plain text → document. Blank lines separate paragraphs; single newlines become line breaks. */
export function textToDoc(text: string): JSONContent {
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return {
    type: "doc",
    content: paragraphs.map((p) => {
      const content: JSONContent[] = [];
      p.split("\n").forEach((line, i) => {
        if (i > 0) content.push({ type: "hardBreak" });
        if (line) content.push({ type: "text", text: line });
      });
      return { type: "paragraph", content };
    }),
  };
}

function inlineText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(inlineText).join("");
}

function blockText(node: JSONContent): string[] {
  switch (node.type) {
    case "bulletList":
      return (node.content ?? []).map((li) => `- ${blockText(li).join("\n")}`);
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return (node.content ?? []).map((li, i) => `${start + i}. ${blockText(li).join("\n")}`);
    }
    case "listItem":
    case "blockquote":
    case "doc":
      return (node.content ?? []).flatMap(blockText);
    case "horizontalRule":
      return [];
    default: {
      const text = inlineText(node);
      return text ? [text] : [];
    }
  }
}

/** Document → plain text, for search mirrors, word counts, emails and AI prompts. */
export function docToText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  const out: string[] = [];
  for (const block of doc.type === "doc" ? (doc.content ?? []) : [doc]) {
    const lines = blockText(block);
    if (lines.length === 0) continue;
    const isList = block.type === "bulletList" || block.type === "orderedList";
    out.push(lines.join(isList ? "\n" : "\n\n"));
  }
  return out.join("\n\n");
}

function hasContent(node: JSONContent): boolean {
  if (node.type === "text") return (node.text ?? "").trim().length > 0;
  if (node.type === "horizontalRule") return true;
  return (node.content ?? []).some(hasContent);
}

/** True for null, an empty document, or one holding only whitespace and empty blocks. */
export function isDocEmpty(doc: JSONContent | null | undefined): boolean {
  return !doc || !hasContent(doc);
}

/**
 * Stored content → document. Memo sections keep JSON in a jsonb column, docs
 * keep it as text, and older rows may hold plain prose — accept all three.
 */
export function parseDoc(value: unknown): JSONContent | null {
  if (value == null || value === "") return null;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && (parsed as JSONContent).type === "doc") {
        return parsed as JSONContent;
      }
    } catch {
      // Not JSON: treat as prose.
    }
    return textToDoc(value);
  }
  if (typeof value === "object" && (value as JSONContent).type === "doc") return value as JSONContent;
  return null;
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * A link a member typed or pasted → an href we are willing to render, or null.
 * Bare domains get https://; anything that is not http(s), mailto or tel
 * (javascript:, data:, vbscript:…) is refused.
 */
export function safeHref(input: string | null | undefined): string | null {
  // Browsers strip tabs and newlines inside a scheme, so "java\nscript:" is live.
  const raw = (input ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!raw) return null;
  if (/^[#/](?!\/)/.test(raw)) return raw;
  const candidate = /^[a-z][a-z0-9+-]*:/i.test(raw)
    ? raw
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
      ? `mailto:${raw}`
      : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  if ((url.protocol === "http:" || url.protocol === "https:") && !url.hostname.includes(".") && url.hostname !== "localhost") {
    return null;
  }
  return candidate;
}

/**
 * Pasted HTML → something the editor's schema can read cleanly. The schema
 * already drops what it has no node or mark for (fonts, colours, tables,
 * images); this handles the constructs that would otherwise survive as junk.
 */
export function cleanPastedHtml(html: string): string {
  return (
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\/?o:p[^>]*>/gi, "")
      // Word draws list bullets as literal text in an "Ignore" span.
      .replace(/<span[^>]*mso-list:\s*Ignore[^>]*>[\s\S]*?<\/span>(?:\s*<\/span>)?/gi, "")
      .replace(/<p[^>]*class="?MsoListParagraph[^>]*>([\s\S]*?)<\/p>/gi, "<ul><li><p>$1</p></li></ul>")
      .replace(/<\/ul>\s*<ul>/gi, "")
      // Three heading levels are plenty for a memo; deeper ones fold into the last.
      .replace(/<(\/?)h[4-6](?:\s[^>]*)?>/gi, "<$1h3>")
  );
}
