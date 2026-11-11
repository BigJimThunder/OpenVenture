"use client";

import * as React from "react";
import type { Editor } from "@tiptap/react";
import {
  BoldIcon,
  CheckIcon,
  ExternalLinkIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PencilIcon,
  QuoteIcon,
  UnlinkIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { safeHref } from "@/lib/rich-text";
import { cn } from "@/lib/utils";

export type ToolId = "bold" | "italic" | "link" | "h2" | "h3" | "bullet" | "ordered" | "quote";

/** What the toolbars and menus need to know about the editor, recomputed per transaction. */
export type EditorUi = {
  empty: boolean;
  from: number;
  to: number;
  active: Record<ToolId, boolean>;
  href: string | null;
  slash: { query: string; start: number } | null;
};

const TOOLS: { id: ToolId; label: string; hint?: string; icon: LucideIcon; group: 0 | 1 | 2 }[] = [
  { id: "bold", label: "Bold", hint: "⌘B", icon: BoldIcon, group: 0 },
  { id: "italic", label: "Italic", hint: "⌘I", icon: ItalicIcon, group: 0 },
  { id: "link", label: "Link", icon: LinkIcon, group: 0 },
  { id: "h2", label: "Heading", icon: Heading2Icon, group: 1 },
  { id: "h3", label: "Subheading", icon: Heading3Icon, group: 1 },
  { id: "bullet", label: "Bulleted list", icon: ListIcon, group: 2 },
  { id: "ordered", label: "Numbered list", icon: ListOrderedIcon, group: 2 },
  { id: "quote", label: "Quote", icon: QuoteIcon, group: 2 },
];

function runTool(editor: Editor, id: Exclude<ToolId, "link">) {
  const chain = editor.chain().focus();
  switch (id) {
    case "bold":
      return chain.toggleBold().run();
    case "italic":
      return chain.toggleItalic().run();
    case "h2":
      return chain.toggleHeading({ level: 2 }).run();
    case "h3":
      return chain.toggleHeading({ level: 3 }).run();
    case "bullet":
      return chain.toggleBulletList().run();
    case "ordered":
      return chain.toggleOrderedList().run();
    case "quote":
      return chain.toggleBlockquote().run();
  }
}

/** Arrow keys move between tools; Escape hands the caret back to the text. */
function onToolbarKeyDown(e: React.KeyboardEvent<HTMLDivElement>, editor: Editor) {
  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    editor.commands.focus();
    return;
  }
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  if (e.target instanceof HTMLInputElement) return;
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  buttons[(i + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
}

function ToolButton({
  label,
  hint,
  active,
  touch,
  onClick,
  children,
}: {
  label: string;
  hint?: string;
  active?: boolean;
  touch?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={hint ? `${label} (${hint})` : label}
      // Keep the text selection (and the phone keyboard) when a tool is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-muted outline-none transition-colors hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50 [&_svg]:size-4",
        touch ? "size-10" : "size-7",
        active && "bg-accent-subtle text-accent hover:bg-accent-subtle hover:text-accent"
      )}
    >
      {children}
    </button>
  );
}

function LinkForm({
  editor,
  initial,
  touch,
  onDone,
}: {
  editor: Editor;
  initial: string;
  touch?: boolean;
  onDone: () => void;
}) {
  const [value, setValue] = React.useState(initial);
  const [invalid, setInvalid] = React.useState(false);

  function apply() {
    if (!value.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      onDone();
      return;
    }
    const href = safeHref(value);
    if (!href) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    onDone();
  }

  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        apply();
      }}
    >
      <input
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            editor.commands.focus();
            onDone();
          }
        }}
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Paste or type a link"
        aria-label="Link address"
        aria-invalid={invalid || undefined}
        className={cn(
          "min-w-0 flex-1 rounded-md bg-bg-subtle px-2 text-sm text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-accent/50 aria-invalid:ring-2 aria-invalid:ring-danger/60",
          touch ? "h-10" : "h-7 w-56"
        )}
      />
      {invalid && (
        <span role="alert" className="sr-only">
          That is not a link we can use. Web, email and phone links only.
        </span>
      )}
      <ToolButton label="Apply link" touch={touch} onClick={apply}>
        <CheckIcon />
      </ToolButton>
      <ToolButton
        label="Cancel"
        touch={touch}
        onClick={() => {
          editor.commands.focus();
          onDone();
        }}
      >
        <XIcon />
      </ToolButton>
    </form>
  );
}

function LinkPreview({ editor, href, touch, onEdit }: { editor: Editor; href: string; touch?: boolean; onEdit: () => void }) {
  const safe = safeHref(href);
  return (
    <>
      <span className="tnum max-w-56 min-w-0 flex-1 truncate px-1.5 text-xs text-fg-muted">{href}</span>
      {safe && (
        <a
          href={safe}
          target="_blank"
          rel="noopener noreferrer nofollow"
          aria-label="Open link in a new tab"
          title="Open link"
          onMouseDown={(e) => e.preventDefault()}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-md text-fg-muted outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50 [&_svg]:size-4",
            touch ? "size-10" : "size-7"
          )}
        >
          <ExternalLinkIcon />
        </a>
      )}
      <ToolButton label="Edit link" touch={touch} onClick={onEdit}>
        <PencilIcon />
      </ToolButton>
      <ToolButton
        label="Remove link"
        touch={touch}
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
      >
        <UnlinkIcon />
      </ToolButton>
    </>
  );
}

