"use client";

import * as React from "react";
import { Trash2Icon } from "lucide-react";
import type { AvailabilityKind } from "@/db/schema";
import { BLOCK_KINDS, KIND_LABEL, MAX_LABEL_LENGTH, MIN_BLOCK_MINUTES, type ScheduleBlock } from "@/lib/scheduling/blocks";
import { inputToMinute, minuteToInput, WEEKDAY_LONG } from "@/lib/scheduling/time";
import { Field } from "@/components/patterns/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Segmented } from "./segmented";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** Edit one block: its name, kind, day and exact times. This is where a phone sets minutes. */
export function BlockDialog({
  block,
  onSave,
  onDelete,
  onClose,
}: {
  block: ScheduleBlock;
  onSave: (next: ScheduleBlock) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = React.useState(block.label ?? "");
  const [kind, setKind] = React.useState<AvailabilityKind>(block.kind);
  const [day, setDay] = React.useState(block.dayOfWeek);
  const [start, setStart] = React.useState(minuteToInput(block.startMinute));
  const [end, setEnd] = React.useState(minuteToInput(block.endMinute === 1440 ? 1439 : block.endMinute));

  const startMinute = inputToMinute(start);
  const endMinute = inputToMinute(end);
  const error =
    startMinute == null || endMinute == null
      ? "Enter both times."
      : endMinute - startMinute < MIN_BLOCK_MINUTES
        ? `It has to end at least ${MIN_BLOCK_MINUTES} minutes after it starts.`
        : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (error || startMinute == null || endMinute == null) return;
    onSave({ dayOfWeek: day, startMinute, endMinute, kind, label: label.trim() || null });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit block</DialogTitle>
          <DialogDescription>The name is only visible to you and the club&apos;s admins.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name" optional>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={MAX_LABEL_LENGTH} placeholder="ECON 201" />
          </Field>
          <Segmented
            label="Kind"
            value={kind}
            onChange={setKind}
            options={BLOCK_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
          />
          {kind === "prefer_not" && (
            <p className="text-xs text-fg-muted">
              Soft: the scheduler avoids this time but may still offer it when nothing else works.
            </p>
          )}
          <Field label="Day">
            <NativeSelect value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAY_ORDER.map((d) => (
                <option key={d} value={d}>
                  {WEEKDAY_LONG[d]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts">
              <Input type="time" step={300} required className="tnum" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Ends" error={error && start && end ? error : undefined}>
              <Input type="time" step={300} required className="tnum" value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="danger-ghost" className="max-sm:h-10" onClick={onDelete}>
              <Trash2Icon />
              Delete
            </Button>
            <Button type="submit" className="max-sm:h-11" disabled={Boolean(error)}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
