"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { setOutcomeTier } from "@/lib/actions/grants";
import { OUTCOME_TIERS, type OutcomeTier } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Money } from "@/components/patterns/money";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** The ladder, in order. Colors climb the categorical ramp with the tier. */
export const TIER_META: Record<OutcomeTier, { label: string; colorToken: string }> = {
  dormant: { label: "Dormant", colorToken: "cat-10" },
  incorporated: { label: "Incorporated", colorToken: "cat-2" },
  launched: { label: "Launched", colorToken: "cat-3" },
  revenue: { label: "Revenue", colorToken: "cat-4" },
  raised_round: { label: "Raised a round", colorToken: "cat-5" },
  accelerator: { label: "Accelerator", colorToken: "cat-6" },
  acquired: { label: "Acquired", colorToken: "cat-9" },
};

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
  const [now] = React.useState(() => Date.now());

  async function update(companyId: string, tier: OutcomeTier) {
    const res = await setOutcomeTier({ companyId, tier });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Outcome updated");
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-panel">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead className="text-right">Granted</TableHead>
            <TableHead>Outcome tier</TableHead>
            <TableHead>Last check-in</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const stale =
              !r.outcomeUpdatedAt || now - new Date(r.outcomeUpdatedAt).getTime() > STALE_MS;
            return (
              <TableRow key={r.companyId}>
                <TableCell>
                  <div className="font-medium">{r.companyName}</div>
                  {r.oneLiner && (
                    <div className="max-w-96 truncate text-2xs text-fg-subtle">{r.oneLiner}</div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Money value={r.grantTotal} />
                </TableCell>
                <TableCell>
                  <Select
                    value={r.outcomeTier ?? undefined}
                    onValueChange={(v) => update(r.companyId, v as OutcomeTier)}
                  >
                    <SelectTrigger className="h-7 w-44">
                      <SelectValue placeholder="Set tier…" />
                    </SelectTrigger>
                    <SelectContent>
                      {OUTCOME_TIERS.map((t) => (
                        <SelectItem key={t} value={t}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-1.5 rounded-full"
                              style={{ background: `var(--${TIER_META[t].colorToken})` }}
                            />
                            {TIER_META[t].label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs",
                      stale ? "text-warning" : "text-fg-muted"
                    )}
                  >
                    {stale && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertTriangleIcon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>
                          No check-in for 90+ days — ping the founder and update the tier.
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {r.outcomeUpdatedAt
                      ? formatDistanceToNow(new Date(r.outcomeUpdatedAt), { addSuffix: true })
                      : "never"}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
