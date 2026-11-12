"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

/**
 * One labeled form row: label, an "Optional" tag, the control, then a hint
 * or the error that replaces it. Wires `htmlFor`, `aria-describedby` and
 * `aria-invalid` so no caller does it by hand.
 *
 *   <Field label="Company" error={errors.company}><Input name="company" /></Field>
 *
 * A single element child gets the wiring props directly. For composite
 * controls (Select, a group of buttons) pass a function and spread them on
 * the focusable part:
 *
 *   <Field label="Stage">{(p) => <Select><SelectTrigger {...p} />…</Select>}</Field>
 */
export function Field({
  label,
  hint,
  error,
  optional,
  id: idProp,
  className,
  children,
}: {
  label: React.ReactNode;
  /** One line of help under the control. Hidden while an error shows. */
  hint?: React.ReactNode;
  error?: React.ReactNode;
  /** Tags the label "Optional". Leave required fields unmarked: most are. */
  optional?: boolean;
  id?: string;
  className?: string;
  children: React.ReactElement<Partial<FieldControlProps>> | ((props: FieldControlProps) => React.ReactNode);
}) {
  const auto = React.useId();
  const childId = typeof children === "function" ? undefined : children.props.id;
  const id = idProp ?? childId ?? auto;
  const hintId = hint && !error ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control: FieldControlProps = {
    id,
    "aria-describedby": errorId ?? hintId,
    "aria-invalid": error ? true : undefined,
  };

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {optional && <span className="text-xs text-fg-subtle">Optional</span>}
      </div>
      {typeof children === "function" ? children(control) : React.cloneElement(children, control)}
      {error ? (
        <p id={errorId} role="alert" className="text-xs leading-snug text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-xs leading-snug text-fg-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

/** A switch or checkbox with its label and explanation beside it, on one tappable row. */
export function FieldToggle({
  label,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const auto = React.useId();
  const id = children.props.id ?? auto;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="flex h-5 shrink-0 items-center">
        {React.cloneElement(children, { id, "aria-describedby": hintId })}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="cursor-pointer leading-5">
          {label}
        </Label>
        {hint && (
          <p id={hintId} className="text-xs leading-snug text-fg-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
