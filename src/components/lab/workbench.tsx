"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Undo2Icon, AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteLastCapEvent } from "@/lib/actions/captable";
import type { CapEventInput, CapTableState } from "@/lib/captable/types";
import { formatPct } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddEventDialog } from "./add-event-dialog";
import { RoundPreview } from "./round-preview";
import { ShowYourWork } from "./show-your-work";

const KIND_LABELS: Record<string, string> = {
  founding_issuance: "Founding issuance",
  share_issuance: "Share issuance",
  pool_create: "Pool created",
  pool_increase: "Pool increase",
  option_grant: "Option grant",
  safe_issue: "SAFE",
  note_issue: "Convertible note",
  priced_round: "Priced round",
  share_transfer: "Transfer",
  stock_split: "Stock split",
};

export function LabWorkbench({
  capTableId,
  events,
  state,
  foldError,
}: {
  capTableId: string;
  events: CapEventInput[];
  state: CapTableState | null;
  foldError: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function undoLast() {
    setBusy(true);
    const res = await deleteLastCapEvent({ capTableId });
    setBusy(false);
    if (!res.ok) toast.error(res.error);
    else {
      toast.success("Last event removed");
      router.refresh();
    }
  }

  const existingStakeholders = state
    ? state.rows
        .filter((r) => r.stakeholderId !== "__pool__")
        .map((r) => ({ id: r.stakeholderId, name: r.name, kind: r.kind }))
    : [];

  return (
    <div className="grid gap-3 lg:grid-cols-[340px_1fr]">
      {/* Ledger */}
      <div className="flex flex-col gap-3 self-start">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Ledger</CardTitle>
            <div className="flex gap-1.5">
              {events.length > 0 && (
                <Button variant="ghost" size="icon-sm" onClick={undoLast} disabled={busy} title="Undo last event">
                  <Undo2Icon />
                </Button>
              )}
              <AddEventDialog capTableId={capTableId} existingStakeholders={existingStakeholders} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {events.length === 0 && (
              <p className="py-2 text-xs text-fg-muted">
                Empty ledger. Start with a founding issuance.
              </p>
            )}
            {events.map((e) => (
              <div key={e.seq} className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5">
                <span className="tnum w-5 shrink-0 text-2xs text-fg-subtle">{e.seq}.</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{e.label ?? KIND_LABELS[e.payload.kind]}</div>
                  <div className="text-2xs text-fg-subtle">{KIND_LABELS[e.payload.kind]}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Ownership + analysis */}
      <div className="flex min-w-0 flex-col gap-3">
        {foldError && (
          <Card className="border-danger-border bg-danger-bg">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-danger">
              <AlertTriangleIcon className="size-4 shrink-0" />
              {foldError}
            </CardContent>
          </Card>
        )}

        {state && (
          <>
            <Card>
              <CardHeader className="flex-row items-baseline justify-between">
                <CardTitle>Ownership — fully diluted</CardTitle>
                <span className="tnum text-xs text-fg-muted">
                  {Number(state.totalFullyDiluted).toLocaleString("en-US", { maximumFractionDigits: 0 })} shares
                  {state.pricePerShare
                    ? ` · last round ${state.lastRoundName} @ $${Number(state.pricePerShare).toFixed(4)}/sh`
                    : ""}
                </span>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stakeholder</TableHead>
                      <TableHead className="text-right">Shares</TableHead>
                      <TableHead className="text-right">Ownership</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {state.rows.map((r) => (
                      <TableRow key={r.stakeholderId}>
                        <TableCell>
                          <span className="font-medium">{r.name}</span>
                          <span className="ml-2 text-2xs capitalize text-fg-subtle">{r.kind}</span>
                        </TableCell>
                        <TableCell className="tnum text-right">
                          {Number(r.shares).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </TableCell>
                        <TableCell className="tnum text-right font-medium">
                          {formatPct(r.pct, 2)}
                        </TableCell>
                        <TableCell>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${Math.min(100, r.pct * 100)}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {state.outstanding.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1.5 rounded-md border border-dashed border-border p-3">
                    <div className="text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                      Outstanding convertibles — not yet in the table above
                    </div>
                    {state.outstanding.map((o) => (
                      <div key={o.instrumentId} className="flex items-center justify-between text-sm">
                        <span>
                          {o.holder}
                          <Badge variant="neutral" className="ml-2">
                            {o.type === "safe" ? "SAFE" : "Note"}
                            {o.mfn ? " · MFN" : ""}
                          </Badge>
                        </span>
                        <span className="tnum text-xs text-fg-muted">
                          ${Number(o.principal).toLocaleString()}
                          {o.valuationCap
                            ? ` @ $${Number(o.valuationCap).toLocaleString()} ${o.capType.replace("_", "-")} cap`
                            : " uncapped"}
                          {o.discount ? ` · ${Math.round(o.discount * 100)}% disc` : ""}
                        </span>
                      </div>
                    ))}
                    <p className="text-2xs text-fg-subtle">
                      These convert at the next priced round — preview one below to see the dilution.
                    </p>
                  </div>
                )}

                {state.warnings.length > 0 && (
                  <div className="mt-3 flex flex-col gap-1">
                    {state.warnings.map((w, i) => (
                      <p key={i} className="flex items-center gap-1.5 text-xs text-warning">
                        <AlertTriangleIcon className="size-3.5 shrink-0" />
                        {w}
                      </p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {state.derivations.length > 0 && <ShowYourWork derivations={state.derivations} />}

            <RoundPreview capTableId={capTableId} events={events} currentState={state} />
          </>
        )}
      </div>
    </div>
  );
}
