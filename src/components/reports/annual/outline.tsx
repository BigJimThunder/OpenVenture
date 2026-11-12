"use client";

import * as React from "react";
import { CheckIcon, CircleDashedIcon, CircleIcon } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  SECTION_TITLES,
  spreadStatus,
  type AnnualContent,
  type AnnualDerived,
  type AnnualProgress,
  type SectionState,
} from "@/lib/reports/annual";
import { cn } from "@/lib/utils";
import { MoveButtons } from "./fields";
import type { AnnualDraft } from "./use-annual-draft";

function StateIcon({ state }: { state: SectionState }) {
  if (state === "ready") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success text-panel">
        <CheckIcon className="size-2.5" strokeWidth={3.5} />
        <span className="sr-only">Ready</span>
      </span>
    );
  }
  return state === "started" ? (
    <CircleDashedIcon className="size-4 shrink-0 text-warning" aria-label="In progress" />
  ) : (
    <CircleIcon className="size-4 shrink-0 text-fg-subtle" aria-label="Not started" />
  );
}

const SPREAD_DOT = { needs_essay: "bg-warning", draft: "bg-info", reviewed: "bg-success" } as const;
const SPREAD_LABEL = { needs_essay: "Needs essay", draft: "Draft", reviewed: "Reviewed" } as const;

const row =
  "flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-2.5";

/**
 * The section rail: what is in the report, in what order, and how far along
 * each part is. Ends with the list of things only a person can supply.
 */
export function Outline({
  content,
  derived,
  progress,
  selected,
  onSelect,
  apply,
  canEdit,
}: {
  content: AnnualContent;
  derived: AnnualDerived;
  progress: AnnualProgress;
  selected: string;
  onSelect: (target: string) => void;
  apply: AnnualDraft["apply"];
  canEdit: boolean;
}) {
  const names = new Map(derived.companies.map((c) => [c.companyId, c.name]));
  const spreads = content.companies.filter((c) => c.included && names.has(c.id));

  return (
    <nav aria-label="Report outline" className="flex flex-col gap-4 p-3">
      <div>
        <div className="flex items-baseline justify-between px-2 text-xs">
          <span className="font-medium">
            <span className="tnum">{progress.ready}</span> of <span className="tnum">{progress.total}</span>{" "}
            sections ready
          </span>
        </div>
        <Progress
          className="mx-2 mt-1.5 w-auto"
          value={progress.total === 0 ? 0 : (progress.ready / progress.total) * 100}
          indicatorClassName="bg-success"
          aria-label="Report sections ready"
        />
      </div>

      <ul className="flex flex-col gap-0.5">
        <li>
          <button
            type="button"
            className={cn(row, selected === "cover" && "bg-accent-subtle text-accent hover:bg-accent-subtle")}
            aria-current={selected === "cover" ? "true" : undefined}
            onClick={() => onSelect("cover")}
          >
            <StateIcon state="ready" />
            <span className="truncate font-medium">Cover and contents</span>
          </button>
        </li>
        {content.sections.map((s, index) => {
          const title = s.title.trim() || SECTION_TITLES[s.id];
          const active = selected === s.id;
          return (
            <li key={s.id}>
              <div className={cn("group flex items-center rounded-md", active && "bg-accent-subtle")}>
                <button
                  type="button"
                  className={cn(
                    row,
                    "flex-1",
                    active && "text-accent hover:bg-transparent",
                    !s.included && "text-fg-subtle"
                  )}
                  aria-current={active ? "true" : undefined}
                  onClick={() => onSelect(s.id)}
                >
                  {s.included ? (
                    <StateIcon state={progress.sections[s.id].state} />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className={cn("truncate font-medium", !s.included && "line-through decoration-fg-subtle/50")}>
                    {title}
                  </span>
                </button>
                {canEdit && (
                  <span className="flex shrink-0 items-center gap-0.5 pr-1.5">
                    <span className="md:hidden md:group-focus-within:block md:group-hover:block">
                      <MoveButtons
                        label={title}
                        first={index === 0}
                        last={index === content.sections.length - 1}
                        onMove={(by) => apply({ op: "move", path: ["sections", s.id], by })}
                      />
                    </span>
                    <Switch
                      aria-label={`Include ${title}`}
                      checked={s.included}
                      onCheckedChange={(value) => apply({ op: "set", path: ["sections", s.id, "included"], value })}
                    />
                  </span>
                )}
              </div>
              {s.id === "companies" && s.included && spreads.length > 0 && (
                <ul className="mt-0.5 ml-4 flex flex-col gap-0.5 border-l border-border pl-2">
                  {spreads.map((c) => {
                    const target = `company:${c.id}`;
                    const status = spreadStatus(c);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={cn(
                            row,
                            selected === target && "bg-accent-subtle text-accent hover:bg-accent-subtle"
                          )}
                          aria-current={selected === target ? "true" : undefined}
                          onClick={() => onSelect(target)}
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", SPREAD_DOT[status])} />
                          <span className="min-w-0 flex-1 truncate">{names.get(c.id)}</span>
                          <span className="shrink-0 text-2xs text-fg-subtle">{SPREAD_LABEL[status]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border pt-3">
        <h2 className="px-2 text-xs font-semibold">What&apos;s missing</h2>
        {progress.missing.length === 0 ? (
          <p className="mt-1 px-2 text-xs text-fg-muted">
            Nothing. Every included section has what it needs; read it through once and finalize.
          </p>
        ) : (
          <>
            <p className="mt-0.5 px-2 text-xs text-fg-muted">
              The numbers are done. These need a person{progress.summary ? `: ${progress.summary}.` : "."}
            </p>
            <ul className="mt-1.5 flex flex-col">
              {progress.missing.map((item, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={cn(row, "items-start text-xs text-fg-muted hover:text-fg")}
                    onClick={() => onSelect(item.target)}
                  >
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
                    <span>{item.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </nav>
  );
}
