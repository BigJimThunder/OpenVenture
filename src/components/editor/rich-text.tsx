"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { cleanPastedHtml, safeHref } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { RichTextView, richTextClass, type RichTextVariant } from "./rich-text-view";
import { SlashMenu, type SlashKeyHandler } from "./slash-menu";
import { BubbleToolbar, DockedToolbar, type EditorUi } from "./toolbar";
import "./rich-text.css";

export { RichTextView };
export type { RichTextVariant };

export type RichTextEditorProps = {
  /**
   * Tiptap JSON. Controlled or initial-only both work: the editor only takes a
   * new `value` when its content differs from what it last saw and from what
   * is on screen (an AI draft landing, a version being restored).
   */
  value: JSONContent | null;
  onChange: (doc: JSONContent) => void;
  placeholder?: string;
  /** "document": borderless serif page. "field": compact bordered box for notes and comments. */
  variant?: RichTextVariant;
  /** False renders the same typography statically. */
  editable?: boolean;
  className?: string;
  ariaLabel?: string;
};

const DEFAULT_PLACEHOLDER: Record<RichTextVariant, string> = {
  document: "Type / for blocks, or just start writing",
  field: "Write…",
};

const PHONE_QUERY = "(pointer: coarse), (max-width: 767px)";

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Phones get the docked toolbar; everything with a pointer gets the selection bubble. */
function useIsPhone() {
  return React.useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}

function selectUi({ editor }: { editor: Editor | null }): EditorUi | null {
  if (!editor) return null;
  const { selection } = editor.state;
  const { $from, from, to } = selection;
  let slash: EditorUi["slash"] = null;
  // Only a top-level paragraph that starts with "/" opens the block menu, so "and/or" never does.
  if (selection.empty && $from.depth === 1 && $from.parent.type.name === "paragraph") {
    const match = /^\/([a-z0-9 ]{0,24})$/i.exec($from.parent.textBetween(0, $from.parentOffset, undefined, "￼"));
    if (match) slash = { query: match[1], start: $from.start() };
  }
  const href: unknown = editor.getAttributes("link").href;
  return {
    // A selected divider is not text to format.
    empty: selection.empty || "node" in selection,
    from,
    to,
    active: {
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      link: editor.isActive("link"),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      quote: editor.isActive("blockquote"),
    },
    href: typeof href === "string" ? href : null,
    slash,
  };
}

/**
 * The one prose editor: memo sections, docs, report commentary, long notes.
 * Markdown shortcuts work as typed (`## `, `- `, `1. `, `> `, `**bold**`, `---`),
 * "/" on an empty line opens the block menu, and selecting text raises the
 * formatting bubble (a docked bar on phones). Alt+F10 moves focus into the
 * toolbar; Escape returns to the text. Saving is the caller's job.
 */
export function RichTextEditor({ editable = true, ...props }: RichTextEditorProps) {
  if (!editable) {
    return <RichTextView value={props.value} variant={props.variant} className={props.className} />;
  }
  return <LiveEditor {...props} />;
}

