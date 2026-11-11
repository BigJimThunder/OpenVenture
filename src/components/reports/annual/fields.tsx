"use client";

import * as React from "react";
import type { JSONContent } from "@tiptap/react";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { RichTextEditor } from "@/components/editor/rich-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isImageUrl, type Founder } from "@/lib/reports/annual";
import { cn } from "@/lib/utils";

/** A titled block of the editor column. */
export function EditorSection({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 max-w-xl text-sm text-fg-muted">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-fg-muted">{hint}</p>}
    </div>
  );
}

/**
 * Long-form writing surface: a sheet of the same serif the reader sees. The
 * `prompt` stays visible above the text — it is the brief for the writer.
 */
export function Prose({
  value,
  onChange,
  prompt,
  placeholder,
  ariaLabel,
  editable = true,
  minHeight = "min-h-28",
}: {
  value: JSONContent | null;
  onChange: (doc: JSONContent) => void;
  prompt?: React.ReactNode;
  placeholder?: string;
  ariaLabel: string;
  editable?: boolean;
  minHeight?: string;
}) {
  return (
    <div className="rounded-lg border border-border-strong bg-panel shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15">
      {prompt && (
        <div className="border-b border-border px-4 py-2 text-xs leading-relaxed text-fg-muted">{prompt}</div>
      )}
      <RichTextEditor
        value={value}
        onChange={onChange}
        editable={editable}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        className={cn("px-4 py-3 text-[0.9375rem]! leading-[1.6]!", minHeight)}
      />
    </div>
  );
}

/** A link to an image. Saves only valid http(s) links; anything else shows why and is held back. */
export function ImageUrlField({
  id,
  label,
  value,
  onCommit,
  disabled,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onCommit: (url: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const trimmed = draft.trim();
  const valid = isImageUrl(trimmed);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        valid ? (
          (hint ?? "Paste a link to an image that is already online. Uploads are not stored here.")
        ) : (
          <span className="text-danger">The link has to start with https:// or http://</span>
        )
      }
    >
      <div className="flex items-center gap-2">
        {valid && trimmed && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary external host
          <img
            src={trimmed}
            alt=""
            referrerPolicy="no-referrer"
            className="size-9 shrink-0 rounded-md border border-border bg-bg-subtle object-cover max-md:size-11"
          />
        )}
        <Input
          id={id}
          type="url"
          inputMode="url"
          value={draft}
          disabled={disabled}
          aria-invalid={!valid}
          placeholder="https://"
          onChange={(e) => {
            setDraft(e.target.value);
            const next = e.target.value.trim();
            if (isImageUrl(next) && next !== value) onCommit(next);
          }}
        />
      </div>
    </Field>
  );
}

export function MoveButtons({
  label,
  onMove,
  first,
  last,
}: {
  label: string;
  onMove: (by: -1 | 1) => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-10"
        disabled={first}
        aria-label={`Move ${label} up`}
        onClick={() => onMove(-1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="max-md:size-10"
        disabled={last}
        aria-label={`Move ${label} down`}
        onClick={() => onMove(1)}
      >
        <ArrowDownIcon />
      </Button>
    </span>
  );
}

/** Founders with class years. `value` null means "as the application has them". */
export function FoundersField({
  idPrefix,
  value,
  fallback,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: Founder[] | null;
  fallback: Founder[];
  onChange: (founders: Founder[] | null) => void;
  disabled?: boolean;
}) {
  const rows = value ?? fallback;
  const update = (index: number, patch: Partial<Founder>) =>
    onChange(rows.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>Founders</Label>
        {value !== null && !disabled && (
          <button
            type="button"
            className="cursor-pointer text-xs text-fg-muted underline-offset-2 hover:text-fg hover:underline"
            onClick={() => onChange(null)}
          >
            Reset to the application
          </button>
        )}
      </div>
      {rows.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={`Founder ${i + 1} name`}
            id={`${idPrefix}-founder-${i}`}
            value={f.name}
            disabled={disabled}
            placeholder="Name"
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            aria-label={`Founder ${i + 1} class year`}
            className="w-24 shrink-0"
            type="number"
            inputMode="numeric"
            value={f.classYear ?? ""}
            disabled={disabled}
            placeholder="Class of"
            onChange={(e) => {
              const year = Number(e.target.value);
              update(i, { classYear: year >= 1950 && year <= 2100 ? Math.round(year) : null });
            }}
          />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-10"
              aria-label={`Remove ${f.name || "founder"}`}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
            >
              <XIcon />
            </Button>
          )}
        </div>
      ))}
      {!disabled && rows.length < 8 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => onChange([...rows, { name: "", classYear: null }])}
        >
          <PlusIcon />
          Add a founder
        </Button>
      )}
    </div>
  );
}

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
