"use client";

import * as React from "react";
import { PlusIcon, RotateCcwIcon, SparklesIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  draftFundingRequestFields,
  extractFundingLineItems,
  saveFundingRequest,
  startFundingRequest,
} from "@/lib/actions/funding-request";
import type { FundingRequestSources } from "@/lib/queries/reports";
import {
  FR_FIELDS,
  FR_FIELD_META,
  finalizeBlockers,
  formatUsd,
  isCut,
  parseLineItems,
  toLineItems,
  voteLine,
  type FundingRequestContent,
  type FundingRequestFacts,
  type FundingRequestField,
  type FundingRequestListField,
  type FundingRequestPatch,
  type FundingRequestProseField,
} from "@/lib/reports/funding-request";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AutoTextarea,
  FieldShell,
  GuidingQuestions,
  SaveIndicator,
  useAutosave,
} from "@/components/reports/report-fields";
import { PrintButton } from "@/components/reports/print-button";
import { FundingDocument } from "./funding-document";
import { FinalizeFundingRequest } from "./funding-actions";
import { LineItemsEditor } from "./line-items-editor";
import { SourcesPanel } from "./sources-panel";

const APPROVED_SOURCE: Record<NonNullable<FundingRequestFacts["approvedSource"]>, string> = {
  grant: "the grant",
  memo: "the memo's proposed amount",
  ballots: "the median of the fund ballots",
};

export type AiAvailability = "on" | "no_key" | "club_off";

/**
 * The drafting surface for a funding request: what the app already knows at
 * the top, the line items, then the written parts — each one prefilled,
 * draftable, or prompted with questions. The memo on the right is the same
 * component that prints, updated as you type.
 */
