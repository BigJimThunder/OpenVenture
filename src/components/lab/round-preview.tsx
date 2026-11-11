"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { foldCapTable } from "@/lib/captable/engine";
import type { CapEventInput, CapTableState } from "@/lib/captable/types";
import { addCapEvent } from "@/lib/actions/captable";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Panel, dataTable } from "@/components/patterns/data-panel";
import { ShowYourWork } from "./show-your-work";
import { HolderName, OwnershipBar } from "./ownership";
import { dollars, holderColors, pct, pointChange } from "./format";

const PREVIEW_INVESTOR_ID = "preview-investor";

/**
 * The what-if machine: append a hypothetical priced round and fold the
 * ledger CLIENT-SIDE (the engine is pure TypeScript), so before/after
 * dilution updates as you type. "Add to ledger" makes it real.
 */
export function RoundPreview({
  capTableId,
  events,
  currentState,
}: {
  capTableId: string;
  events: CapEventInput[];
  currentState: CapTableState;
}) {
  const router = useRouter();
  const canContribute = useCan("contribute");
  const [preMoney, setPreMoney] = React.useState("4000000");
  const [newMoney, setNewMoney] = React.useState("1000000");
  const [poolPct, setPoolPct] = React.useState("10");
  const [investor, setInvestor] = React.useState("New Investor");
  const [busy, setBusy] = React.useState(false);

  const preview = React.useMemo(() => {
    const pre = Number(preMoney);
    const nm = Number(newMoney);
    const pool = Number(poolPct);
    if (!Number.isFinite(pre) || pre <= 0 || !Number.isFinite(nm) || nm <= 0) return null;
    const nextSeq = events.length > 0 ? events[events.length - 1].seq + 1 : 1;
    const hypothetical: CapEventInput = {
      seq: nextSeq,
      effectiveDate: new Date(2100, 0, 1).toISOString(),
      label: "Hypothetical round",
      payload: {
        kind: "priced_round",
        name: "Preview round",
        classId: "preferred",
        preMoneyValuation: pre,
        newMoney: nm,
        targetPoolPctPost: Number.isFinite(pool) && pool > 0 ? pool / 100 : undefined,
        participations: [
          {
            stakeholder: { id: PREVIEW_INVESTOR_ID, name: investor || "New Investor", kind: "fund" },
            amount: nm,
          },
        ],
      },
    };
    try {
      return { state: foldCapTable([...events, hypothetical]), error: null as string | null };
    } catch (e) {
      return { state: null, error: e instanceof Error ? e.message : "Cannot compute" };
    }
  }, [events, preMoney, newMoney, poolPct, investor]);

  async function commit() {
    setBusy(true);
    const res = await addCapEvent({
      capTableId,
      label: `${investor || "New investor"} round — ${dollars(newMoney)} at ${dollars(preMoney)} pre`,
      payload: {
        kind: "priced_round",
        name: "Priced round",
        classId: "preferred",
        preMoneyValuation: Number(preMoney),
        newMoney: Number(newMoney),
        targetPoolPctPost: Number(poolPct) > 0 ? Number(poolPct) / 100 : undefined,
        participations: [
          {
            stakeholder: {
              id: "investor-" + Date.now().toString(36),
              name: investor || "New Investor",
              kind: "fund",
            },
            amount: Number(newMoney),
          },
        ],
      },
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Round added to the ledger");
    router.refresh();
  }

  const before = new Map(currentState.rows.map((r) => [r.stakeholderId, r]));
  const afterRows = React.useMemo(() => preview?.state?.rows ?? [], [preview]);
  const colorOf = React.useMemo(
    () => holderColors(events, afterRows.map((r) => r.stakeholderId)),
    [events, afterRows]
  );
  const converting = currentState.outstanding.length;

  return (
    <Panel
      title="What if they raise a priced round?"
      note="recomputed as you type · nothing is saved"
      bodyClassName="flex flex-col gap-4 p-3.5"
    >
      <p className="max-w-prose text-sm text-fg-muted">
        Set the terms an investor might offer.{" "}
        {converting > 0
          ? `The ${converting} outstanding ${converting === 1 ? "convertible converts" : "convertibles convert"} into shares, the option pool tops up, and everyone already on the table is diluted to make room.`
          : "The option pool tops up and everyone already on the table is diluted to make room for the new shares."}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field id="pre" label="Pre-money valuation" echo={moneyEcho(preMoney)}>
          <Input id="pre" type="number" inputMode="numeric" min={1} className="tnum" value={preMoney} onChange={(e) => setPreMoney(e.target.value)} />
        </Field>
        <Field id="nm" label="New money in" echo={moneyEcho(newMoney)}>
          <Input id="nm" type="number" inputMode="numeric" min={1} className="tnum" value={newMoney} onChange={(e) => setNewMoney(e.target.value)} />
        </Field>
        <Field id="pool" label="Option pool after" echo={`${poolPct || 0}% of the company, unissued`}>
          <Input id="pool" type="number" inputMode="numeric" min={0} max={40} className="tnum" value={poolPct} onChange={(e) => setPoolPct(e.target.value)} />
        </Field>
        <Field id="inv" label="Investor" echo="how they appear on the table">
          <Input id="inv" value={investor} onChange={(e) => setInvestor(e.target.value)} />
        </Field>
      </div>

      {!preview && (
        <p className="text-sm text-fg-muted">Enter a valuation and an amount to see the round.</p>
      )}
      {preview?.error && (
        <p className="rounded-md border border-danger-border bg-danger-bg p-2.5 text-sm text-danger">
          {preview.error}
        </p>
      )}

      {preview?.state && (
        <>
          <div className="flex flex-col gap-2">
            <OwnershipBar caption="Before" rows={currentState.rows} colorOf={colorOf} />
            <OwnershipBar caption="After" rows={afterRows} colorOf={colorOf} />
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className={dataTable.table}>
              <thead>
                <tr>
                  <th className={cn(dataTable.th, "static max-sm:px-2.5")}>Stakeholder</th>
                  <th className={cn(dataTable.th, "static text-right max-sm:px-2")}>Before</th>
                  <th className={cn(dataTable.th, "static text-right max-sm:px-2")}>After</th>
                  <th className={cn(dataTable.th, "static text-right max-sm:px-2.5")}>Change</th>
                </tr>
              </thead>
              <tbody>
                {afterRows.map((r) => {
                  const b = before.get(r.stakeholderId);
                  const change = pointChange(b?.pct, r.pct);
                  return (
                    <tr key={r.stakeholderId} className={dataTable.row}>
                      <td className={cn(dataTable.td, "h-9 w-full max-w-0 max-sm:px-2.5")}>
                        <HolderName
                          row={r}
                          color={colorOf(r.stakeholderId)}
                          badge={!b ? <Badge variant="neutral" className="max-sm:hidden">new</Badge> : undefined}
                        />
                      </td>
                      <td className={cn(dataTable.td, dataTable.num, "h-9 text-fg-muted max-sm:px-2")}>
                        {b ? pct(b.pct) : "—"}
                      </td>
                      <td className={cn(dataTable.td, dataTable.num, "h-9 font-medium max-sm:px-2")}>{pct(r.pct)}</td>
                      <td
                        className={cn(
                          dataTable.td,
                          dataTable.num,
                          "h-9 text-xs whitespace-nowrap max-sm:px-2.5",
                          change.direction === "up" && "text-success",
                          change.direction === "down" && "text-danger",
                          change.direction === "flat" && "text-fg-subtle"
                        )}
                      >
                        {change.label}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="-mt-2 text-2xs text-fg-subtle">
            pp = percentage points of the whole company. Losing points is dilution: a smaller slice,
            ideally of a larger pie.
          </p>

          <ShowYourWork
            title="How this round was computed"
            defaultOpen
            derivations={preview.state.derivations.slice(currentState.derivations.length)}
          />

          <div className="flex flex-wrap items-center justify-end gap-3">
            {canContribute ? (
              <Button size="sm" className="max-md:h-10 max-md:w-full" onClick={commit} disabled={busy}>
                {busy ? "Adding…" : "Add this round to the ledger"}
              </Button>
            ) : (
              <span className="text-xs text-fg-subtle">
                Read-only members can explore rounds here but not save them.
              </span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function moneyEcho(raw: string) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? dollars(n) : "enter an amount";
}

function Field({
  id,
  label,
  echo,
  children,
}: {
  id: string;
  label: string;
  /** The typed value read back in words — "4000000" is hard to parse at a glance. */
  echo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <span className="tnum truncate text-2xs text-fg-subtle">{echo}</span>
    </div>
  );
}
