"use client";

import * as React from "react";
import { parseAsString, useQueryStates } from "nuqs";
import { XIcon } from "lucide-react";
import { APPLICATION_PRIORITIES } from "@/db/schema";
import {
  DEFAULT_FILTERS,
  STATUS_FILTERS,
  activeFilterCount,
  type PipelineFilters as Filters,
} from "@/lib/pipeline/filters";
import { cn, seasonLabel } from "@/lib/utils";
import { PRIORITY_LABELS } from "@/components/patterns/priority-glyph";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

const STATUS_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  all: "Any",
  open: "Open",
  funded: "Funded",
  declined: "Declined",
};

const chip =
  "h-7 w-auto shrink-0 gap-1 rounded-md border-border bg-panel px-2 py-0 text-xs text-fg-muted shadow-none max-md:h-9 max-md:px-3 max-md:text-sm";
const chipActive = "border-accent/50 bg-accent-subtle text-accent";

// Server components re-read these on change, so every update is a real
// navigation (shallow: false); defaults are dropped from the URL.
const parsers = {
  status: parseAsString.withDefault(DEFAULT_FILTERS.status),
  season: parseAsString.withDefault(DEFAULT_FILTERS.season),
  owner: parseAsString.withDefault(DEFAULT_FILTERS.owner),
  sector: parseAsString.withDefault(DEFAULT_FILTERS.sector),
  priority: parseAsString.withDefault(DEFAULT_FILTERS.priority),
};

/**
 * The pipeline filter bar. `filters` is what the server parsed and applied
 * (lib/pipeline/filters), so a chip can never show a state the list isn't in.
 */
export function PipelineFilters({
  filters,
  seasons,
  members,
  sectors,
}: {
  filters: Filters;
  seasons: number[];
  members: { id: string; displayName: string }[];
  sectors: { id: string; name: string }[];
}) {
  const [, setParams] = useQueryStates(parsers, { shallow: false, history: "replace" });
  const [pending, startTransition] = React.useTransition();

  const set = (patch: Partial<Filters>) => {
    startTransition(() => {
      void setParams(patch);
    });
  };
  const count = activeFilterCount(filters);
  const ownerLabel =
    filters.owner === "all"
      ? "Anyone"
      : filters.owner === "me"
        ? "Me"
        : filters.owner === "none"
          ? "Unassigned"
          : (members.find((m) => m.id === filters.owner)?.displayName ?? "Former member");

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]",
        pending && "opacity-70"
      )}
    >
      <button
        type="button"
        aria-pressed={filters.owner === "me"}
        onClick={() => set({ owner: filters.owner === "me" ? "all" : "me" })}
        className={cn(
          "inline-flex cursor-pointer items-center border font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
          chip,
          filters.owner === "me" && chipActive
        )}
      >
        Mine
      </button>

      <Select value={filters.status} onValueChange={(v) => set({ status: v as Filters["status"] })}>
        <SelectTrigger className={cn(chip, filters.status !== "all" && chipActive)} aria-label="Filter by status">
          <span>
            Status <span className="font-medium">{STATUS_LABELS[filters.status]}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((v) => (
            <SelectItem key={v} value={v}>
              {STATUS_LABELS[v]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filters.owner} onValueChange={(v) => set({ owner: v })}>
        <SelectTrigger className={cn(chip, filters.owner !== "all" && chipActive)} aria-label="Filter by owner">
          <span>
            Owner <span className="font-medium">{ownerLabel}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Anyone</SelectItem>
          <SelectItem value="me">Me</SelectItem>
          <SelectItem value="none">Unassigned</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sectors.length > 0 && (
        <Select value={filters.sector} onValueChange={(v) => set({ sector: v })}>
          <SelectTrigger className={cn(chip, filters.sector !== "all" && chipActive)} aria-label="Filter by sector">
            <span>
              Sector{" "}
              <span className="font-medium">
                {filters.sector === "all"
                  ? "Any"
                  : (sectors.find((s) => s.id === filters.sector)?.name ?? "Archived")}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any</SelectItem>
            {sectors.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={filters.priority} onValueChange={(v) => set({ priority: v as Filters["priority"] })}>
        <SelectTrigger className={cn(chip, filters.priority !== "all" && chipActive)} aria-label="Filter by priority">
          <span>
            Priority{" "}
            <span className="font-medium">
              {filters.priority === "all" ? "Any" : PRIORITY_LABELS[filters.priority]}
            </span>
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any</SelectItem>
          {APPLICATION_PRIORITIES.map((p) => (
            <SelectItem key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {seasons.length > 1 && (
        <Select value={filters.season} onValueChange={(v) => set({ season: v })}>
          <SelectTrigger className={cn(chip, filters.season !== "all" && chipActive)} aria-label="Filter by season">
            <span>
              Season{" "}
              <span className="font-medium">
                {filters.season === "all" ? "All" : seasonLabel(Number(filters.season))}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            {seasons.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {seasonLabel(y)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {count > 0 && (
        <button
          type="button"
          onClick={() => set(DEFAULT_FILTERS)}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-9 max-md:px-2.5 max-md:text-sm"
        >
          <XIcon className="size-3" />
          Clear
        </button>
      )}
    </div>
  );
}