function LiveEditor({
  value,
  onChange,
  placeholder,
  variant = "document",
  className,
  ariaLabel,
}: Omit<RichTextEditorProps, "editable">) {
  const wrapper = React.useRef<HTMLDivElement | null>(null);
  const bar = React.useRef<HTMLDivElement | null>(null);
  const slashKey = React.useRef<SlashKeyHandler | null>(null);
  const lastEmitted = React.useRef<JSONContent | null>(value);
  const seenValue = React.useRef<{ editor: Editor; json: string | null } | null>(null);
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });
  // Read once: the placeholder is part of the editor's setup, not live state.
  const [emptyHint] = React.useState(placeholder ?? DEFAULT_PLACEHOLDER[variant]);

  const [focused, setFocused] = React.useState(false);
  const [selecting, setSelecting] = React.useState(false);
  const [linkEditing, setLinkEditing] = React.useState(false);
  const [inDialog, setInDialog] = React.useState(false);
  const [dismissedSlash, setDismissedSlash] = React.useState<number | null>(null);
  const phone = useIsPhone();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => safeHref(url) !== null,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Placeholder.configure({
        placeholder: ({ editor }) => (editor.isEmpty ? emptyHint : "Type / for blocks"),
      }),
    ],
    content: value ?? "",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      // Keeps the caret clear of the docked phone toolbar.
      scrollMargin: { top: 16, bottom: 72, left: 0, right: 0 },
      transformPastedHTML: cleanPastedHtml,
      handleKeyDown: (view, event) => {
        if (slashKey.current) {
          if (event.key === "Escape") {
            setDismissedSlash(view.state.selection.$from.start());
            return true;
          }
          if (slashKey.current(event)) return true;
        }
        if (event.altKey && event.key === "F10") {
          const first =
            bar.current?.querySelector<HTMLElement>("button") ??
            wrapper.current?.querySelector<HTMLElement>("[data-rt-toolbar] button");
          if (first) {
            first.focus();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON();
      lastEmitted.current = doc;
      onChangeRef.current(doc);
    },
  });

  // Take a new `value` only when the prop's content really changed and is not already on screen.
  React.useEffect(() => {
    if (!editor) return;
    const seen = seenValue.current;
    if (!seen || seen.editor !== editor) {
      seenValue.current = { editor, json: JSON.stringify(value ?? null) };
      return;
    }
    // Our own change echoed back by a controlled caller.
    if (value === lastEmitted.current) {
      seen.json = null;
      return;
    }
    const json = JSON.stringify(value ?? null);
    if (seen.json === json) return;
    seen.json = json;
    if (json === JSON.stringify(editor.getJSON())) return;
    lastEmitted.current = value;
    editor.commands.setContent(value ?? "", { emitUpdate: false });
  }, [editor, value]);

  React.useEffect(() => {
    const up = () => setSelecting(false);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const ui = useEditorState({ editor, selector: selectUi });

  // A dismissed menu stays closed until the member leaves that "/" and types a new one.
  if (dismissedSlash !== null && ui && ui.slash?.start !== dismissedSlash) setDismissedSlash(null);

  const slash = ui?.slash && ui.slash.start !== dismissedSlash && focused ? ui.slash : null;
  const showBubble =
    !!ui && !phone && focused && !selecting && !slash && (linkEditing || !ui.empty || Boolean(ui.href));
  const showBar = !!ui && phone && (inDialog || focused);

  const setWrapper = React.useCallback((el: HTMLDivElement | null) => {
    wrapper.current = el;
    if (el) setInDialog(Boolean(el.closest('[role="dialog"]')));
  }, []);

  return (
    <div
      ref={setWrapper}
      className={cn("rt-editor", richTextClass(variant), className)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (next && (wrapper.current?.contains(next) || bar.current?.contains(next))) return;
        setFocused(false);
        setLinkEditing(false);
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".ProseMirror")) setSelecting(true);
      }}
      onMouseDown={(e) => {
        // Clicking the padding or the space under the last line still lands in the text.
        if (editor && (e.target === e.currentTarget || e.target === e.currentTarget.firstElementChild)) {
          e.preventDefault();
          editor.commands.focus("end");
        }
      }}
    >
      <EditorContent editor={editor} />
      {editor && ui && showBubble && (
        <BubbleToolbar
          editor={editor}
          ui={ui}
          wrapper={wrapper}
          linkEditing={linkEditing}
          setLinkEditing={setLinkEditing}
        />
      )}
      {editor && slash && <SlashMenu editor={editor} slash={slash} wrapper={wrapper} keyHandlerRef={slashKey} />}
      {editor &&
        ui &&
        showBar &&
        (inDialog ? (
          <DockedToolbar
            editor={editor}
            ui={ui}
            docked={false}
            barRef={bar}
            linkEditing={linkEditing}
            setLinkEditing={setLinkEditing}
          />
        ) : (
          createPortal(
            <DockedToolbar
              editor={editor}
              ui={ui}
              docked
              barRef={bar}
              linkEditing={linkEditing}
              setLinkEditing={setLinkEditing}
            />,
            document.body
          )
        ))}
    </div>
  );
}
