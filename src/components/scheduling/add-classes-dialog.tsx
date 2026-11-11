"use client";

import * as React from "react";
import { FileUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { AvailabilityKind } from "@/db/schema";
import {
  BLOCK_KINDS,
  classesToBlocks,
  MAX_LABEL_LENGTH,
  MIN_BLOCK_MINUTES,
  type ParsedClass,
  type ScheduleBlock,
} from "@/lib/scheduling/blocks";
import { MAX_ICS_BYTES, parseIcs } from "@/lib/scheduling/ics";
import { parseClassText } from "@/lib/scheduling/parse-classes";
import type { Term } from "@/lib/scheduling/terms";
import { formatMinuteRange, inputToMinute, WEEKDAY_SHORT } from "@/lib/scheduling/time";
import { Field } from "@/components/patterns/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Segmented, ToggleChip } from "./segmented";

type Way = "form" | "paste" | "file";

const DAY_CHIPS: { day: number; label: string; name: string }[] = [
  { day: 1, label: "M", name: "Monday" },
  { day: 2, label: "T", name: "Tuesday" },
  { day: 3, label: "W", name: "Wednesday" },
  { day: 4, label: "Th", name: "Thursday" },
  { day: 5, label: "F", name: "Friday" },
  { day: 6, label: "Sa", name: "Saturday" },
  { day: 0, label: "Su", name: "Sunday" },
];

const PASTE_EXAMPLE = "ECON 201 MWF 10:30-11:20am\nCS 101 TuTh 2-3:20 PM\nStats lab Friday 1-2:50pm";

/**
 * The fast ways in. Most schedules are "MWF 10:30–11:20", so: a short form,
 * a paste box that reads lines like that, or a calendar file. Everything is
 * read in the browser and shown before it is added.
 */
export function AddClassesDialog({
  open,
  onOpenChange,
  term,
  timeZone,
  weekends,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  term: Term;
  timeZone: string;
  weekends: boolean;
  /** Returns false when the blocks did not fit (the editor explains why). */
  onAdd: (blocks: ScheduleBlock[]) => boolean;
}) {
  const [way, setWay] = React.useState<Way>("form");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add classes</DialogTitle>
          <DialogDescription>For {term.name}. Jobs, practice and anything else that repeats weekly go here too.</DialogDescription>
        </DialogHeader>
        <Segmented
          label="How to add"
          value={way}
          onChange={setWay}
          options={[
            { value: "form", label: "One class" },
            { value: "paste", label: "Paste a list" },
            { value: "file", label: "Calendar file" },
          ]}
        />
        {way === "form" && <ClassForm weekends={weekends} onAdd={onAdd} onDone={() => onOpenChange(false)} />}
        {way === "paste" && <PasteImport onAdd={onAdd} onDone={() => onOpenChange(false)} />}
        {way === "file" && <FileImport term={term} timeZone={timeZone} onAdd={onAdd} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

type AddProps = { onAdd: (blocks: ScheduleBlock[]) => boolean; onDone: () => void };

function ClassForm({ weekends, onAdd, onDone }: AddProps & { weekends: boolean }) {
  const [label, setLabel] = React.useState("");
  const [days, setDays] = React.useState<Set<number>>(new Set());
  const [start, setStart] = React.useState("10:00");
  const [end, setEnd] = React.useState("10:50");
  const [kind, setKind] = React.useState<AvailabilityKind>("class");
  const [added, setAdded] = React.useState(0);
  const nameRef = React.useRef<HTMLInputElement>(null);

  const startMinute = inputToMinute(start);
  const endMinute = inputToMinute(end);
  const timeError =
    startMinute != null && endMinute != null && endMinute - startMinute < MIN_BLOCK_MINUTES
      ? "It has to end after it starts."
      : undefined;
  const ready = days.size > 0 && startMinute != null && endMinute != null && !timeError;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || startMinute == null || endMinute == null) return;
    const ok = onAdd(
      classesToBlocks([{ label: label.trim() || null, days: [...days], startMinute, endMinute }], kind)
    );
    if (!ok) return;
    setAdded((n) => n + 1);
    // Keep the times (the next class is often the same length) and go again.
    setLabel("");
    setDays(new Set());
    nameRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Name" optional>
        <Input
          ref={nameRef}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={MAX_LABEL_LENGTH}
          placeholder="ECON 201"
          autoFocus
        />
      </Field>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-medium text-fg-muted">Days</legend>
        <div className="flex flex-wrap gap-1.5">
          {DAY_CHIPS.filter((d) => weekends || (d.day !== 0 && d.day !== 6)).map((d) => (
            <ToggleChip
              key={d.day}
              aria-label={d.name}
              pressed={days.has(d.day)}
              onPressedChange={(on) =>
                setDays((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(d.day);
                  else next.delete(d.day);
                  return next;
                })
              }
              className="min-w-11 justify-center sm:min-w-10"
            >
              {d.label}
            </ToggleChip>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <Input type="time" step={300} required className="tnum" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Ends" error={timeError}>
          <Input type="time" step={300} required className="tnum" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      <Field label="Kind">
        <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as AvailabilityKind)}>
          {BLOCK_KINDS.map((k) => (
            <option key={k} value={k}>
              {k === "class" ? "Class" : k === "busy" ? "Other busy (job, practice)" : "Prefer not (soft)"}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <DialogFooter className="sm:items-center sm:justify-between">
        <span className="tnum text-xs text-fg-muted max-sm:text-center" aria-live="polite">
          {added > 0 ? `${added} added. Add another, or close.` : ""}
        </span>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onDone}>
            {added > 0 ? "Done" : "Cancel"}
          </Button>
          <Button type="submit" className="max-sm:h-11" disabled={!ready}>
            Add
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

/** What is about to be added, one removable row per class. */
function Preview({
  classes,
  onRemove,
}: {
  classes: ParsedClass[];
  onRemove: (index: number) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {classes.map((c, i) => (
        <li key={i} className="flex items-center gap-2 py-1.5 pr-1 pl-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{c.label ?? "Class"}</div>
            <div className="tnum text-xs text-fg-muted">
              {c.days.map((d) => WEEKDAY_SHORT[d]).join(" ")} · {formatMinuteRange(c.startMinute, c.endMinute)}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="max-md:size-10"
            aria-label={`Leave out ${c.label ?? "this class"}`}
            onClick={() => onRemove(i)}
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}

function AddFooter({ count, kind = "class", onAdd, onDone, classes }: AddProps & { count: number; kind?: AvailabilityKind; classes: ParsedClass[] }) {
  return (
    <DialogFooter>
      <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onDone}>
        Cancel
      </Button>
      <Button
        type="button"
        className="max-sm:h-11"
        disabled={count === 0}
        onClick={() => {
          if (!onAdd(classesToBlocks(classes, kind))) return;
          toast.success(`Added ${count} ${count === 1 ? "class" : "classes"}`);
          onDone();
        }}
      >
        {count === 0 ? "Add" : `Add ${count} ${count === 1 ? "class" : "classes"}`}
      </Button>
    </DialogFooter>
  );
}

function PasteImport({ onAdd, onDone }: AddProps) {
  const [text, setText] = React.useState("");
  const [removed, setRemoved] = React.useState<Set<number>>(new Set());
  const parsed = React.useMemo(() => parseClassText(text), [text]);
  const classes = parsed.classes.filter((_, i) => !removed.has(i));

  return (
    <div className="flex flex-col gap-3">
      <Field
        label="Your classes, one per line"
        hint="Name, days and times in any order: “MWF”, “TuTh”, “Mon/Wed”, “2-3:20 PM”, “14:00-15:15”."
      >
        <Textarea
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setRemoved(new Set());
          }}
          placeholder={PASTE_EXAMPLE}
          className="max-md:text-base"
          autoFocus
        />
      </Field>
      {parsed.classes.length > 0 && (
        <Preview
          classes={classes}
          onRemove={(i) => {
            // Indices in the list shown map back to the unfiltered parse.
            const original = parsed.classes.indexOf(classes[i]);
            setRemoved((prev) => new Set(prev).add(original));
          }}
        />
      )}
      {parsed.unparsed.length > 0 && (
        <div role="status" className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          <div className="font-medium">
            {parsed.unparsed.length === 1
              ? "Couldn't read this line; it will be skipped:"
              : `Couldn't read these ${parsed.unparsed.length} lines; they will be skipped:`}
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {parsed.unparsed.slice(0, 6).map((line, i) => (
              <li key={i} className="truncate font-mono">
                {line}
              </li>
            ))}
            {parsed.unparsed.length > 6 && <li>and {parsed.unparsed.length - 6} more</li>}
          </ul>
        </div>
      )}
      <AddFooter count={classes.length} classes={classes} onAdd={onAdd} onDone={onDone} />
    </div>
  );
}

function FileImport({ term, timeZone, onAdd, onDone }: AddProps & { term: Term; timeZone: string }) {
  const [result, setResult] = React.useState<{ name: string; classes: ParsedClass[]; total: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function read(file: File | undefined) {
    setResult(null);
    setError(null);
    if (!file) return;
    if (file.size > MAX_ICS_BYTES) {
      setError("That file is over 1 MB. Export just this term's calendar and try again.");
      return;
    }
    const text = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      setError("That doesn't look like a calendar file. It should end in .ics.");
      return;
    }
    const parsed = parseIcs(text, term, timeZone);
    setResult({ name: file.name, classes: parsed.classes, total: parsed.total });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Upload the <span className="font-medium text-fg">.ics</span> file from your registrar, or export one from Google
        Calendar (Settings → Import &amp; export). We keep events that repeat weekly during {term.name}. The file is read
        in your browser and never uploaded; only the blocks you add are saved.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".ics,text/calendar"
        className="sr-only"
        aria-label="Calendar file"
        onChange={(e) => read(e.target.files?.[0])}
      />
      <Button type="button" variant="secondary" className="h-11 sm:h-9" onClick={() => inputRef.current?.click()}>
        <FileUpIcon />
        {result ? "Choose a different file" : "Choose a calendar file"}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {result && result.classes.length === 0 && (
        <p role="status" className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
          {result.total === 0
            ? `${result.name} has no events in it.`
            : `None of the ${result.total} events in ${result.name} repeat weekly during ${term.name}. One-off and all-day events are left out.`}
        </p>
      )}
      {result && result.classes.length > 0 && (
        <>
          <p className="tnum text-xs text-fg-muted" role="status">
            Found {result.classes.length} weekly {result.classes.length === 1 ? "event" : "events"} in {result.name}
            {result.total > result.classes.length ? `; left out ${result.total - result.classes.length} that are one-off or outside the term` : ""}
            .
          </p>
          <Preview
            classes={result.classes}
            onRemove={(i) => setResult({ ...result, classes: result.classes.filter((_, j) => j !== i) })}
          />
        </>
      )}
      <AddFooter count={result?.classes.length ?? 0} classes={result?.classes ?? []} onAdd={onAdd} onDone={onDone} />
    </div>
  );
}
