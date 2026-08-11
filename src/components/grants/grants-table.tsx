"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { MoreHorizontalIcon, ReceiptIcon } from "lucide-react";
import { toast } from "sonner";
import {
  approveGrant,
  issueGrant,
  markGrantCashed,
  reconcileGrant,
  cancelGrant,
  addReceipt,
} from "@/lib/actions/grants";
import type { GrantRow } from "@/lib/queries/grants";
import { PAYMENT_METHODS, type PaymentMethod, type MemberRole, type GrantStatus } from "@/db/schema";
import { formatMoney } from "@/lib/utils";
import { USE_OF_FUNDS_LABELS } from "./new-grant-dialog";
import { Money } from "@/components/patterns/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_BADGE: Record<GrantStatus, { label: string; variant: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  proposed: { label: "Proposed", variant: "neutral" },
  approved: { label: "Approved", variant: "info" },
  issued: { label: "Issued", variant: "warning" },
  cashed: { label: "Cashed", variant: "warning" },
  reconciled: { label: "Reconciled", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

const isAdmin = (r: MemberRole) => r === "admin";
const isPartnerPlus = (r: MemberRole) => r === "admin" || r === "partner";

export function GrantsTable({
  grants,
  viewerRole,
}: {
  grants: GrantRow[];
  viewerRole: MemberRole;
}) {
  const router = useRouter();
  const [issueFor, setIssueFor] = React.useState<GrantRow | null>(null);
  const [receiptFor, setReceiptFor] = React.useState<GrantRow | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, success: string) {
    const res = await fn();
    if (!res.ok) {
      toast.error(res.error ?? "Something went wrong");
      return false;
    }
    const shortfall = (res.data as { receiptShortfall?: number } | undefined)?.receiptShortfall;
    if (shortfall) {
      toast.warning(
        `Reconciled, but receipts are ${formatMoney(shortfall, { cents: true })} short of the award`
      );
    } else {
      toast.success(success);
    }
    router.refresh();
    return true;
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border bg-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Awarded</TableHead>
              <TableHead>Use of funds</TableHead>
              <TableHead className="text-right">Receipts</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {grants.map((g) => {
              const badge = STATUS_BADGE[g.status];
              const receiptTotal = Number(g.receiptTotal);
              return (
                <TableRow key={g.id}>
                  <TableCell>
                    {g.applicationId ? (
                      <Link
                        href={`/applications/${g.applicationId}`}
                        className="font-medium hover:text-accent"
                      >
                        {g.companyName}
                      </Link>
                    ) : (
                      <span className="font-medium">{g.companyName}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={g.amountAwarded} />
                  </TableCell>
                  <TableCell className="text-xs text-fg-muted">
                    {USE_OF_FUNDS_LABELS[g.useOfFunds]}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => setReceiptFor(g)}
                      className="tnum cursor-pointer text-xs text-fg-muted hover:text-accent"
                      title="Add receipt"
                    >
                      {g.receiptCount > 0
                        ? `${formatMoney(receiptTotal)} · ${g.receiptCount}`
                        : "—"}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-fg-muted">
                    {g.issuedAt ? format(g.issuedAt, "MMM d, yyyy") : "—"}
                    {g.paymentMethod ? ` · ${g.paymentMethod}` : ""}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {g.status === "proposed" && isAdmin(viewerRole) && (
                          <DropdownMenuItem
                            onClick={() =>
                              run(() => approveGrant({ grantId: g.id }), "Grant approved")
                            }
                          >
                            Approve
                          </DropdownMenuItem>
                        )}
                        {g.status === "approved" && isAdmin(viewerRole) && (
                          <DropdownMenuItem onClick={() => setIssueFor(g)}>
                            Issue payment…
                          </DropdownMenuItem>
                        )}
                        {g.status === "issued" && isPartnerPlus(viewerRole) && (
                          <DropdownMenuItem
                            onClick={() =>
                              run(() => markGrantCashed({ grantId: g.id }), "Marked cashed")
                            }
                          >
                            Mark cashed
                          </DropdownMenuItem>
                        )}
                        {(g.status === "issued" || g.status === "cashed") &&
                          isPartnerPlus(viewerRole) && (
                            <DropdownMenuItem
                              onClick={() =>
                                run(() => reconcileGrant({ grantId: g.id }), "Reconciled")
                              }
                            >
                              Reconcile
                            </DropdownMenuItem>
                          )}
                        <DropdownMenuItem onClick={() => setReceiptFor(g)}>
                          <ReceiptIcon />
                          Add receipt…
                        </DropdownMenuItem>
                        {g.status !== "reconciled" &&
                          g.status !== "cancelled" &&
                          isAdmin(viewerRole) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="danger"
                                onClick={() =>
                                  run(() => cancelGrant({ grantId: g.id }), "Grant cancelled")
                                }
                              >
                                Cancel grant
                              </DropdownMenuItem>
                            </>
                          )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <IssueDialog
        key={issueFor?.id ?? "none"}
        grant={issueFor}
        onClose={() => setIssueFor(null)}
        onDone={() => {
          setIssueFor(null);
          router.refresh();
        }}
      />
      <ReceiptDialog
        key={`r-${receiptFor?.id ?? "none"}`}
        grant={receiptFor}
        onClose={() => setReceiptFor(null)}
        onDone={() => {
          setReceiptFor(null);
          router.refresh();
        }}
      />
    </>
  );
}

function IssueDialog({
  grant,
  onClose,
  onDone,
}: {
  grant: GrantRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [method, setMethod] = React.useState<PaymentMethod>("check");
  const [ref, setRef] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!grant) return;
    setBusy(true);
    const res = await issueGrant({
      grantId: grant.id,
      paymentMethod: method,
      paymentRef: ref || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Issued ${formatMoney(grant.amountAwarded)} to ${grant.companyName}`);
    onDone();
  }

  return (
    <Dialog open={!!grant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue {grant ? formatMoney(grant.amountAwarded) : ""}</DialogTitle>
          <DialogDescription>
            Record how the money actually moves to {grant?.companyName}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="capitalize">
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ref">Reference (check no., transfer ID)</Label>
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Issuing…" : "Issue payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({
  grant,
  onClose,
  onDone,
}: {
  grant: GrantRow | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!grant) return;
    setBusy(true);
    const res = await addReceipt({
      grantId: grant.id,
      amount: Number(amount),
      vendor: vendor || undefined,
      description: description || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Receipt added");
    onDone();
  }

  return (
    <Dialog open={!!grant} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add receipt</DialogTitle>
          <DialogDescription>
            {grant
              ? `${grant.companyName} — ${formatMoney(Number(grant.receiptTotal))} of ${formatMoney(grant.amountAwarded)} receipted so far`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ramount">Amount ($)</Label>
              <Input
                id="ramount"
                type="number"
                min={0.01}
                step={0.01}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor">Vendor</Label>
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Stripe Atlas"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rdesc">Description</Label>
            <Input
              id="rdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Delaware C-corp formation"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !amount}>
              {busy ? "Saving…" : "Add receipt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