export function FundingRequestEditor({
  applicationId,
  exists,
  facts,
  initialContent,
  sources,
  ai,
  today,
}: {
  applicationId: string;
  /** False on the very first open: the draft is created as the page mounts. */
  exists: boolean;
  facts: FundingRequestFacts;
  initialContent: FundingRequestContent;
  sources: FundingRequestSources;
  ai: AiAvailability;
  today: string;
}) {
  const canFinalize = useCan("partnerWork");
  const [content, setContent] = React.useState(initialContent);
  const [view, setView] = React.useState<"edit" | "preview">("edit");
  const [drafting, setDrafting] = React.useState<FundingRequestField[] | null>(null);
  const [extracting, setExtracting] = React.useState(false);
  const aiOn = ai === "on";
  // Async handlers read the content as it is when the server answers, not as it was when they started.
  const latest = React.useRef(content);
  React.useEffect(() => {
    latest.current = content;
  });

  const autosave = useAutosave<FundingRequestPatch>(
    (patch) => saveFundingRequest({ applicationId, patch }),
    (message) => toast.error(message)
  );

  // First open by a contributor creates the draft, so it shows on the Reports hub straight away.
  const started = React.useRef(exists);
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    startFundingRequest({ applicationId }).then((res) => {
      if (!res.ok) toast.error(res.error);
    });
  }, [applicationId]);

  const update = React.useCallback(
    (patch: FundingRequestPatch) => {
      setContent((current) => ({ ...current, ...patch }));
      autosave.queue(patch);
    },
    [autosave]
  );

  /** A member's edit: the text changes and the field stops being anyone else's draft. */
  function edit<F extends FundingRequestField>(field: F, value: FundingRequestContent[F]) {
    const origin = { ...content.origin };
    delete origin[field];
    update({ [field]: value, origin } as FundingRequestPatch);
  }

  function accept(field: FundingRequestField) {
    const origin = { ...content.origin };
    delete origin[field];
    update({ origin });
  }

  async function draft(fields: FundingRequestField[]) {
    if (fields.length === 0) {
      toast.message("Nothing left to draft — every field already has text.");
      return;
    }
    setDrafting(fields);
    await autosave.flush();
    const res = await draftFundingRequestFields({ applicationId, fields });
    setDrafting(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const filled = Object.keys(res.data.draft) as FundingRequestField[];
    if (filled.length === 0) {
      toast.message("There wasn't enough on file to draft from.");
      return;
    }
    const origin = { ...latest.current.origin };
    for (const field of filled) origin[field] = "ai";
    update({ ...res.data.draft, origin });
    toast.success(filled.length === 1 ? "Draft added. Read it before you accept it." : `${filled.length} drafts added. Read each before you accept it.`);
  }

  const emptyFields = FR_FIELDS.filter((f) => {
    const value = content[f];
    return Array.isArray(value) ? value.filter((s) => s.trim()).length === 0 : !value.trim();
  });

  async function extract() {
    setExtracting(true);
    const res = await extractFundingLineItems({ applicationId });
    setExtracting(false);
    const items = res.ok ? res.data.items : parseLineItems(sources.useOfFundsNarrative);
    if (items.length === 0) {
      toast.message("We couldn't find priced items in the founder's use of funds. Add them by hand.");
      return;
    }
    update({ askedItems: toLineItems(items) });
    toast.success(`${items.length} ${items.length === 1 ? "item" : "items"} read from the application. Check the amounts.`);
  }

  const cut = isCut(facts);
  const blockers = finalizeBlockers(facts, content);
  const narrative = sources.useOfFundsNarrative?.trim() ?? "";
  const canExtract = narrative !== "" && (aiOn || parseLineItems(narrative).length > 0);

  const proseField = (field: FundingRequestProseField, required = false) => (
    <ProseField
      key={field}
      field={field}
      value={content[field]}
      origin={content.origin[field]}
      required={required}
      canDraft={aiOn}
      drafting={drafting?.includes(field) ?? false}
      onChange={(value) => edit(field, value)}
      onAccept={() => accept(field)}
      onDraft={() => draft([field])}
    />
  );

  const listField = (field: FundingRequestListField) => (
    <ListField
      key={field}
      field={field}
      items={content[field]}
      origin={content.origin[field]}
      canDraft={aiOn}
      drafting={drafting?.includes(field) ?? false}
      onChange={(items) => edit(field, items)}
      onAccept={() => accept(field)}
      onDraft={() => draft([field])}
      suggestions={field === "upside" ? sources.ballots.fund : sources.ballots.decline}
      suggestionsLabel={field === "upside" ? "From the fund ballots" : "From the decline ballots"}
    />
  );

  return (
    <div className="px-4 pb-16 md:px-6 print:p-0">
      {/* Phones see one pane at a time. */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-bg-subtle p-1 lg:hidden print:hidden" role="tablist" aria-label="View">
        {(["edit", "preview"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={cn(
              "h-10 cursor-pointer rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
              view === v ? "bg-panel text-fg shadow-xs" : "text-fg-muted"
            )}
          >
            {v === "edit" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className={cn("flex min-w-0 flex-col gap-4 print:hidden", view === "preview" && "max-lg:hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <SaveIndicator state={autosave.state} />
            <div className="flex flex-wrap items-center gap-2">
              {ai === "on" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="max-md:h-10"
                  disabled={drafting !== null}
                  onClick={() => draft(emptyFields.filter((f) => f !== "rationaleCuts" || cut))}
                >
                  <SparklesIcon />
                  {drafting && drafting.length > 1 ? "Drafting…" : "Draft everything"}
                </Button>
              ) : (
                <span className="text-xs text-fg-subtle">
                  {ai === "no_key" ? "Add an ANTHROPIC_API_KEY to enable drafts" : "AI drafts are switched off for this club"}
                </span>
              )}
            </div>
          </div>

          <Card
            title="From the record"
            description="Pulled from the application, the vote and the grant. To change a figure, change it there."
          >
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Fact label="Company">{facts.companyName}</Fact>
              <Fact label="Decision">
                {facts.decision === "fund" ? "Fund" : facts.decision === "decline" ? "Declined" : "Not recorded yet"}
              </Fact>
              <Fact label="Asked">
                <span className="tnum">{formatUsd(facts.askedTotal)}</span>
              </Fact>
              <Fact label="Approved">
                <span className="tnum">{formatUsd(facts.approvedTotal)}</span>
                {facts.approvedSource && (
                  <span className="text-fg-subtle"> · {APPROVED_SOURCE[facts.approvedSource]}</span>
                )}
              </Fact>
              {facts.vote && (
                <Fact label="Vote" className="sm:col-span-2">
                  <span className="tnum">{voteLine(facts.vote)}</span>
                </Fact>
              )}
            </dl>
            <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
              <Override
                id="fr-founders"
                label="Founders line"
                computed={facts.founders}
                value={content.founders}
                onChange={(founders) => update({ founders })}
                placeholder="Name (year), co-founder (year at school)"
                hint="Add a co-founder the application didn't name."
              />
              <Override
                id="fr-recommendation"
                label="Recommendation"
                computed={facts.recommendation}
                value={content.recommendation}
                onChange={(recommendation) => update({ recommendation })}
                placeholder="Receive $1,370 for materials for lab experiments"
                hint="Written from the decision. Reword it if the purpose reads oddly."
              />
            </div>
          </Card>

          <Card
            title="Line items"
            description="What the founder asked for against what the club approved, item by item."
          >
            <LineItemsEditor
              askedTotal={facts.askedTotal}
              approvedTotal={facts.approvedTotal}
              askedItems={content.askedItems}
              approvedItems={content.approvedItems}
              onAsked={(askedItems) => update({ askedItems })}
              onApproved={(approvedItems) => update({ approvedItems })}
              onExtract={extract}
              extracting={extracting}
              canExtract={canExtract}
            />
            {narrative && (
              <details className="mt-4 border-t border-border pt-3 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-fg-muted max-md:py-2">
                  What the founder wrote about use of funds
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-fg-muted">{narrative}</p>
              </details>
            )}
          </Card>

          <Card title="Rationale">
            <div className="flex flex-col gap-5">
              {proseField("rationaleFunding", true)}
              {proseField("rationaleCuts", cut)}
            </div>
          </Card>

          <Card title="The company">
            <div className="flex flex-col gap-5">
              {proseField("summary", true)}
              {proseField("team", true)}
              {proseField("feasibility")}
              {proseField("impact")}
              {proseField("value")}
            </div>
          </Card>

          <Card title="Upside and concerns">
            <div className="flex flex-col gap-6">
              {listField("upside")}
              {listField("concerns")}
            </div>
          </Card>

          <SourcesPanel sources={sources} />

          <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {blockers.length === 0 ? "Ready to finalize" : "Before this can be finalized"}
                </div>
                {blockers.length === 0 ? (
                  <p className="mt-1 text-sm text-fg-muted">
                    Finalizing freezes the numbers and locks the text. A partner can reopen it.
                  </p>
                ) : (
                  <ul className="mt-1.5 flex flex-col gap-1 text-sm text-fg-muted">
                    {blockers.map((b) => (
                      <li key={b} className="flex gap-2">
                        <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-1 sm:items-end">
                <FinalizeFundingRequest
                  applicationId={applicationId}
                  companyName={facts.companyName}
                  blockers={blockers}
                  content={content}
                  facts={facts}
                  disabled={!canFinalize}
                  beforeSubmit={autosave.flush}
                />
                {!canFinalize && <span className="text-xs text-fg-subtle">Partners finalize and send.</span>}
              </div>
            </div>
          </div>
        </div>

        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto print:static print:block print:max-h-none print:overflow-visible",
            view === "edit" && "max-lg:hidden"
          )}
        >
          <div className="mb-2 flex items-center justify-between gap-2 print:hidden">
            <span className="text-xs text-fg-subtle">The memo, as it will go up</span>
            <PrintButton />
          </div>
          <div className="rounded-lg border border-border bg-panel px-5 py-7 shadow-sm sm:px-9 sm:py-10 print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
            <FundingDocument facts={facts} content={content} date={today} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-panel shadow-xs">
      <div className="px-4 pt-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

/** A composed line the member may reword; empty means "use what the app composed". */
function Override({
  id,
  label,
  computed,
  value,
  onChange,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  computed: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  hint: string;
}) {
  const overridden = value.trim() !== "";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {overridden && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-fg-muted max-md:h-10" onClick={() => onChange("")}>
            <RotateCcwIcon />
            Use the original
          </Button>
        )}
      </div>
      <Input
        id={id}
        value={overridden ? value : computed}
        onChange={(e) => onChange(e.target.value === computed ? "" : e.target.value)}
        placeholder={placeholder}
        maxLength={400}
        className="max-md:text-base"
      />
      <p className="text-xs text-fg-subtle">{hint}</p>
    </div>
  );
}

function ProseField({
  field,
  value,
  origin,
  required,
  canDraft,
  drafting,
  onChange,
  onAccept,
  onDraft,
}: {
  field: FundingRequestProseField;
  value: string;
  origin: FundingRequestContent["origin"][FundingRequestField];
  required: boolean;
  canDraft: boolean;
  drafting: boolean;
  onChange: (value: string) => void;
  onAccept: () => void;
  onDraft: () => void;
}) {
  const meta = FR_FIELD_META[field];
  const id = `fr-${field}`;
  const empty = value.trim() === "";
  return (
    <FieldShell
      label={meta.label}
      htmlFor={id}
      required={required}
      origin={origin}
      onAccept={onAccept}
      onDraft={onDraft}
      drafting={drafting}
      canDraft={canDraft}
      hasText={!empty}
    >
      {empty && <GuidingQuestions questions={meta.questions} />}
      <AutoTextarea
        id={id}
        value={value}
        minRows={empty ? 2 : 1}
        onChange={(e) => onChange(e.target.value)}
        maxLength={6000}
        placeholder="Answer in two or three sentences"
        className={cn(origin === "ai" && "border-info-border")}
      />
    </FieldShell>
  );
}

function ListField({
  field,
  items,
  origin,
  canDraft,
  drafting,
  onChange,
  onAccept,
  onDraft,
  suggestions,
  suggestionsLabel,
}: {
  field: FundingRequestListField;
  items: string[];
  origin: FundingRequestContent["origin"][FundingRequestField];
  canDraft: boolean;
  drafting: boolean;
  onChange: (items: string[]) => void;
  onAccept: () => void;
  onDraft: () => void;
  suggestions: { memberName: string; rationale: string }[];
  suggestionsLabel: string;
}) {
  const meta = FR_FIELD_META[field];
  const filled = items.filter((s) => s.trim()).length > 0;
  const unused = suggestions.filter((s) => !items.some((item) => item.trim() === s.rationale));
  return (
    <FieldShell
      label={meta.label}
      required
      origin={origin}
      onAccept={onAccept}
      onDraft={onDraft}
      drafting={drafting}
      canDraft={canDraft}
      hasText={filled}
    >
      {!filled && <GuidingQuestions questions={meta.questions} />}
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="tnum mt-2 w-4 shrink-0 text-right text-sm text-fg-subtle">{i + 1}.</span>
            <AutoTextarea
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              maxLength={2000}
              aria-label={`${meta.label} ${i + 1}`}
              placeholder="A short label - then two or three sentences"
              className={cn("flex-1", origin === "ai" && "border-info-border")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-0.5 text-fg-muted hover:text-danger max-md:size-10"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              aria-label={`Remove ${meta.label.toLowerCase()} ${i + 1}`}
            >
              <XIcon />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start text-fg-muted max-md:h-10"
        onClick={() => onChange([...items, ""])}
        disabled={items.length >= 12}
      >
        <PlusIcon />
        Add {items.length === 0 ? "one" : "another"}
      </Button>
      {unused.length > 0 && (
        <div className="rounded-md border border-border bg-bg-subtle/60 p-3">
          <div className="text-xs font-medium text-fg-muted">{suggestionsLabel}</div>
          <ul className="mt-2 flex flex-col gap-2">
            {unused.map((s) => (
              <li key={s.memberName + s.rationale} className="flex items-start gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="text-fg-muted">{s.rationale}</span>{" "}
                  <span className="text-xs whitespace-nowrap text-fg-subtle">— {s.memberName}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 shrink-0 px-2 max-md:h-10"
                  onClick={() => onChange([...items.filter((x) => x.trim()), s.rationale])}
                  disabled={items.length >= 12}
                  aria-label={`Add ${s.memberName}'s rationale to ${meta.label.toLowerCase()}`}
                >
                  <PlusIcon />
                  Use
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </FieldShell>
  );
}
