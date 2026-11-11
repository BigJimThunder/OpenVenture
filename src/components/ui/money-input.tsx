"use client";

import * as React from "react";
import { Input } from "./input";

/** Keep digits and one decimal point, at most `decimals` places. "1,500.5" → "1500.5". */
export function cleanMoney(raw: string, decimals = 2): string {
  const stripped = raw.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = stripped.split(".");
  if (rest.length === 0 || decimals === 0) return whole;
  return `${whole}.${rest.join("").slice(0, decimals)}`;
}

/** "12500.5" → "12,500.5". String arithmetic only: money is never a float here. */
export function groupThousands(value: string): string {
  if (!value) return "";
  const [whole, fraction] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

type MoneyInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "prefix"
> & {
  /** A plain decimal string: "2400", "1500.50", or "" for empty. Never a number. */
  value: string;
  onValueChange: (value: string) => void;
  /** Shown before the amount. */
  currency?: string;
  /** Decimal places accepted (default 2; 0 for whole dollars). */
  decimals?: number;
};

/**
 * A dollar amount. At rest the member sees "$ 12,500" in tabular digits; the form
 * gets the plain decimal string "12500" — through `onValueChange`, and
 * through a hidden input when `name` is set, so FormData never carries the
 * commas.
 */
function MoneyInput({
  value,
  onValueChange,
  currency = "$",
  decimals = 2,
  name,
  placeholder = "0",
  onFocus,
  onBlur,
  ...props
}: MoneyInputProps) {
  // Grouping only at rest: reformatting under the caret makes it jump.
  const [editing, setEditing] = React.useState(false);
  return (
    <>
      <Input
        {...props}
        leading={currency}
        type="text"
        inputMode={decimals === 0 ? "numeric" : "decimal"}
        autoComplete="off"
        placeholder={placeholder}
        value={editing ? value : groupThousands(value)}
        onFocus={(e) => {
          setEditing(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setEditing(false);
          onBlur?.(e);
        }}
        onChange={(e) => onValueChange(cleanMoney(e.target.value, decimals))}
      />
      {name && <input type="hidden" name={name} value={value} />}
    </>
  );
}

export { MoneyInput };
