"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ListPlusIcon, PlusIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import {
  formatUsd,
  newItemId,
  normalizeAmount,
  reconcileItems,
  sumItems,
  type LineItem,
} from "@/lib/reports/funding-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function ItemRows({
  side,
  items,
  onChange,
}: {
  side: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}) {
  const lastName = React.useRef<HTMLInputElement>(null);
  const focusNew = React.useRef(false);
  React.useEffect(() => {
    if (focusNew.current) {
      focusNew.current = false;
      lastName.current?.focus();
    }
  }, [items.length]);

  const patch = (id: string, change: Partial<LineItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...change } : item)));
  const move = (index: number, by: -1 | 1) => {
    const next = [...items];
    const [row] = next.splice(index, 1);
    next.splice(index + by, 0, row);
    onChange(next);
  };
  const add = () => {
    focusNew.current = true;
    onChange([...items, { id: newItemId(), name: "", amount: "" }]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item, i) => (
        <div key={item.id} className="group flex items-center gap-1.5">
          <Input
            ref={i === items.length - 1 ? lastName : undefined}
            value={item.name}
            onChange={(e) => patch(item.id, { name: e.target.value })}
            placeholder="Item"
            aria-label={`${side} item ${i + 1}`}
            maxLength={200}
            className="min-w-0 flex-1 max-md:text-base"
          />
          <AmountInput
            value={item.amount}
            onCommit={(amount) => patch(item.id, { amount })}
            ariaLabel={`${side} item ${i + 1} amount`}
            onEnter={i === items.length - 1 ? add : undefined}
          />
          <div className="flex shrink-0 items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-9"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${item.name || "item"} up`}
            >
              <ArrowUpIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-9"
              disabled={i === items.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${item.name || "item"} down`}
            >
              <ArrowDownIcon />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-fg-muted hover:text-danger max-md:size-9"
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
              aria-label={`Remove ${item.name || "item"}`}
            >
              <XIcon />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="self-start text-fg-muted max-md:h-10" onClick={add}>
        <PlusIcon />
        Add item
      </Button>
    </div>
  );
}

/** Free typing while focused; stored as a clean decimal string on blur. */
function AmountInput({
  value,
  onCommit,
  ariaLabel,
  onEnter,
}: {
  value: string;
  onCommit: (amount: string) => void;
  ariaLabel: string;
  onEnter?: () => void;
}) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (value ? value.replace(/\.00$/, "") : "");
  const invalid = draft !== null && draft.trim() !== "" && normalizeAmount(draft) === "";
  const commit = () => {
    if (draft === null) return;
    onCommit(normalizeAmount(draft));
    setDraft(null);
  };
  return (
    <div className="relative w-24 shrink-0">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-fg-subtle">$</span>
      <Input
        value={shown}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            onEnter?.();
          }
        }}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        placeholder="0"
        className="tnum pl-6 text-right max-md:text-base"
      />
    </div>
  );
}

function Column({
  title,
  total,
  noun,
  items,
  onChange,
  action,
}: {
  title: string;
  total: string | null;
  /** Finishes "Items add up to $X; …". */
  noun: string;
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  action?: React.ReactNode;
}) {
  const check = reconcileItems(items, total, noun);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-h-8 items-center justify-between gap-2">
        <div className="text-sm font-medium">
          {title} <span className="tnum font-semibold">{formatUsd(total)}</span>
        </div>
        {action}
      </div>
      <ItemRows side={title} items={items} onChange={onChange} />
      {check.state !== "empty" && (
        <div
          className={cn(
            "tnum flex items-start gap-1.5 rounded-md px-2.5 py-1.5 text-xs",
            check.state === "mismatch" ? "border border-warning-border bg-warning-bg text-warning" : "text-fg-subtle"
          )}
          role={check.state === "mismatch" ? "status" : undefined}
        >
          {check.state === "mismatch" ? (
            <>
              <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
              {check.message}
            </>
          ) : check.state === "match" ? (
            `Items add up to ${formatUsd(sumItems(items))}.`
          ) : (
            `Items add up to ${formatUsd(sumItems(items))}. There is no figure to check them against yet.`
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The itemised Asked / Approved table. Totals are checked against the ask and
 * the grant rather than typed, so a memo can't go up with numbers that don't add.
 */
export function LineItemsEditor({
  askedTotal,
  approvedTotal,
  askedItems,
  approvedItems,
  onAsked,
  onApproved,
  onExtract,
  extracting,
  canExtract,
}: {
  askedTotal: string | null;
  approvedTotal: string | null;
  askedItems: LineItem[];
  approvedItems: LineItem[];
  onAsked: (items: LineItem[]) => void;
  onApproved: (items: LineItem[]) => void;
  /** Present when the founder's use-of-funds text looks like it holds a budget. */
  onExtract?: () => void;
  extracting?: boolean;
  canExtract: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Column
        title="Asked"
        total={askedTotal}
        noun="the founder asked for"
        items={askedItems}
        onChange={onAsked}
        action={
          canExtract && onExtract ? (
            <Button type="button" size="sm" variant="secondary" className="max-md:h-10" onClick={onExtract} disabled={extracting}>
              <ListPlusIcon />
              {extracting ? "Reading…" : "Extract line items"}
            </Button>
          ) : null
        }
      />
      <Column
        title="Approved"
        total={approvedTotal}
        noun="the grant is"
        items={approvedItems}
        onChange={onApproved}
        action={
          askedItems.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="max-md:h-10"
              onClick={() => onApproved(askedItems.map((item) => ({ ...item, id: newItemId() })))}
            >
              <CopyIcon />
              Copy asked
            </Button>
          ) : null
        }
      />
    </div>
  );
}
