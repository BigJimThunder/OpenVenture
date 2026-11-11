"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { createPoolFromSettings, deletePool, updatePool } from "@/lib/actions/pools";
import { cn, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { Field } from "@/components/patterns/field";

export type PoolRow = {
  id: string;
  name: string;
  fiscalYear: number;
  totalBudget: string;
  rolloverFromPrior: string;
  notes: string | null;
  /** Derived by the page via the budget helpers; display only. */
  total: number;
  committed: number;
  deployed: number;
  remaining: number;
  grantCount: number;
  /** Every grant row pointing at the pool, including proposed and cancelled. */
  linkedGrants: number;
};

/** Strips trailing ".00" so the edit field shows 10000, not 10000.00. */
const editable = (amount: string) => amount.replace(/\.00$/, "");

export function PoolManager({
  pools,
  suggestedFiscalYear,
}: {
  pools: PoolRow[];
  suggestedFiscalYear: number;
}) {
  const [editing, setEditing] = React.useState<PoolRow | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<PoolRow | null>(null);
  const router = useRouter();

  async function remove(pool: PoolRow) {
    const res = await deletePool({ poolId: pool.id });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`${pool.name} deleted`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {pools.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-6 text-center">
          <p className="text-sm font-medium">No grant pool yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
            A pool is one year&apos;s budget. Every grant draws from one, and approvals are refused
            the moment they would overdraw it.
          </p>
          <Button className="mt-4 max-md:h-10" onClick={() => setEditing("new")}>
            <PlusIcon />
            Create this year&apos;s pool
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {pools.map((p) => {
              const spoken = p.committed + p.deployed;
              const pct = p.total > 0 ? Math.min(100, (spoken / p.total) * 100) : 0;
              return (
                <li key={p.id} className="rounded-lg border border-border bg-panel p-4 shadow-xs">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-sm font-semibold">{p.name}</span>
                        <span className="tnum shrink-0 text-xs text-fg-subtle">FY{p.fiscalYear}</span>
                      </div>
                      <div className="tnum mt-0.5 text-xs text-fg-muted">
                        {formatMoney(p.totalBudget)} budget
                        {Number(p.rolloverFromPrior) > 0 &&
                          ` + ${formatMoney(p.rolloverFromPrior)} rolled over`}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setEditing(p)}>
                        <PencilIcon />
                        Edit
                      </Button>
                      {/* A pool with grants is financial record; only an unused one can go. */}
                      {p.linkedGrants === 0 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="max-md:size-10"
                          onClick={() => setDeleting(p)}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-subtle"
                    role="img"
                    aria-label={`${Math.round(pct)}% of the pool is committed or paid`}
                  >
                    <div
                      className={cn("h-full rounded-full", p.remaining < 0 ? "bg-danger" : "bg-accent")}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <dl className="tnum mt-2 grid grid-cols-3 gap-2 text-xs">
                    <Stat label="Paid out" value={formatMoney(p.deployed)} />
                    <Stat label="Committed" value={formatMoney(p.committed)} />
                    <Stat
                      label="Remaining"
                      value={formatMoney(p.remaining)}
                      className={p.remaining < 0 ? "text-danger" : undefined}
                    />
                  </dl>
                  {p.notes && <p className="mt-2 text-xs whitespace-pre-line text-fg-muted">{p.notes}</p>}
                </li>
              );
            })}
          </ul>
          <div>
            <Button variant="secondary" size="sm" className="max-md:h-10" onClick={() => setEditing("new")}>
              <PlusIcon />
              New pool
            </Button>
          </div>
        </>
      )}

      {editing && (
        <PoolDialog
          key={editing === "new" ? "new" : editing.id}
          pool={editing === "new" ? null : editing}
          suggestedFiscalYear={suggestedFiscalYear}
          onClose={() => setEditing(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setDeleting(null)}
          title={`Delete ${deleting.name}?`}
          description="Nothing has been granted from this pool, so deleting it loses nothing. This can't be undone."
          confirmLabel="Delete pool"
          tone="danger"
          onConfirm={() => remove(deleting)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={cn("mt-0.5 text-sm font-medium", className)}>{value}</dd>
    </div>
  );
}

function PoolDialog({
  pool,
  suggestedFiscalYear,
  onClose,
}: {
  pool: PoolRow | null;
  suggestedFiscalYear: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const spoken = pool ? pool.committed + pool.deployed : 0;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields = {
      name: String(fd.get("name") ?? ""),
      fiscalYear: Number(fd.get("fiscalYear")),
      totalBudget: String(fd.get("totalBudget") ?? "").replace(/[$,\s]/g, ""),
      rolloverFromPrior: String(fd.get("rolloverFromPrior") ?? "").replace(/[$,\s]/g, "") || "0",
      notes: String(fd.get("notes") ?? "").trim() || null,
    };
    setBusy(true);
    const res = pool
      ? await updatePool({ poolId: pool.id, ...fields })
      : await createPoolFromSettings(fields);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(pool ? "Pool saved" : "Pool created");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pool ? `Edit ${pool.name}` : "New grant pool"}</DialogTitle>
          <DialogDescription>
            One pool per fiscal year. What&apos;s left is always worked out from the grants — it is
            never typed in.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Name">
              <Input
                id="pool-name"
                name="name"
                required
                minLength={2}
                maxLength={80}
                autoFocus={!pool}
                defaultValue={pool?.name ?? `FY${suggestedFiscalYear} grants`}
              />
            </Field>
            <Field label="Fiscal year">
              <Input
                id="pool-fy"
                name="fiscalYear"
                type="number"
                required
                min={2000}
                max={2100}
                className="tnum"
                defaultValue={pool?.fiscalYear ?? suggestedFiscalYear}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Budget">
              <Input leading="$"
                id="pool-budget"
                name="totalBudget"
                required
                inputMode="decimal"
                placeholder="10000"
                className="tnum"
                defaultValue={pool ? editable(pool.totalBudget) : ""}
              />
            </Field>
            <Field label="Rolled over">
              <Input leading="$"
                id="pool-rollover"
                name="rolloverFromPrior"
                inputMode="decimal"
                placeholder="0"
                className="tnum"
                defaultValue={pool ? editable(pool.rolloverFromPrior) : ""}
              />
            </Field>
          </div>
          {pool && spoken > 0 && (
            <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
              <span className="tnum font-medium text-fg">{formatMoney(spoken)}</span> is already
              committed or paid from this pool. Budget plus rollover can&apos;t go below that.
            </p>
          )}
          <Field label="Notes">
            <Textarea
              id="pool-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              placeholder="Where the money comes from, who approved it, anything next year's treasurer should know."
              defaultValue={pool?.notes ?? ""}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : pool ? "Save pool" : "Create pool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
