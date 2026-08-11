"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { seasonLabel } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  open: "Open",
  funded: "Funded",
  declined: "Declined",
};

const chipClass =
  "h-auto w-auto rounded-[5px] border-border bg-bg-subtle px-2 py-0.5 text-[11.5px] text-fg-muted shadow-none";

export function PipelineFilters({
  status,
  season,
  seasons,
}: {
  status: string;
  season: string;
  seasons: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = React.useCallback(
    (key: string, value: string, defaultValue: string) => {
      const next = new URLSearchParams(searchParams);
      if (value === defaultValue) next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <>
      <Select value={status} onValueChange={(v) => setParam("status", v, "all")}>
        <SelectTrigger className={chipClass} aria-label="Filter by status">
          <span>
            Status <span className="text-fg">is {STATUS_LABELS[status] ?? status}</span>
          </span>
        </SelectTrigger>
        <SelectContent>
          {Object.entries(STATUS_LABELS).map(([v, label]) => (
            <SelectItem key={v} value={v}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={season} onValueChange={(v) => setParam("season", v, "all")}>
        <SelectTrigger className={chipClass} aria-label="Filter by season">
          <span>
            Season{" "}
            <span className="text-fg">
              is {season === "all" ? "All" : seasonLabel(Number(season))}
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
    </>
  );
}