/**
 * The formatting controls themselves — shared by the selection bubble on
 * desktop and the docked bar on phones, so both always offer the same things.
 */
export function ToolbarContent({
  editor,
  ui,
  touch,
  linkEditing,
  setLinkEditing,
}: {
  editor: Editor;
  ui: EditorUi;
  touch?: boolean;
  linkEditing: boolean;
  setLinkEditing: (v: boolean) => void;
}) {
  if (linkEditing) {
    return <LinkForm editor={editor} initial={ui.href ?? ""} touch={touch} onDone={() => setLinkEditing(false)} />;
  }
  if (ui.empty && ui.href && !touch) {
    return <LinkPreview editor={editor} href={ui.href} onEdit={() => setLinkEditing(true)} />;
  }
  return (
    <>
      {TOOLS.map((t, i) => (
        <React.Fragment key={t.id}>
          {i > 0 && TOOLS[i - 1].group !== t.group && (
            <span aria-hidden className={cn("mx-0.5 w-px shrink-0 bg-border", touch ? "h-5" : "h-4")} />
          )}
          <ToolButton
            label={t.id === "link" && ui.active.link ? "Edit link" : t.label}
            hint={t.hint}
            touch={touch}
            active={ui.active[t.id]}
            onClick={() => (t.id === "link" ? setLinkEditing(true) : runTool(editor, t.id))}
          >
            <t.icon />
          </ToolButton>
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * Desktop: floats above the selection (or below it near the top of the
 * window). Absolutely positioned inside the editor, so showing it never moves
 * the text.
 */
export function BubbleToolbar({
  editor,
  ui,
  wrapper,
  linkEditing,
  setLinkEditing,
}: {
  editor: Editor;
  ui: EditorUi;
  wrapper: React.RefObject<HTMLDivElement | null>;
  linkEditing: boolean;
  setLinkEditing: (v: boolean) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mode = linkEditing ? "edit" : ui.empty ? "preview" : "format";

  React.useLayoutEffect(() => {
    const el = ref.current;
    const host = wrapper.current;
    if (!el || !host) return;
    const start = editor.view.coordsAtPos(ui.from);
    const end = editor.view.coordsAtPos(ui.to, -1);
    const box = host.getBoundingClientRect();
    const sameLine = Math.abs(start.top - end.top) < 4;
    const mid = sameLine ? (start.left + end.right) / 2 : (start.left + box.right) / 2;
    const left = Math.max(0, Math.min(mid - box.left - el.offsetWidth / 2, box.width - el.offsetWidth));
    const above = start.top - el.offsetHeight - 8;
    // 64px keeps it clear of the sticky headers pages put above documents.
    const top = above > 64 ? above : end.bottom + 8;
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top - box.top)}px)`;
    el.style.visibility = "visible";
  }, [editor, wrapper, ui.from, ui.to, mode]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      data-rt-toolbar
      onKeyDown={(e) => onToolbarKeyDown(e, editor)}
      className="invisible absolute top-0 left-0 z-30 flex max-w-full items-center gap-0.5 rounded-lg border border-border bg-panel-raised p-1 font-sans shadow-lg print:hidden"
    >
      <ToolbarContent editor={editor} ui={ui} linkEditing={linkEditing} setLinkEditing={setLinkEditing} />
    </div>
  );
}

/**
 * Phones: a bar docked to the bottom of the visible viewport, which is the top
 * edge of the on-screen keyboard while one is open.
 */
export function DockedToolbar({
  editor,
  ui,
  docked,
  barRef,
  linkEditing,
  setLinkEditing,
}: {
  editor: Editor;
  ui: EditorUi;
  /** False inside dialogs, where the bar sits in the flow under the text instead. */
  docked: boolean;
  barRef: React.RefObject<HTMLDivElement | null>;
  linkEditing: boolean;
  setLinkEditing: (v: boolean) => void;
}) {
  React.useEffect(() => {
    const vv = window.visualViewport;
    const el = barRef.current;
    if (!docked || !vv || !el) return;
    const place = () => {
      el.style.bottom = `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`;
    };
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, [docked, barRef]);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Formatting"
      data-rt-toolbar
      onKeyDown={(e) => onToolbarKeyDown(e, editor)}
      className={cn(
        "scrollbar-none flex items-center gap-0.5 overflow-x-auto bg-panel-raised px-2 py-1 font-sans print:hidden",
        docked
          ? "fixed inset-x-0 bottom-0 z-50 border-t border-border shadow-lg"
          : "rounded-b-[inherit] border-t border-border"
      )}
    >
      <ToolbarContent editor={editor} ui={ui} touch linkEditing={linkEditing} setLinkEditing={setLinkEditing} />
    </div>
  );
}
