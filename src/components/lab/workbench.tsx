"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Undo2Icon, AlertTriangleIcon, HourglassIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteLastCapEvent } from "@/lib/actions/captable";
import type { CapEventInput, CapTableState } from "@/lib/captable/types";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, dataTable } from "@/components/patterns/data-panel";
import { StatStrip, StatStripItem } from "@/components/patterns/data-stat-strip";
import { AddEventDialog } from "./add-event-dialog";
import { RoundPreview } from "./round-preview";
import { ShowYourWork } from "./show-your-work";
import { HolderName, OwnershipBar } from "./ownership";
import { KIND_LABELS, POOL_ID, describeEvent, dollars, holderColors, pct, shares } from "./format";

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
  const canContribute = useCan("contribute");
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

  const colorOf = React.useMemo(() => holderColors(events), [events]);
  const holders = state ? state.rows.filter((r) => r.stakeholderId !== POOL_ID) : [];
  const existingStakeholders = holders.map((r) => ({ id: r.stakeholderId, name: r.name, kind: r.kind }));
  const classIds = state
    ? Array.from(new Set(state.rows.flatMap((r) => Object.keys(r.byClass))))
    : [];

  return (
    <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
      {/* Ledger — what happened, in order */}
      <Panel
        className="self-start max-xl:order-2 xl:sticky xl:top-3"
        title="Ledger"
        note={`${events.length} ${events.length === 1 ? "event" : "events"}`}
        actions={
          canContribute ? (
            <AddEventDialog capTableId={capTableId} existingStakeholders={existingStakeholders} />
          ) : undefined
        }
        footer="Events are append-only. The table on the right is recomputed from them every time, so the two can never disagree."
      >
        {events.length === 0 ? (
          <div className="px-3.5 py-5 text-sm text-fg-muted">
            <p className="font-medium text-fg">An empty company.</p>
            <p className="mt-1">
              Start by issuing the founders their shares — 4,000,000 each is a common starting
              point. Then add whatever the founder has been offered: a SAFE, a note, an option
              pool.
            </p>
          </div>
        ) : (
          <ol className="relative px-3.5 py-3">
            <span className="absolute top-5 bottom-5 left-[23px] w-px bg-border" aria-hidden />
            {events.map((e, i) => {
              const last = i === events.length - 1;
              return (
                <li key={e.seq} className="relative flex gap-3 pb-3.5 last:pb-0">
                  <span className="tnum z-[1] flex size-5 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-2xs font-medium text-fg-muted">
                    {e.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm leading-5 font-medium">
                        {e.label ?? KIND_LABELS[e.payload.kind]}
                      </span>
                      {last && canContribute && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="-my-1 -mr-1.5 shrink-0 text-fg-subtle"
                          onClick={undoLast}
                          disabled={busy}
                        >
                          <Undo2Icon />
                          Undo
                        </Button>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-muted">{describeEvent(e.payload)}</div>
                    <div className="mt-1 text-2xs text-fg-subtle">{KIND_LABELS[e.payload.kind]}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      {/* Result — who owns what, and what a round would do */}
      <div className="flex min-w-0 flex-col gap-3 max-xl:order-1">
        {foldError && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-border bg-danger-bg p-3.5 text-sm text-danger">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">This ledger doesn&apos;t add up</div>
              <p className="mt-0.5">{foldError}</p>
              {canContribute && <p className="mt-1">Undo the last event to get back to a working table.</p>}
            </div>
          </div>
        )}

        {state && state.rows.length === 0 && (
          <Panel title="Who owns the company">
            <p className="px-3.5 py-8 text-center text-sm text-fg-muted">
              Nobody yet. The ownership table appears as soon as the ledger has its first shares.
            </p>
          </Panel>
        )}

        {state && state.rows.length > 0 && (
          <>
            <StatStrip variant="card">
              <StatStripItem
                label="Fully diluted shares"
                value={shares(state.totalFullyDiluted)}
                hint="every share, issued or reserved"
              />
              <StatStripItem
                label="Stakeholders"
                value={holders.length}
                hint={Number(state.poolUnissued) > 0 ? `plus an unissued option pool` : "no option pool yet"}
              />
              <StatStripItem
                label="Last priced round"
                value={state.pricePerShare ? `$${Number(state.pricePerShare).toFixed(4)}` : "—"}
                hint={state.pricePerShare ? `per share · ${state.lastRoundName}` : "no priced round yet"}
              />
              <StatStripItem
                label="Not yet converted"
                value={state.outstanding.length}
                hint={state.outstanding.length > 0 ? "convert at the next round" : "no SAFEs or notes"}
                tone={state.outstanding.length > 0 ? "warning" : "default"}
              />
            </StatStrip>

            <Panel title="Who owns the company" note="fully diluted">
              <div className="border-b border-border px-3.5 py-3.5">
                <OwnershipBar rows={state.rows} colorOf={colorOf} />
              </div>
              <div className="overflow-x-auto">
                <table className={dataTable.table}>
                  <thead>
                    <tr>
                      <th className={cn(dataTable.th, "static")}>Stakeholder</th>
                      {classIds.length > 1 &&
                        classIds.map((c) => (
                          <th key={c} className={cn(dataTable.th, "static text-right capitalize max-md:hidden")}>
                            {c}
                          </th>
                        ))}
                      <th className={cn(dataTable.th, "static text-right")}>Shares</th>
                      <th className={cn(dataTable.th, "static text-right")}>Ownership</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((r) => (
                      <tr key={r.stakeholderId} className={dataTable.row}>
                        <td className={dataTable.td}>
                          <HolderName row={r} color={colorOf(r.stakeholderId)} />
                        </td>
                        {classIds.length > 1 &&
                          classIds.map((c) => (
                            <td key={c} className={cn(dataTable.td, dataTable.num, "text-fg-muted max-md:hidden")}>
                              {r.byClass[c] ? shares(r.byClass[c]) : "—"}
                            </td>
                          ))}
                        <td className={cn(dataTable.td, dataTable.num)}>{shares(r.shares)}</td>
                        <td className={cn(dataTable.td, dataTable.num, "font-semibold")}>{pct(r.pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {state.outstanding.length > 0 && (
                <div className="border-t border-border bg-warning-bg/50 px-3.5 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <HourglassIcon className="size-3.5 text-warning" />
                    Promised, but not on the table yet
                  </div>
                  <p className="mt-0.5 max-w-prose text-xs text-fg-muted">
                    SAFEs and notes are money in exchange for shares later. They own nothing today
                    and convert at the next priced round — which is when the founders feel them.
                    Preview a round below to see it.
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {state.outstanding.map((o) => (
                      <li key={o.instrumentId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{o.holder}</span>
                          <Badge variant="outline">
                            {o.type === "safe" ? "SAFE" : "Note"}
                            {o.mfn ? " · MFN" : ""}
                          </Badge>
                        </span>
                        <span className="tnum text-xs text-fg-muted">
                          {dollars(o.principal)}
                          {o.valuationCap
                            ? ` at a ${dollars(o.valuationCap)} ${o.capType.replace("_", "-")} cap`
                            : " · uncapped"}
                          {o.discount ? ` · ${Math.round(o.discount * 100)}% discount` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {state.warnings.length > 0 && (
                <ul className="flex flex-col gap-1 border-t border-border px-3.5 py-2.5">
                  {state.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangleIcon className="mt-px size-3.5 shrink-0" />
                      {w}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <ShowYourWork title="How the table was computed" derivations={state.derivations} />

            <RoundPreview capTableId={capTableId} events={events} currentState={state} />
          </>
        )}
      </div>
    </div>
  );
}
