"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  PilcrowIcon,
  QuoteIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditorUi } from "./toolbar";

type Chain = ReturnType<Editor["chain"]>;

const BLOCKS: { id: string; label: string; hint: string; keywords: string; icon: LucideIcon; apply: (c: Chain) => Chain }[] = [
  { id: "text", label: "Text", hint: "Plain paragraph", keywords: "text paragraph plain", icon: PilcrowIcon, apply: (c) => c.setParagraph() },
  { id: "h2", label: "Heading", hint: "Section title", keywords: "heading h2 title section", icon: Heading2Icon, apply: (c) => c.setHeading({ level: 2 }) },
  { id: "h3", label: "Subheading", hint: "Smaller title", keywords: "subheading h3 heading small", icon: Heading3Icon, apply: (c) => c.setHeading({ level: 3 }) },
  { id: "bullet", label: "Bulleted list", hint: "Points in no order", keywords: "bulleted bullet list unordered ul", icon: ListIcon, apply: (c) => c.toggleBulletList() },
  { id: "ordered", label: "Numbered list", hint: "Steps or a ranking", keywords: "numbered ordered list ol steps", icon: ListOrderedIcon, apply: (c) => c.toggleOrderedList() },
  { id: "quote", label: "Quote", hint: "Someone else's words", keywords: "quote blockquote callout", icon: QuoteIcon, apply: (c) => c.setBlockquote() },
  { id: "divider", label: "Divider", hint: "A line between parts", keywords: "divider rule line hr separator", icon: MinusIcon, apply: (c) => c.setHorizontalRule() },
];

export type SlashKeyHandler = (event: KeyboardEvent) => boolean;

/**
 * The block menu that opens when a line starts with "/". The caret stays in
 * the text; arrow keys, Enter and Escape are routed here by the editor.
 */
export function SlashMenu({
  editor,
  slash,
  wrapper,
  keyHandlerRef,
}: {
  editor: Editor;
  slash: NonNullable<EditorUi["slash"]>;
  wrapper: React.RefObject<HTMLDivElement | null>;
  keyHandlerRef: React.RefObject<SlashKeyHandler | null>;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();
  const query = slash.query.trim().toLowerCase();
  const items = BLOCKS.filter((b) => b.label.toLowerCase().startsWith(query) || b.keywords.split(" ").some((k) => k.startsWith(query)));

  // The highlight belongs to one query; typing another letter starts at the top again.
  const [cursor, setCursor] = React.useState({ query, index: 0 });
  const index = cursor.query === query ? Math.min(cursor.index, Math.max(items.length - 1, 0)) : 0;

  function pick(i: number) {
    const item = items[i];
    if (!item) return;
    const to = editor.state.selection.from;
    item.apply(editor.chain().focus().deleteRange({ from: slash.start, to })).run();
  }

  React.useEffect(() => {
    keyHandlerRef.current = (event) => {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setCursor({ query, index: (index + step + items.length) % items.length });
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        pick(index);
        return true;
      }
      return false;
    };
    return () => {
      keyHandlerRef.current = null;
    };
  });

  React.useLayoutEffect(() => {
    const el = ref.current;
    const host = wrapper.current;
    if (!el || !host) return;
    const at = editor.view.coordsAtPos(slash.start);
    const box = host.getBoundingClientRect();
    const left = Math.max(0, Math.min(at.left - box.left, box.width - el.offsetWidth));
    const below = at.bottom + 6;
    const top = below + el.offsetHeight > window.innerHeight - 8 ? at.top - el.offsetHeight - 6 : below;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top - box.top)}px)`;
    el.style.visibility = "visible";
  }, [editor, wrapper, slash.start, items.length]);

  React.useEffect(() => {
    ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <div
      ref={ref}
      id={listId}
      role="listbox"
      aria-label="Insert a block"
      className="invisible absolute top-0 left-0 z-30 max-h-80 w-60 max-w-full overflow-y-auto rounded-lg border border-border bg-panel-raised p-1 font-sans shadow-lg print:hidden"
    >
      {items.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-fg-subtle">No block called “{slash.query}”. Keep typing or press Esc.</p>
      ) : (
        items.map((item, i) => (
          <div
            key={item.id}
            role="option"
            aria-selected={i === index}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setCursor({ query, index: i })}
            onClick={() => pick(i)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 max-md:py-2",
              i === index && "bg-bg-subtle"
            )}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-fg-muted">
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm leading-tight font-medium text-fg">{item.label}</span>
              <span className="block truncate text-xs leading-tight text-fg-subtle">{item.hint}</span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}
