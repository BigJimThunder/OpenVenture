"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckIcon, ChevronRightIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { draftAnnualEssay } from "@/lib/actions/annual-report";
import { essayQuestions } from "@/lib/ai/essay-questions";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  countPrompts,
  firstName,
  spreadStatus,
  starterEssay,
  type AnnualCompany,
  type DerivedCompany,
  type EssayMaterial,
  type SpreadStatus,
} from "@/lib/reports/annual";
import { docToText, isDocEmpty, textToDoc } from "@/lib/rich-text";
import { cn, formatMoney } from "@/lib/utils";
import { EditorSection, Field, FoundersField, ImageUrlField, MoveButtons, Prose, newId } from "./fields";
import type { EditorProps } from "./section-editors";

const STATUS_META: Record<SpreadStatus, { label: string; variant: "warning" | "info" | "success" }> = {
  needs_essay: { label: "Needs essay", variant: "warning" },
  draft: { label: "Draft", variant: "info" },
  reviewed: { label: "Reviewed", variant: "success" },
};

export function SpreadChip({ company }: { company: AnnualCompany }) {
  const meta = STATUS_META[spreadStatus(company)];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/** The list of spreads: which companies get one, in what order, and who is writing each. */
export function CompaniesEditor({
  content,
  derived,
  apply,
  canEdit,
  onOpen,
}: EditorProps & { onOpen: (companyId: string) => void }) {
  const byId = new Map(derived.companies.map((c) => [c.companyId, c]));
  const members = new Map(derived.members.map((m) => [m.id, m.name]));
  const rows = content.companies.filter((c) => byId.has(c.id));

  return (
    <EditorSection
      title="Company spreads"
      hint="One spread per company: who they are, an essay by one of you on why the club backed them, and where they are now. Companies funded this year are included; earlier ones are offered below."
    >
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-3 text-sm text-fg-muted">
          No grant has been approved in {derived.label} yet. A spread appears here for each company as soon as
          its grant is approved; use “Refresh numbers” to pull it in.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-panel shadow-xs">
          {rows.map((c, index) => {
            const d = byId.get(c.id)!;
            return (
              <li key={c.id} className={cn("flex items-center gap-3 px-3 py-2.5", !c.included && "bg-bg-subtle/60")}>
                <Checkbox
                  aria-label={`Include ${d.name}`}
                  checked={c.included}
                  disabled={!canEdit}
                  onCheckedChange={(v) =>
                    apply({ op: "set", path: ["companies", c.id, "included"], value: v === true })
                  }
                />
                <button
                  type="button"
                  className="group flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left outline-none"
                  onClick={() => onOpen(c.id)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium group-hover:text-accent group-focus-visible:text-accent">
                      {d.name}
                    </span>
                    <span className="tnum block truncate text-xs text-fg-subtle">
                      {formatMoney(d.grantTotal)}
                      {d.inFiscalYear ? "" : " · funded in an earlier year"}
                      {c.authorMemberId && members.get(c.authorMemberId)
                        ? ` · essay by ${firstName(members.get(c.authorMemberId)!)}`
                        : " · no author yet"}
                    </span>
                  </span>
                  {c.included && <SpreadChip company={c} />}
                  <ChevronRightIcon className="size-4 shrink-0 text-fg-subtle" />
                </button>
                {canEdit && (
                  <MoveButtons
                    label={d.name}
                    first={index === 0}
                    last={index === rows.length - 1}
                    onMove={(by) => apply({ op: "move", path: ["companies", c.id], by })}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </EditorSection>
  );
}

function Material({ material, company }: { material: EssayMaterial; company: DerivedCompany }) {
  const groups: { title: string; note?: string; items: { label: string; text: string }[] }[] = [
    {
      title: "From the application",
      items: material.pitchSummary ? [{ label: "Pitch", text: material.pitchSummary }] : [],
    },
    {
      title: "Investment memo",
      items: material.memoSections.map((s) => ({ label: s.title, text: s.text })),
    },
    {
      title: "Funding request",
      items: material.fundingRequest.map((s) => ({ label: s.title, text: s.text })),
    },
    {
      title: "Coffee-chat debriefs",
      items: material.debriefs.map((d) => ({ label: format(new Date(d.date), "MMM d, yyyy"), text: d.text })),
    },
    {
      title: "What members wrote on their ballots",
      note: "From revealed rounds only, without names.",
      items: material.rationales.map((r) => ({ label: "", text: r })),
    },
  ].filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        There is no memo, debrief or funding request on file for {company.name}, so this one starts from a
        blank page.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {groups.map((g) => (
        <details key={g.title} className="group rounded-md border border-border bg-panel">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium select-none max-md:py-3 [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon className="size-3.5 text-fg-subtle transition-transform group-open:rotate-90" />
            {g.title}
            <span className="tnum text-xs font-normal text-fg-subtle">{g.items.length}</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-border px-3 py-3 text-sm">
            {g.note && <p className="text-xs text-fg-subtle">{g.note}</p>}
            {g.items.map((item, i) => (
              <div key={i}>
                {item.label && (
                  <div className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">{item.label}</div>
                )}
                <p className="whitespace-pre-line text-fg-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/** One spread: facts, the essay and its raw material, current progress, images. */
export function CompanyEditor({
  reportId,
  content,
  derived,
  apply,
  canEdit,
  viewerId,
  aiEnabled,
  companyId,
  material,
}: EditorProps & { companyId: string; material: EssayMaterial | undefined }) {
  const entry = content.companies.find((c) => c.id === companyId);
  const company = derived.companies.find((c) => c.companyId === companyId);
  const [drafting, setDrafting] = React.useState(false);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  if (!entry || !company) return null;

  const canWrite = canEdit || entry.authorMemberId === viewerId;
  const path = (field: string) => ["companies", companyId, field];
  const set = (field: string, value: unknown) => apply({ op: "set", path: path(field), value });
  const essayText = docToText(entry.essay);
  const prompts = countPrompts(essayText);
  const status = spreadStatus(entry);
  const founder = firstName((entry.founders ?? company.founders)[0]?.name ?? "") || "the founder";
  const authors = derived.members.filter((m) => m.role !== "read_only");

  async function runDraft() {
    setConfirmReplace(false);
    setDrafting(true);
    const res = await draftAnnualEssay({ reportId, companyId });
    setDrafting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    apply(
      { op: "set", path: path("essay"), value: textToDoc(res.data.text) },
      { op: "set", path: path("essayState"), value: "ai" },
      { op: "set", path: path("reviewed"), value: false }
    );
    toast.success("Draft added. It is unreviewed until you edit it.");
  }

  return (
    <>
      <EditorSection
        title={company.name}
        hint={
          <span className="tnum">
            {formatMoney(company.grantTotal)} grant
            {company.grantedAt ? ` · ${format(new Date(company.grantedAt), "MMM d, yyyy")}` : ""}
            {company.inFiscalYear ? "" : " · funded in an earlier year"}
          </span>
        }
        actions={
          <>
            <SpreadChip company={entry} />
            {canEdit && status !== "needs_essay" && (
              <Button
                variant={entry.reviewed ? "secondary" : "default"}
                size="sm"
                disabled={!entry.reviewed && prompts > 0}
                title={prompts > 0 ? "Finish the [add: …] prompts first" : undefined}
                onClick={() => set("reviewed", !entry.reviewed)}
              >
                {entry.reviewed ? (
                  "Undo review"
                ) : (
                  <>
                    <CheckIcon />
                    Mark reviewed
                  </>
                )}
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Essay author"
              htmlFor={`ar-author-${companyId}`}
              hint="Signs the essay. Defaults to whoever wrote the memo."
            >
              <Select
                value={entry.authorMemberId ?? ""}
                disabled={!canEdit}
                onValueChange={(value) => set("authorMemberId", value || null)}
              >
                <SelectTrigger id={`ar-author-${companyId}`}>
                  <SelectValue placeholder="Choose a member" />
                </SelectTrigger>
                <SelectContent>
                  {authors.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="What the grant paid for"
              htmlFor={`ar-grant-${companyId}`}
              hint="Shown under the founders, after the amount."
            >
              <Input
                id={`ar-grant-${companyId}`}
                value={entry.grantNote ?? ""}
                disabled={!canWrite}
                maxLength={400}
                placeholder={company.grantNarrative ?? company.grantUse}
                onChange={(e) => set("grantNote", e.target.value || null)}
              />
            </Field>
          </div>
          <Field label="One-line description" htmlFor={`ar-oneliner-${companyId}`}>
            <Input
              id={`ar-oneliner-${companyId}`}
              value={entry.oneLiner ?? ""}
              disabled={!canWrite}
              maxLength={400}
              placeholder={company.oneLiner ?? "What the company does, in one sentence"}
              onChange={(e) => set("oneLiner", e.target.value || null)}
            />
          </Field>
          <FoundersField
            idPrefix={`ar-co-${companyId}`}
            value={entry.founders}
            fallback={company.founders}
            disabled={!canWrite}
            onChange={(next) => set("founders", next)}
          />
        </div>
      </EditorSection>

      <EditorSection
        title={`Our thesis on ${company.name}`}
        hint="A personal essay, in the first person, about why you backed these founders. Four or five paragraphs."
        actions={
          canWrite &&
          (aiEnabled ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={drafting}
              onClick={() =>
                isDocEmpty(entry.essay) || entry.essayState === "starter" ? runDraft() : setConfirmReplace(true)
              }
            >
              <SparklesIcon />
              {drafting ? "Drafting…" : "Draft with AI"}
            </Button>
          ) : (
            material &&
            isDocEmpty(entry.essay) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  apply(
                    { op: "set", path: path("essay"), value: textToDoc(starterEssay(material)) },
                    { op: "set", path: path("essayState"), value: "starter" }
                  )
                }
              >
                Start from our notes
              </Button>
            )
          ))
        }
      >
        {entry.essayState === "starter" && !isDocEmpty(entry.essay) && (
          <p className="mb-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-fg">
            This is a starting point stitched from the memo and the coffee-chat debrief. It becomes your essay
            once you rewrite it in your own voice and replace each [add: …] prompt.
          </p>
        )}
        {entry.essayState === "ai" && (
          <p className="mb-2 rounded-md border border-info-border bg-info-bg px-3 py-2 text-xs text-fg">
            AI draft, unreviewed. It only uses what the club wrote at the time. Check every claim, and fill the
            [add: …] prompts yourself.
          </p>
        )}
        <Prose
          ariaLabel={`Our thesis on ${company.name}`}
          value={entry.essay}
          editable={canWrite}
          minHeight="min-h-64"
          placeholder={`How did you first meet ${founder}?`}
          onChange={(doc) =>
            apply(
              { op: "set", path: path("essay"), value: doc },
              { op: "set", path: path("essayState"), value: "edited" }
            )
          }
        />
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
          <span className="tnum">
            {essayText.trim() ? `${essayText.trim().split(/\s+/).length} words` : "Nothing written yet"}
          </span>
          {prompts > 0 && (
            <span className="text-warning">
              {prompts} [add: …] {prompts === 1 ? "prompt" : "prompts"} left
            </span>
          )}
        </div>
        {!canWrite && (
          <p className="mt-2 text-xs text-fg-muted">
            Only the essay&apos;s author or a partner can edit this spread.
          </p>
        )}

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">Questions to answer</h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm text-fg-muted marker:text-fg-subtle">
              {essayQuestions(founder, company.name).map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
            {canWrite && !aiEnabled && (
              <p className="mt-2 text-xs text-fg-subtle">Add an ANTHROPIC_API_KEY to enable drafts.</p>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-semibold">What we wrote at the time</h3>
            {material ? (
              <Material material={material} company={company} />
            ) : (
              <p className="text-sm text-fg-muted">Nothing on file.</p>
            )}
          </div>
        </div>
      </EditorSection>

      <EditorSection
        title="Current progress"
        hint="What has happened since the grant. Starts from the outcome ladder and your check-in notes."
      >
        <Prose
          ariaLabel={`Current progress for ${company.name}`}
          value={entry.progress}
          editable={canWrite}
          prompt={
            entry.progressAuto
              ? "Filled in from your check-ins. Edit it freely; once you do, refreshing numbers leaves it alone."
              : "What did they ship, raise, win or learn? One short paragraph with dates and numbers."
          }
          onChange={(doc) =>
            apply(
              { op: "set", path: path("progress"), value: doc },
              { op: "set", path: path("progressAuto"), value: false }
            )
          }
        />
        {company.updates.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1 text-xs text-fg-muted">
            {company.updates.map((u, i) => (
              <li key={i} className="tnum">
                {format(new Date(u.recordedAt), "MMM d, yyyy")} · {u.tier.replace(/_/g, " ")}
                {u.note ? ` · ${u.note}` : ""}
              </li>
            ))}
          </ul>
        )}
      </EditorSection>

      <EditorSection
        title="Logo and photos"
        hint="Optional. The first photo sits beside the opening of the essay; the others follow current progress."
        actions={
          canWrite &&
          entry.photos.length < 3 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => set("photos", [...entry.photos, { id: newId("photo"), url: "", caption: "" }])}
            >
              <PlusIcon />
              Add a photo
            </Button>
          )
        }
      >
        <div className="grid gap-4">
          <ImageUrlField
            id={`ar-logo-${companyId}`}
            label="Logo"
            value={entry.logoUrl}
            disabled={!canWrite}
            onCommit={(url) => set("logoUrl", url)}
          />
          {entry.photos.map((p, i) => (
            <div key={p.id} className="grid gap-3 rounded-lg border border-border bg-panel p-3 sm:grid-cols-[1fr_1fr_auto]">
              <ImageUrlField
                id={`ar-photo-${p.id}`}
                label={`Photo ${i + 1}`}
                value={p.url}
                disabled={!canWrite}
                hint=""
                onCommit={(url) => set("photos", entry.photos.map((x) => (x.id === p.id ? { ...x, url } : x)))}
              />
              <Field label="Caption" htmlFor={`ar-caption-${p.id}`}>
                <Input
                  id={`ar-caption-${p.id}`}
                  value={p.caption}
                  disabled={!canWrite}
                  maxLength={200}
                  placeholder={`${founder} at demo day`}
                  onChange={(e) =>
                    set("photos", entry.photos.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))
                  }
                />
              </Field>
              {canWrite && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="self-end max-md:size-10 sm:mb-1"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => set("photos", entry.photos.filter((x) => x.id !== p.id))}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          ))}
        </div>
      </EditorSection>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Replace what is written?"
        description={`The AI draft will replace the current essay on ${company.name}. Copy anything you want to keep first.`}
        confirmLabel="Replace with a draft"
        onConfirm={runDraft}
      />
    </>
  );
}
