"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldChrome } from "./input";

type TextareaProps = React.ComponentProps<"textarea"> & {
  /**
   * Grow with the text instead of scrolling inside a small box (default).
   * Starts at `rows` (or three lines) and stops at 40% of the screen. Pass
   * false for a fixed-height box with a resize handle.
   */
  autoGrow?: boolean;
  /** With `maxLength`: show "120 / 500" under the box, turning amber near the limit. */
  showCount?: boolean;
};

function Textarea({ className, autoGrow = true, showCount = false, onChange, ref, ...props }: TextareaProps) {
  const inner = React.useRef<HTMLTextAreaElement | null>(null);
  const [typed, setTyped] = React.useState<number | null>(null);

  const fit = React.useCallback(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    // Hidden (closed tab, collapsed panel): nothing to measure yet.
    if (el.scrollHeight === 0) return;
    // scrollHeight excludes the border; without it the last line clips by 2px.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [autoGrow]);

  // Covers controlled values changing from outside (reset after submit, AI draft).
  React.useLayoutEffect(fit, [fit, props.value]);

  // Line wrapping changes with width, and a box that mounted hidden has to be measured once it shows.
  React.useEffect(() => {
    const el = inner.current;
    if (!el || !autoGrow) return;
    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoGrow, fit]);

  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );

  const control = (
    <textarea
      ref={setRef}
      rows={3}
      className={cn(
        fieldChrome,
        "block px-3 py-2 leading-normal",
        autoGrow ? "max-h-[40svh] resize-none overflow-y-auto" : "min-h-18",
        className
      )}
      onChange={(e) => {
        onChange?.(e);
        if (props.value === undefined) {
          fit();
          if (showCount) setTyped(e.target.value.length);
        }
      }}
      {...props}
    />
  );

  if (!showCount || props.maxLength == null) return control;

  const length =
    typeof props.value === "string" ? props.value.length : (typed ?? String(props.defaultValue ?? "").length);
  const near = length >= props.maxLength * 0.9;
  return (
    <div className="flex w-full flex-col gap-1">
      {control}
      <span aria-hidden className={cn("tnum self-end text-2xs", near ? "text-warning" : "text-fg-subtle")}>
        {length.toLocaleString()} / {props.maxLength.toLocaleString()}
      </span>
    </div>
  );
}

export { Textarea };
