"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { JSONContent } from "@tiptap/react";
import { CheckIcon, LockIcon, PencilIcon, RotateCcwIcon, SendIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import {
  draftQuarterlyNarrative,
  finalizeQuarterlyLetter,
  reopenQuarterlyLetter,
  saveQuarterlyLetter,
  sendQuarterlyLetter,
} from "@/lib/actions/reports";
import { updateClubPreferences } from "@/lib/actions/settings";
import {
  DEFAULT_SALUTATION,
  QUARTERLY_PROMPTS,
  QUARTERLY_PROSE_FIELDS,
  defaultSignoff,
  type QuarterlyContent,
  type QuarterlyLetter,
  type QuarterlyPatch,
  type QuarterlyProseField,
} from "@/lib/reports/quarterly";
import { isDocEmpty } from "@/lib/rich-text";
import type { ReportStatus } from "@/db/schema";
import { RichTextEditor, RichTextView } from "@/components/editor/rich-text";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { AutoTextarea, SaveIndicator, useAutosave } from "@/components/reports/report-fields";

export type QuarterlyAi = "on" | "no_key" | "club_off";

/**
 * The quarterly letter on its sheet of paper. The figures paragraphs are
 * composed from the ledger and can't be typed over; a partner writes the
 * opening and the what's-next paragraph in place, and can add one line on why
 * to each grant. Finalized, it renders the same sheet from the frozen snapshot.
 */
export function QuarterlyLetterSheet({
  clubName,
  fiscalYear,
  quarter,
  status,
  letter,
  initialContent,
  canEdit,
  ai,
  dateline,
  lpEmails,
}: {
  clubName: string;
  fiscalYear: number;
  quarter: number;
  status: ReportStatus;
  letter: QuarterlyLetter;
  initialContent: QuarterlyContent;
  /** A partner looking at a draft. */
  canEdit: boolean;
  ai: QuarterlyAi;
  /** "November 11, 2026" */
  dateline: string;
  lpEmails: string;
}) {
  const router = useRouter();
  const [content, setContent] = React.useState(initialContent);
  const [drafting, setDrafting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const editing = canEdit && status === "draft";
  const period = { fiscalYear, quarter };

  const latest = React.useRef(content);
  React.useEffect(() => {
    latest.current = content;
  });

  const autosave = useAutosave<QuarterlyPatch>(
    (patch) => saveQuarterlyLetter({ ...period, patch }),
    (message) => toast.error(message)
  );

  function update(patch: QuarterlyPatch) {
    setContent((current) => ({ ...current, ...patch }));
    autosave.queue(patch);
  }

  function editProse(field: QuarterlyProseField, doc: JSONContent) {
    const origin = { ...latest.current.origin };
    delete origin[field];
    update({ [field]: doc as Record<string, unknown>, origin });
  }

  function accept(field: QuarterlyProseField) {
    const origin = { ...content.origin };
    delete origin[field];
    update({ origin });
  }

  async function draft() {
    const fields = QUARTERLY_PROSE_FIELDS.filter(
      (f) => isDocEmpty(content[f] as JSONContent | null) || content.origin[f] === "ai"
    );
    if (fields.length === 0) {
      toast.message("Both paragraphs already have your words in them. Clear one to draft it.");
      return;
    }
    setDrafting(true);
    await autosave.flush();
    const res = await draftQuarterlyNarrative({ ...period, fields });
    setDrafting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const filled = Object.keys(res.data.draft) as QuarterlyProseField[];
    if (filled.length === 0) {
      toast.message("Nothing came back to draft from.");
      return;
    }
    const origin = { ...latest.current.origin };
    for (const field of filled) origin[field] = "ai";
    update({ ...res.data.draft, origin });
    toast.success("Draft added. It is grounded in this quarter's figures; read it before you accept it.");
  }

  async function finalize() {
    setBusy(true);
    await autosave.flush();
    const res = await finalizeQuarterlyLetter(period);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Finalized. The figures are frozen as they stand today.");
    router.refresh();
  }

  async function reopen() {
    setBusy(true);
    const res = await reopenQuarterlyLetter(period);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Reopened as a draft. The figures are live again.");
    router.refresh();
  }

  const openingEmpty = isDocEmpty(content.opening as JSONContent | null);
  const pendingDrafts = Object.keys(content.origin).length;
  const blocker = openingEmpty
    ? "Write the opening paragraph to finalize."
    : pendingDrafts > 0
      ? "Accept or edit the AI draft to finalize."
      : null;

  const prose = (field: QuarterlyProseField) => (
    <ProseBlock
      key={field}
      field={field}
      value={content[field] as JSONContent | null}
      editing={editing}
      isDraft={content.origin[field] === "ai"}
      onChange={(doc) => editProse(field, doc)}
      onAccept={() => accept(field)}
    />
  );

  return (
    <div className="px-3 pb-16 md:px-6 print:p-0">
      {canEdit && (
        <div className="mx-auto mb-3 flex max-w-[46rem] flex-wrap items-center justify-between gap-x-3 gap-y-2 print:hidden">
          <div className="min-w-0 text-xs text-fg-subtle">
            {editing ? blocker ?? <SaveIndicator state={autosave.state} /> : null}
            {editing && blocker && autosave.state !== "idle" && (
              <span className="ml-2">
                <SaveIndicator state={autosave.state} />
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                {ai === "on" ? (
                  <Button size="sm" variant="secondary" className="max-md:h-10" onClick={draft} disabled={drafting}>
                    <SparklesIcon />
                    {drafting ? "Drafting…" : "Draft the narrative"}
                  </Button>
                ) : (
                  <span className="text-xs text-fg-subtle">
                    {ai === "no_key" ? "Add an ANTHROPIC_API_KEY to enable drafts" : "AI drafts are switched off for this club"}
                  </span>
                )}
                <Button size="sm" className="max-md:h-10" onClick={finalize} disabled={busy || blocker !== null}>
                  <LockIcon />
                  {busy ? "Finalizing…" : "Finalize"}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" className="max-md:h-10" onClick={reopen} disabled={busy}>
                  <RotateCcwIcon />
                  {busy ? "Reopening…" : "Reopen"}
                </Button>
                <SendLetter
                  fiscalYear={fiscalYear}
                  quarter={quarter}
                  lpEmails={lpEmails}
                  alreadySent={status === "sent"}
                />
              </>
            )}
          </div>
        </div>
      )}

      <article className="mx-auto max-w-[46rem] rounded-lg border border-border bg-panel px-5 py-8 shadow-sm sm:px-12 sm:py-12 print:max-w-none print:rounded-none print:border-0 print:bg-transparent print:p-0 print:text-black print:shadow-none">
        <header className="border-b border-border-strong pb-4 print:border-black/50">
          <div className="font-display text-[1.5rem] leading-tight font-semibold tracking-tight">{clubName}</div>
          <div className="tnum mt-1.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-0.5 text-xs text-fg-muted print:text-black/70">
            <span>Quarterly letter · {letter.period}</span>
            <span>{dateline}</span>
          </div>
        </header>

        <div className="prose-surface mt-7 flex max-w-none flex-col gap-4 print:text-[11pt] print:leading-[1.55]">
          {editing ? (
            <InlineInput
              value={content.salutation}
              fallback={DEFAULT_SALUTATION}
              onChange={(salutation) => update({ salutation })}
              ariaLabel="Salutation"
            />
          ) : (
            <p>{content.salutation.trim() || DEFAULT_SALUTATION}</p>
          )}

          {prose("opening")}

          {letter.toDateNote && <p className="text-fg-muted italic print:text-black/70">{letter.toDateNote}</p>}

          {letter.quiet ? (
            <p>{letter.quiet}</p>
          ) : (
            <>
              <p>{letter.deployment}</p>
              {letter.grants.map((g) => (
                <p key={g.id} className="break-inside-avoid">
                  <strong className="tnum font-semibold">
                    {g.companyName}, {g.amount}.
                  </strong>{" "}
                  {g.sentence}{" "}
                  <GrantWhy
                    companyName={g.companyName}
                    value={content.grantNotes[g.id]?.trim() || g.why}
                    editing={editing}
                    onChange={(why) => update({ grantNotes: { ...latest.current.grantNotes, [g.id]: why } })}
                  />
                </p>
              ))}
              <p>{letter.pipeline}</p>
              <p>{letter.portfolio.join(" ")}</p>
            </>
          )}

          {prose("whatsNext")}

          {editing ? (
            <InlineInput
              value={content.signoff}
              fallback={defaultSignoff(clubName)}
              onChange={(signoff) => update({ signoff })}
              ariaLabel="Sign-off"
              className="mt-3"
            />
          ) : (
            <p className="mt-3">{content.signoff.trim() || defaultSignoff(clubName)}</p>
          )}
        </div>

        <section className="mt-10 break-inside-avoid" aria-label="Figures for the quarter">
          <h2 className="border-b border-border-strong pb-1.5 text-2xs font-medium tracking-[0.06em] text-fg-muted uppercase print:border-black/50 print:text-black/70">
            Figures for the quarter
          </h2>
          <table className="w-full text-sm print:text-[9.5pt]">
            <tbody>
              {letter.table.map((row) => (
                <tr key={row.label} className="border-b border-border last:border-b-0 print:border-black/15">
                  <td className="py-1.5 pr-4 text-fg-muted print:text-black/80">{row.label}</td>
                  <td className="tnum py-1.5 text-right font-medium">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </article>
    </div>
  );
}

function ProseBlock({
  field,
  value,
  editing,
  isDraft,
  onChange,
  onAccept,
}: {
  field: QuarterlyProseField;
  value: JSONContent | null;
  editing: boolean;
  isDraft: boolean;
  onChange: (doc: JSONContent) => void;
  onAccept: () => void;
}) {
  const prompt = QUARTERLY_PROMPTS[field];
  const empty = isDocEmpty(value);
  if (!editing) {
    if (empty) {
      return field === "opening" ? (
        <p className="font-sans text-sm text-fg-subtle print:hidden">
          The partners have not written this quarter&apos;s opening yet. The figures below are live.
        </p>
      ) : null;
    }
    return <RichTextView value={value} className="max-w-none print:text-[11pt] print:leading-[1.55]" />;
  }
  return (
    <div
      className={cn(
        "-mx-3 rounded-md border px-3 py-2.5 transition-colors focus-within:border-accent/50 print:m-0 print:border-0 print:p-0",
        isDraft ? "border-info-border bg-info-bg/40" : empty ? "border-dashed border-border-strong" : "border-transparent hover:border-border"
      )}
    >
      {(empty || isDraft) && (
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2 font-sans print:hidden">
          <div className="min-w-0">
            <div className="text-xs font-medium text-fg">{prompt.question}</div>
            {empty &&
              prompt.hints.map((hint) => (
                <p key={hint} className="mt-0.5 text-xs text-fg-muted">
                  {hint}
                </p>
              ))}
          </div>
          {isDraft && (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full border border-info-border bg-info-bg px-2 py-0.5 text-2xs font-medium text-info">
                <SparklesIcon className="size-3" />
                AI draft
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 max-md:h-10" onClick={onAccept}>
                <CheckIcon />
                Looks right
              </Button>
            </div>
          )}
        </div>
      )}
      <RichTextEditor
        value={value}
        onChange={onChange}
        variant="document"
        placeholder={field === "opening" ? "Start with the thing you would say out loud" : "Next quarter we will…"}
        ariaLabel={prompt.label}
        className="max-w-none [--rt-min-h:3.5rem]"
      />
    </div>
  );
}

/** Text that reads as part of the letter and edits in place. Empty falls back to the default line. */
function InlineInput({
  value,
  fallback,
  onChange,
  ariaLabel,
  className,
}: {
  value: string;
  fallback: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={fallback}
      aria-label={ariaLabel}
      maxLength={200}
      className={cn(
        "-mx-3 w-[calc(100%+1.5rem)] rounded-md border border-transparent bg-transparent px-3 py-1 outline-none placeholder:text-fg hover:border-border focus:border-accent/50 print:m-0 print:w-full print:border-0 print:p-0 print:placeholder:text-black",
        className
      )}
    />
  );
}

/** The one line on why, per grant: pulled from the funding request or memo, reworded here if needed. */
function GrantWhy({
  companyName,
  value,
  editing,
  onChange,
}: {
  companyName: string;
  value: string | null;
  editing: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  if (!editing) return value ? <>{value}</> : null;
  if (open) {
    return (
      <AutoTextarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setOpen(false);
          if (draft.trim() !== (value ?? "")) onChange(draft.trim());
        }}
        maxLength={600}
        aria-label={`Why we funded ${companyName}`}
        placeholder={`One line on why we funded ${companyName}`}
        className="mt-1.5 font-sans print:hidden"
      />
    );
  }
  return value ? (
    <>
      {value}{" "}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Edit why we funded ${companyName}`}
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded align-middle text-fg-subtle outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 max-md:size-9 print:hidden"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="cursor-pointer rounded-sm bg-warning-bg px-1 font-sans text-[0.8125rem] text-warning outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-1.5 print:hidden"
    >
      [add: one line on why]
    </button>
  );
}

function SendLetter({
  fiscalYear,
  quarter,
  lpEmails,
  alreadySent,
}: {
  fiscalYear: number;
  quarter: number;
  lpEmails: string;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const canSaveDefault = useCan("manageClub");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [to, setTo] = React.useState(lpEmails);
  const [remember, setRemember] = React.useState(true);
  const count = to.split(/[,;\s]+/).filter((e) => /\S+@\S+\.\S+/.test(e)).length;
  const offerRemember = canSaveDefault && !lpEmails.trim();

  async function send() {
    setBusy(true);
    const res = await sendQuarterlyLetter({ fiscalYear, quarter, to });
    if (res.ok && offerRemember && remember) {
      await updateClubPreferences({ reports: { lpEmails: res.data.sentTo.join(", ") } });
    }
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Sent to ${res.data.sentTo.length} ${res.data.sentTo.length === 1 ? "person" : "people"}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={alreadySent ? "secondary" : "default"} className="max-md:h-10">
          <SendIcon />
          {alreadySent ? "Send again" : "Send to supporters"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Send the FY{fiscalYear} Q{quarter} letter
          </DialogTitle>
          <DialogDescription>
            Each person gets their own copy with the full letter in the email. Replies come to you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ql-send-to">To</Label>
          <Textarea
            id="ql-send-to"
            rows={3}
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="dana@university.edu, alumni-board@example.org"
            className="max-md:text-base"
          />
          <p className="tnum text-xs text-fg-subtle">
            {count === 0
              ? "Separate addresses with commas."
              : `${count} ${count === 1 ? "address" : "addresses"}.`}
            {!lpEmails.trim() && !canSaveDefault && " An admin can save the list in Settings → Reports."}
          </p>
          {offerRemember && (
            <label className="flex items-center gap-2 text-sm max-md:py-1.5">
              <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
              Save this list for future letters
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="max-md:h-11">
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || count === 0} className="max-md:h-11">
            {busy ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
