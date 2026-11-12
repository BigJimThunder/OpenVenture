"use client";

import * as React from "react";
import Link from "next/link";
import { EyeIcon, EyeOffIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { draftAnnualUnfundedNote } from "@/lib/actions/annual-report";
import { updateMyProfile } from "@/lib/actions/members";
import { MEETING_KIND_LABEL } from "@/components/meetings/meeting-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { MeetingKind } from "@/db/schema";
import {
  DEFAULT_TITLES,
  countPrompts,
  formatFounder,
  meetingsAsStats,
  type AnnualContent,
  type AnnualDerived,
} from "@/lib/reports/annual";
import { docToText, textToDoc } from "@/lib/rich-text";
import { cn } from "@/lib/utils";
import { EditorSection, Field, FoundersField, ImageUrlField, MoveButtons, Prose, newId } from "./fields";
import type { AnnualDraft } from "./use-annual-draft";

export type EditorProps = {
  reportId: string;
  content: AnnualContent;
  derived: AnnualDerived;
  apply: AnnualDraft["apply"];
  /** Partners and admins. Analysts see these sections read-only. */
  canEdit: boolean;
  viewerId: string;
  aiEnabled: boolean;
};

const card = "rounded-lg border border-border bg-panel p-4 shadow-xs";

function AiHint() {
  return <p className="text-xs text-fg-subtle">Add an ANTHROPIC_API_KEY to enable drafts.</p>;
}

// ——— Cover ———

export function CoverEditor({ content, derived, apply, canEdit }: EditorProps) {
  return (
    <EditorSection
      title="Cover and contents"
      hint="The contents page writes itself from the sections you include, in the order you put them."
    >
      <div className="grid gap-4">
        <Field label="Title" htmlFor="ar-cover-title">
          <Input
            id="ar-cover-title"
            value={content.cover.title}
            disabled={!canEdit}
            maxLength={120}
            placeholder={`Annual Report ${derived.label}`}
            onChange={(e) => apply({ op: "set", path: ["cover", "title"], value: e.target.value })}
          />
        </Field>
        <Field label="Subtitle" htmlFor="ar-cover-subtitle" hint="Optional. One line under the title.">
          <Input
            id="ar-cover-subtitle"
            value={content.cover.subtitle}
            disabled={!canEdit}
            maxLength={240}
            onChange={(e) => apply({ op: "set", path: ["cover", "subtitle"], value: e.target.value })}
          />
        </Field>
        <ImageUrlField
          id="ar-cover-image"
          label="Cover image"
          value={content.cover.imageUrl}
          disabled={!canEdit}
          hint="Optional. Fills the whole cover; the title sits over it in white. Without one the cover is typographic."
          onCommit={(url) => apply({ op: "set", path: ["cover", "imageUrl"], value: url })}
        />
      </div>
    </EditorSection>
  );
}

// ——— Team ———

export function TeamEditor({ content, derived, apply, canEdit, viewerId }: EditorProps) {
  const members = new Map(derived.members.map((m) => [m.id, m]));
  const entries = content.team.members.filter((m) => members.has(m.id));
  const [savingProfile, setSavingProfile] = React.useState(false);

  async function saveToProfile(bio: string) {
    const me = members.get(viewerId);
    if (!me) return;
    setSavingProfile(true);
    const res = await updateMyProfile({ displayName: me.name, bio });
    setSavingProfile(false);
    if (res.ok) toast.success("Saved to your profile");
    else toast.error(res.error);
  }

  const setAll = (predicate: (role: string) => boolean) =>
    apply(
      ...entries.map((m) => ({
        op: "set" as const,
        path: ["team", "members", m.id, "included"],
        value: predicate(members.get(m.id)!.role),
      }))
    );

  return (
    <>
      <EditorSection title="Team statement" hint="Opens the team page, above the people.">
        <Prose
          ariaLabel="Team statement"
          value={content.team.statement}
          editable={canEdit}
          prompt="Who are you, how do you work, and what do you hold each other to? Three or four sentences."
          onChange={(doc) => apply({ op: "set", path: ["team", "statement"], value: doc })}
        />
      </EditorSection>

      <EditorSection
        title="Who appears"
        hint="Everyone who was a member during the year. Titles and bios come from each member's profile; what you type here changes this report only."
        actions={
          canEdit && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAll((r) => r === "admin" || r === "partner")}>
                Leadership only
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setAll(() => true)}>
                Everyone
              </Button>
            </>
          )
        }
      >
        <ul className="flex flex-col gap-2">
          {entries.map((entry, index) => {
            const m = members.get(entry.id)!;
            const bio = entry.bio ?? "";
            const missing = entry.included && !bio.trim() && !m.bio?.trim();
            const mine = m.id === viewerId;
            return (
              <li key={entry.id} className={cn(card, !entry.included && "bg-bg-subtle/50 shadow-none")}>
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`ar-member-${entry.id}`}
                    checked={entry.included}
                    disabled={!canEdit}
                    onCheckedChange={(v) =>
                      apply({ op: "set", path: ["team", "members", entry.id, "included"], value: v === true })
                    }
                  />
                  <label htmlFor={`ar-member-${entry.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-xs text-fg-subtle">
                      {DEFAULT_TITLES[m.role]}
                      {m.classYear ? ` · class of ${m.classYear}` : ""}
                    </span>
                  </label>
                  {missing && <Badge variant="warning">Needs a bio</Badge>}
                  {canEdit && (
                    <MoveButtons
                      label={m.name}
                      first={index === 0}
                      last={index === entries.length - 1}
                      onMove={(by) => apply({ op: "move", path: ["team", "members", entry.id], by })}
                    />
                  )}
                </div>
                {entry.included && (
                  <div className="mt-3 grid gap-3 md:pl-7">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Title" htmlFor={`ar-title-${entry.id}`}>
                        <Input
                          id={`ar-title-${entry.id}`}
                          value={entry.title ?? ""}
                          disabled={!canEdit}
                          maxLength={120}
                          placeholder={m.title ?? DEFAULT_TITLES[m.role]}
                          onChange={(e) =>
                            apply({
                              op: "set",
                              path: ["team", "members", entry.id, "title"],
                              value: e.target.value || null,
                            })
                          }
                        />
                      </Field>
                      <ImageUrlField
                        id={`ar-photo-${entry.id}`}
                        label="Photo"
                        value={entry.photoUrl}
                        disabled={!canEdit}
                        hint="Optional link to a square headshot."
                        onCommit={(url) =>
                          apply({ op: "set", path: ["team", "members", entry.id, "photoUrl"], value: url })
                        }
                      />
                    </div>
                    <Field
                      label="Bio"
                      htmlFor={`ar-bio-${entry.id}`}
                      hint={
                        missing
                          ? "Two or three sentences: their year and what they study, what they do in the club, one thing outside it."
                          : !bio.trim() && m.bio
                            ? "Using the bio from their profile. Type here to say something different in this report."
                            : undefined
                      }
                    >
                      <Textarea
                        id={`ar-bio-${entry.id}`}
                        value={bio}
                        disabled={!canEdit}
                        maxLength={1200}
                        placeholder={m.bio ?? `Add a bio for ${m.name.split(" ")[0]}`}
                        onChange={(e) =>
                          apply({
                            op: "set",
                            path: ["team", "members", entry.id, "bio"],
                            value: e.target.value || null,
                          })
                        }
                      />
                    </Field>
                    {mine && bio.trim() && bio.trim() !== m.bio?.trim() && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="self-start"
                        disabled={savingProfile}
                        onClick={() => saveToProfile(bio.trim())}
                      >
                        Save this as my profile bio too
                      </Button>
                    )}
                    {mine && !canEdit && (
                      <p className="text-xs text-fg-muted">
                        This is you.{" "}
                        <Link className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent" href={`/members/${m.id}`}>
                          Edit your profile
                        </Link>{" "}
                        to change your bio; the report picks it up.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </EditorSection>
    </>
  );
}

// ——— Mission, thesis & activity ———

const BLOCK_PROMPTS: Record<string, string> = {
  mission:
    "What is the club for, and for whom? Starts from the mission in Settings; editing it here changes this report only.",
  thesis:
    "What do you look for in a founder, and what do you turn down? Starts from the thesis in Settings; editing it here changes this report only.",
  summary: "How did the year measure up against that? One paragraph, with a number in it if you have one.",
};

export function MissionEditor({ content, derived, apply, canEdit }: EditorProps) {
  const { blocks, stats } = content.mission;
  return (
    <>
      <EditorSection
        title="Activity sidebar"
        hint={
          derived.inProgress
            ? "Big numbers beside the prose. The fiscal year is still running, so these are to date."
            : "Big numbers beside the prose, counted from the year's records."
        }
        actions={
          canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                apply({
                  op: "insert",
                  path: ["mission", "stats"],
                  value: { id: newId("stat"), key: "custom", hidden: false, value: "", label: "" },
                })
              }
            >
              <PlusIcon />
              Add your own
            </Button>
          )
        }
      >
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-panel shadow-xs">
          {stats.map((s, index) => {
            const computed = s.key === "custom" ? null : derived.stats[s.key];
            const unavailable = s.key !== "custom" && computed?.value == null;
            return (
              <li key={s.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", s.hidden && "bg-bg-subtle/60")}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  disabled={!canEdit || unavailable}
                  aria-pressed={!s.hidden}
                  aria-label={s.hidden ? "Show in the report" : "Hide from the report"}
                  onClick={() => apply({ op: "set", path: ["mission", "stats", s.id, "hidden"], value: !s.hidden })}
                >
                  {s.hidden || unavailable ? <EyeOffIcon /> : <EyeIcon />}
                </Button>
                {s.key === "custom" ? (
                  <Input
                    aria-label="Number"
                    className="w-20 shrink-0 font-semibold"
                    value={s.value ?? ""}
                    disabled={!canEdit}
                    maxLength={40}
                    placeholder="17"
                    onChange={(e) =>
                      apply({ op: "set", path: ["mission", "stats", s.id, "value"], value: e.target.value })
                    }
                  />
                ) : (
                  <span
                    className={cn(
                      "tnum w-20 shrink-0 px-1 text-md font-semibold",
                      (s.hidden || unavailable) && "text-fg-subtle"
                    )}
                  >
                    {computed?.value ?? "—"}
                  </span>
                )}
                <Input
                  aria-label="Label"
                  className="min-w-40 flex-1"
                  value={s.label ?? ""}
                  disabled={!canEdit || unavailable}
                  maxLength={160}
                  placeholder={
                    s.key === "custom"
                      ? "founders in our incubator"
                      : unavailable
                        ? `Nothing recorded yet (${computed?.label})`
                        : computed?.label
                  }
                  onChange={(e) =>
                    apply({ op: "set", path: ["mission", "stats", s.id, "label"], value: e.target.value || null })
                  }
                />
                {canEdit && (
                  <span className="ml-auto flex items-center">
                    <MoveButtons
                      label="this number"
                      first={index === 0}
                      last={index === stats.length - 1}
                      onMove={(by) => apply({ op: "move", path: ["mission", "stats", s.id], by })}
                    />
                    {s.key === "custom" && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label="Remove this number"
                        onClick={() => apply({ op: "remove", path: ["mission", "stats", s.id] })}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-fg-muted">
          Use “Add your own” for things the app does not track, such as how many founders went through your
          incubator.
        </p>
      </EditorSection>

      {blocks.map((b, index) => (
        <EditorSection
          key={b.id}
          title={b.heading || "Untitled"}
          actions={
            canEdit && (
              <>
                <MoveButtons
                  label={b.heading || "this part"}
                  first={index === 0}
                  last={index === blocks.length - 1}
                  onMove={(by) => apply({ op: "move", path: ["mission", "blocks", b.id], by })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={`Remove ${b.heading || "this part"}`}
                  onClick={() => apply({ op: "remove", path: ["mission", "blocks", b.id] })}
                >
                  <Trash2Icon />
                </Button>
              </>
            )
          }
        >
          <div className="grid gap-3">
            <Field label="Heading" htmlFor={`ar-block-${b.id}`}>
              <Input
                id={`ar-block-${b.id}`}
                value={b.heading}
                disabled={!canEdit}
                maxLength={160}
                onChange={(e) =>
                  apply({ op: "set", path: ["mission", "blocks", b.id, "heading"], value: e.target.value })
                }
              />
            </Field>
            <Prose
              ariaLabel={b.heading || "Mission text"}
              value={b.body}
              editable={canEdit}
              prompt={BLOCK_PROMPTS[b.id]}
              onChange={(doc) => apply({ op: "set", path: ["mission", "blocks", b.id, "body"], value: doc })}
            />
          </div>
        </EditorSection>
      ))}
      {canEdit && blocks.length < 8 && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            apply({
              op: "insert",
              path: ["mission", "blocks"],
              value: { id: newId("block"), heading: "New heading", body: null },
            })
          }
        >
          <PlusIcon />
          Add a part
        </Button>
      )}
    </>
  );
}

// ——— Programs & events ———

export function ProgramsEditor({ content, derived, apply, canEdit }: EditorProps) {
  const kinds = [...new Set(derived.meetings.map((m) => m.kind))];
  const addProgram = (value: Record<string, unknown>) =>
    apply({ op: "insert", path: ["programs"], value: { id: newId("program"), ...value } });

  return (
    <>
      {content.programs.length === 0 && (
        <p className="mb-4 rounded-lg border border-dashed border-border-strong bg-bg-subtle/40 px-4 py-3 text-sm text-fg-muted">
          An incubator, a demo day, a speaker series, a training program: anything the club ran this year
          besides giving grants. Each gets a title, a few paragraphs and a short list of numbers. If you ran
          none, switch this section off in the outline.
        </p>
      )}
      {content.programs.map((p, index) => (
        <EditorSection
          key={p.id}
          title={p.title || "Untitled program"}
          actions={
            canEdit && (
              <>
                <MoveButtons
                  label={p.title || "this program"}
                  first={index === 0}
                  last={index === content.programs.length - 1}
                  onMove={(by) => apply({ op: "move", path: ["programs", p.id], by })}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={`Remove ${p.title || "this program"}`}
                  onClick={() => apply({ op: "remove", path: ["programs", p.id] })}
                >
                  <Trash2Icon />
                </Button>
              </>
            )
          }
        >
          <div className="grid gap-4">
            <Field label="Title" htmlFor={`ar-program-${p.id}`}>
              <Input
                id={`ar-program-${p.id}`}
                value={p.title}
                disabled={!canEdit}
                maxLength={160}
                placeholder="Demo Day"
                onChange={(e) => apply({ op: "set", path: ["programs", p.id, "title"], value: e.target.value })}
              />
            </Field>
            <Prose
              ariaLabel={`${p.title || "Program"} narrative`}
              value={p.narrative}
              editable={canEdit}
              prompt="Why did you run it, what happened, and what would you change? Say who came and what they left with."
              onChange={(doc) => apply({ op: "set", path: ["programs", p.id, "narrative"], value: doc })}
            />
            <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
              <Field label="List heading" htmlFor={`ar-program-stats-title-${p.id}`}>
                <Input
                  id={`ar-program-stats-title-${p.id}`}
                  value={p.statsTitle}
                  disabled={!canEdit}
                  maxLength={120}
                  placeholder="By the numbers"
                  onChange={(e) =>
                    apply({ op: "set", path: ["programs", p.id, "statsTitle"], value: e.target.value })
                  }
                />
              </Field>
              <Field label="List" htmlFor={`ar-program-stats-${p.id}`} hint="One item per line.">
                <Textarea
                  id={`ar-program-stats-${p.id}`}
                  value={p.stats.join("\n")}
                  disabled={!canEdit}
                  placeholder={"100+ attendees\n16 startups presented"}
                  onChange={(e) =>
                    apply({
                      op: "set",
                      path: ["programs", p.id, "stats"],
                      value: e.target.value.split("\n").slice(0, 40).map((s) => s.slice(0, 300)),
                    })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ImageUrlField
                id={`ar-program-photo-${p.id}`}
                label="Photo"
                value={p.photoUrl}
                disabled={!canEdit}
                hint="Optional."
                onCommit={(url) => apply({ op: "set", path: ["programs", p.id, "photoUrl"], value: url })}
              />
              <Field label="Caption" htmlFor={`ar-program-caption-${p.id}`}>
                <Input
                  id={`ar-program-caption-${p.id}`}
                  value={p.photoCaption}
                  disabled={!canEdit}
                  maxLength={200}
                  onChange={(e) =>
                    apply({ op: "set", path: ["programs", p.id, "photoCaption"], value: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>
        </EditorSection>
      ))}

      {canEdit && content.programs.length < 12 && (
        <div className="mt-2 flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle/50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => addProgram({ title: "" })}>
              <PlusIcon />
              Add a program
            </Button>
          </div>
          {kinds.length > 0 && (
            <div>
              <p className="text-xs text-fg-muted">
                Or start from the meetings you held this year. Each button makes a section with the list
                already filled in:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {kinds.map((kind) => {
                  const list = meetingsAsStats(derived.meetings, kind);
                  const label = MEETING_KIND_LABEL[kind as MeetingKind] ?? kind;
                  return (
                    <Button
                      key={kind}
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        addProgram({
                          title: `${label} meetings`,
                          statsTitle: `${list.length} ${label.toLowerCase()} meetings`,
                          stats: list.slice(0, 40),
                        })
                      }
                    >
                      {label} <span className="tnum text-fg-subtle">{list.length}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ——— Limitations & looking forward ———

export function LookingForwardEditor({ reportId, content, derived, apply, canEdit, aiEnabled }: EditorProps) {
  const { body, unfunded } = content.lookingForward;
  const candidates = new Map(derived.unfunded.map((u) => [u.applicationId, u]));
  const bodyText = docToText(body);
  const [drafting, setDrafting] = React.useState<string | null>(null);

  const insertFact = (text: string) =>
    apply({
      op: "set",
      path: ["lookingForward", "body"],
      value: textToDoc([bodyText.trim(), text].filter(Boolean).join("\n\n")),
    });

  async function draftNote(applicationId: string) {
    setDrafting(applicationId);
    const res = await draftAnnualUnfundedNote({ reportId, applicationId });
    setDrafting(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    apply({ op: "set", path: ["lookingForward", "unfunded", applicationId, "note"], value: res.data.text.slice(0, 1500) });
    toast.success("Draft added. Read it before it goes out.");
  }

  return (
    <>
      <EditorSection title="Reflection" hint="The part donors read most closely. Be plain about it.">
        <Prose
          ariaLabel="Limitations and looking forward"
          value={body}
          editable={canEdit}
          minHeight="min-h-40"
          prompt="What did you get wrong? What ran out — money, time, people? What changes next year?"
          onChange={(doc) => apply({ op: "set", path: ["lookingForward", "body"], value: doc })}
        />
        {derived.facts.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-fg-muted">Facts from this year&apos;s records</p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {derived.facts.map((fact) => {
                const used = bodyText.includes(fact.text);
                return (
                  <li
                    key={fact.id}
                    className="flex items-start gap-3 rounded-md border border-border bg-panel px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-2xs font-medium tracking-wide text-fg-subtle uppercase">
                        {fact.label}
                      </span>
                      {fact.text}
                    </span>
                    {canEdit && (
                      <Button variant="secondary" size="sm" disabled={used} onClick={() => insertFact(fact.text)}>
                        {used ? "Inserted" : "Insert"}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </EditorSection>

      <EditorSection
        title="Companies we supported but didn't fund"
        hint="Suggested from applications that reached a coffee chat or further this year and were declined or withdrawn. Say what you did for them; never why you said no."
        actions={
          canEdit && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                apply({
                  op: "insert",
                  path: ["lookingForward", "unfunded"],
                  value: { id: newId("other"), included: true, name: "", founders: [], note: "" },
                })
              }
            >
              <PlusIcon />
              Add one by hand
            </Button>
          )
        }
      >
        {unfunded.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No declined or withdrawn application reached a coffee chat this year, so there is nobody to suggest.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unfunded.map((u) => {
              const d = candidates.get(u.id);
              const founders = u.founders ?? d?.founders ?? [];
              const prompts = countPrompts(u.note);
              return (
                <li key={u.id} className={cn(card, !u.included && "bg-bg-subtle/50 shadow-none")}>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={`ar-unfunded-${u.id}`}
                      checked={u.included}
                      disabled={!canEdit}
                      onCheckedChange={(v) =>
                        apply({ op: "set", path: ["lookingForward", "unfunded", u.id, "included"], value: v === true })
                      }
                    />
                    <label htmlFor={`ar-unfunded-${u.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="font-medium">{u.name?.trim() || d?.name || "New company"}</span>
                      {founders.length > 0 && (
                        <span className="ml-2 text-xs text-fg-subtle">{founders.map(formatFounder).join(" & ")}</span>
                      )}
                    </label>
                    {u.included && (!u.note.trim() || prompts > 0) && <Badge variant="warning">Needs a note</Badge>}
                    {canEdit && !d && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        aria-label="Remove"
                        onClick={() => apply({ op: "remove", path: ["lookingForward", "unfunded", u.id] })}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </div>
                  {u.included && (
                    <div className="mt-3 grid gap-3 md:pl-7">
                      {!d && (
                        <Field label="Company" htmlFor={`ar-unfunded-name-${u.id}`}>
                          <Input
                            id={`ar-unfunded-name-${u.id}`}
                            value={u.name ?? ""}
                            disabled={!canEdit}
                            maxLength={160}
                            onChange={(e) =>
                              apply({
                                op: "set",
                                path: ["lookingForward", "unfunded", u.id, "name"],
                                value: e.target.value,
                              })
                            }
                          />
                        </Field>
                      )}
                      <FoundersField
                        idPrefix={`ar-unfunded-${u.id}`}
                        value={u.founders}
                        fallback={d?.founders ?? []}
                        disabled={!canEdit}
                        onChange={(next) =>
                          apply({ op: "set", path: ["lookingForward", "unfunded", u.id, "founders"], value: next })
                        }
                      />
                      <Field
                        label="Note"
                        htmlFor={`ar-unfunded-note-${u.id}`}
                        hint={
                          prompts > 0
                            ? "Replace the [add: …] prompt with what actually happened."
                            : "One paragraph: what the company is, how you helped, where they are now."
                        }
                      >
                        <Textarea
                          id={`ar-unfunded-note-${u.id}`}
                          value={u.note}
                          disabled={!canEdit}
                          maxLength={1500}
                          onChange={(e) =>
                            apply({
                              op: "set",
                              path: ["lookingForward", "unfunded", u.id, "note"],
                              value: e.target.value,
                            })
                          }
                        />
                      </Field>
                      {canEdit && d && aiEnabled && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="self-start"
                          disabled={drafting !== null}
                          onClick={() => draftNote(u.id)}
                        >
                          <SparklesIcon />
                          {drafting === u.id ? "Drafting…" : "Draft with AI"}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && !aiEnabled && unfunded.some((u) => candidates.has(u.id)) && (
          <div className="mt-2">
            <AiHint />
          </div>
        )}
      </EditorSection>
    </>
  );
}
