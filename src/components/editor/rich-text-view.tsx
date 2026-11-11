import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { safeHref } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import "./rich-text.css";

export type RichTextVariant = "document" | "field";

export function richTextClass(variant: RichTextVariant) {
  return variant === "document" ? "rt rt-document prose-surface" : "rt rt-field";
}

function renderMarks(node: JSONContent, key: number): React.ReactNode {
  let out: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        out = <strong>{out}</strong>;
        break;
      case "italic":
        out = <em>{out}</em>;
        break;
      case "underline":
        out = <u>{out}</u>;
        break;
      case "strike":
        out = <s>{out}</s>;
        break;
      case "code":
        out = <code>{out}</code>;
        break;
      case "link": {
        const href = safeHref(typeof mark.attrs?.href === "string" ? mark.attrs.href : null);
        if (href) {
          out = (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow">
              {out}
            </a>
          );
        }
        break;
      }
    }
  }
  return <React.Fragment key={key}>{out}</React.Fragment>;
}

function renderNode(node: JSONContent, key: number): React.ReactNode {
  const children = node.content?.map(renderNode);
  switch (node.type) {
    case "text":
      return renderMarks(node, key);
    case "paragraph":
      // An empty paragraph is a deliberate blank line; keep its height.
      return <p key={key}>{children ?? <br />}</p>;
    case "heading": {
      const level = node.attrs?.level;
      const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      return <Tag key={key}>{children}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return (
        <ol key={key} start={typeof node.attrs?.start === "number" ? node.attrs.start : undefined}>
          {children}
        </ol>
      );
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    default:
      // Unknown block from a newer schema: keep its text rather than dropping it.
      return children ? <React.Fragment key={key}>{children}</React.Fragment> : null;
  }
}

/**
 * Static render of stored rich text — read mode, version history, print.
 * No hooks and no editor, so it renders on the server as well.
 */
export function RichTextView({
  value,
  className,
  variant = "document",
}: {
  value: JSONContent | null | undefined;
  className?: string;
  variant?: RichTextVariant;
}) {
  if (!value) return null;
  const blocks = value.type === "doc" ? (value.content ?? []) : [value];
  return <div className={cn(richTextClass(variant), className)}>{blocks.map(renderNode)}</div>;
}
