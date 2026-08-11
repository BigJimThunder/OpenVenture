"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { foldCapTable } from "@/lib/captable/engine";
import type { CapEventInput, CapTableState } from "@/lib/captable/types";
import { addCapEvent } from "@/lib/actions/captable";
import { cn, formatPct } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShowYourWork } from "./show-your-work";

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
          { stakeholder: { id: "preview-investor", name: investor || "New Investor", kind: "fund" }, amount: nm },
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
      label: `${investor || "New investor"} round — $${Number(newMoney).toLocaleString()} at $${Number(preMoney).toLocaleString()} pre`,
      payload: {
        kind: "priced_round",
        name: "Priced round",
        classId: "preferred",
        preMoneyValuation: Number(preMoney),
        newMoney: Number(newMoney),
        targetPoolPctPost: Number(poolPct) > 0 ? Number(poolPct) / 100 : undefined,
        participations: [
          {
            stakeholder: { id: "investor-" + Date.now().toString(36), name: investor || "New Investor", kind: "fund" },
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
  const afterRows = preview?.state?.rows ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4 text-fg-subtle" />
          Preview a priced round
        </CardTitle>
        <CardDescription>
          Live math — outstanding SAFEs and notes convert, the pool tops up, and dilution lands
          where the documents say it lands. Recomputed as you type; nothing is saved until you
          add it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pre">Pre-money ($)</Label>
            <Input id="pre" type="number" min={1} className="tnum" value={preMoney} onChange={(e) => setPreMoney(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nm">New money ($)</Label>
            <Input id="nm" type="number" min={1} className="tnum" value={newMoney} onChange={(e) => setNewMoney(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pool">Post pool (%)</Label>
            <Input id="pool" type="number" min={0} max={40} className="tnum" value={poolPct} onChange={(e) => setPoolPct(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="inv">Investor</Label>
            <Input id="inv" value={investor} onChange={(e) => setInvestor(e.target.value)} />
          </div>
        </div>

        {preview?.error && <p className="text-sm text-danger">{preview.error}</p>}

        {preview?.state && (
          <>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-subtle/60">
                    <th className="px-3 py-1.5 text-left text-2xs font-medium uppercase tracking-wide text-fg-subtle">Stakeholder</th>
                    <th className="px-3 py-1.5 text-right text-2xs font-medium uppercase tracking-wide text-fg-subtle">Before</th>
                    <th className="w-8" />
                    <th className="px-3 py-1.5 text-right text-2xs font-medium uppercase tracking-wide text-fg-subtle">After</th>
                    <th className="px-3 py-1.5 text-right text-2xs font-medium uppercase tracking-wide text-fg-subtle">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {afterRows.map((r) => {
                    const b = before.get(r.stakeholderId);
                    const delta = r.pct - (b?.pct ?? 0);
                    return (
                      <tr key={r.stakeholderId} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5 font-medium">{r.name}</td>
                        <td className="tnum px-3 py-1.5 text-right text-fg-muted">
                          {b ? formatPct(b.pct, 2) : "—"}
                        </td>
                        <td className="text-center text-fg-subtle">
                          <ArrowRightIcon className="inline size-3" />
                        </td>
                        <td className="tnum px-3 py-1.5 text-right font-medium">{formatPct(r.pct, 2)}</td>
                        <td
                          className={cn(
                            "tnum px-3 py-1.5 text-right text-xs",
                            delta > 0.0001 ? "text-success" : delta < -0.0001 ? "text-danger" : "text-fg-subtle"
                          )}
                        >
                          {delta > 0 ? "+" : ""}
                          {(delta * 100).toFixed(2)}pp
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ShowYourWork
              derivations={preview.state.derivations.slice(currentState.derivations.length)}
            />

            <div className="flex justify-end">
              <Button size="sm" onClick={commit} disabled={busy}>
                {busy ? "Adding…" : "Add this round to the ledger"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
