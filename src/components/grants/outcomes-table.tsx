"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { ClockAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { setOutcomeTier } from "@/lib/actions/grants";
import { OUTCOME_TIERS, type OutcomeTier } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Money } from "@/components/patterns/money";
import { Panel, dataTable } from "@/components/patterns/data-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIER_META } from "./tiers";

const STALE_MS = 90 * 24 * 60 * 60 * 1000;

type Row = {
  companyId: string;
  companyName: string;
  oneLiner: string | null;
  outcomeTier: OutcomeTier | null;
  outcomeUpdatedAt: string | null;
  grantTotal: number;
  firstIssuedAt: string | null;
};

export function OutcomesTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const canContribute = useCan("contribute");
  const [now] = React.useState(() => Date.now());
  const [saving, setSaving] = React.useState<string | null>(null);

  async function update(row: Row, tier: OutcomeTier) {
    setSaving(row.companyId);
    const res = await setOutcomeTier({ companyId: row.companyId, tier });
    setSaving(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`${row.companyName} recorded as ${TIER_META[tier].label.toLowerCase()}`);
    router.refresh();
  }

  const isStale = (r: Row) =>
    !r.outcomeUpdatedAt || now - new Date(r.outcomeUpdatedAt).getTime() > STALE_MS;

  function tierControl(r: Row) {
    if (!canContribute) {
      return (
        <span className="text-sm">{r.outcomeTier ? TIER_META[r.outcomeTier].label : "Not recorded"}</span>
      );
    }
    return (
      <Select
        value={r.outcomeTier ?? undefined}
        disabled={saving === r.companyId}
        onValueChange={(v) => update(r, v as OutcomeTier)}
      >
        <SelectTrigger className="h-8 w-full max-md:h-10 md:w-44" aria-label={`Outcome for ${r.companyName}`}>
          <SelectValue placeholder="Record an outcome" />
        </SelectTrigger>
        <SelectContent>
          {OUTCOME_TIERS.map((t) => (
            <SelectItem key={t} value={t}>
              {TIER_META[t].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  function checkIn(r: Row) {
    const stale = isStale(r);
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs", stale ? "text-warning" : "text-fg-muted")}>
        {stale && <ClockAlertIcon className="size-3.5 shrink-0" />}
        {r.outcomeUpdatedAt
          ? `${formatDistanceToNow(new Date(r.outcomeUpdatedAt), { addSuffix: true })}${stale ? " · due" : ""}`
          : "Never checked in"}
      </span>
    );
  }

  return (
    <>
      <Panel
        className="hidden md:flex"
        title="Portfolio companies"
        note="check in once a quarter; anything older than 90 days is flagged"
      >
        <table className={dataTable.table}>
          <thead>
            <tr>
              <th className={dataTable.th}>Company</th>
              <th className={cn(dataTable.th, "text-right")}>Granted</th>
              <th className={dataTable.th}>First grant</th>
              <th className={dataTable.th}>Outcome</th>
              <th className={dataTable.th}>Last check-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.companyId} className={dataTable.row}>
                <td className={cn(dataTable.td, "max-w-80 py-1.5")}>
                  <div className="font-medium">{r.companyName}</div>
                  {r.oneLiner && <div className="truncate text-xs text-fg-muted">{r.oneLiner}</div>}
                </td>
                <td className={cn(dataTable.td, dataTable.num, "font-medium")}>
                  <Money value={r.grantTotal} />
                </td>
                <td className={cn(dataTable.td, "tnum text-xs whitespace-nowrap text-fg-muted")}>
                  {r.firstIssuedAt ? format(new Date(r.firstIssuedAt), "MMM yyyy") : "—"}
                </td>
                <td className={dataTable.td}>{tierControl(r)}</td>
                <td className={cn(dataTable.td, "whitespace-nowrap")}>{checkIn(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((r) => (
          <li key={r.companyId} className="rounded-lg border border-border bg-panel p-3.5 shadow-xs">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">{r.companyName}</div>
                {r.oneLiner && <div className="line-clamp-2 text-xs text-fg-muted">{r.oneLiner}</div>}
              </div>
              <Money value={r.grantTotal} className="shrink-0 text-base font-semibold" />
            </div>
            <div className="mt-3">{tierControl(r)}</div>
            <div className="mt-2">{checkIn(r)}</div>
          </li>
        ))}
      </ul>
    </>
  );
}
