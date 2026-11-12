"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowRightIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  FileTextIcon,
  MoreHorizontalIcon,
  ReceiptIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  approveGrant,
  issueGrant,
  markGrantCashed,
  reconcileGrant,
  cancelGrant,
  addReceipt,
} from "@/lib/actions/grants";
import type { GrantRow, PoolSummary, ReceiptRow } from "@/lib/queries/grants";
import { PAYMENT_METHODS, type PaymentMethod, type GrantStatus } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { USE_OF_FUNDS_LABELS } from "./use-of-funds";
import { Money } from "@/components/patterns/money";
import { Panel, dataTable, microLabel } from "@/components/patterns/data-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Field } from "@/components/patterns/field";
import { MoneyInput } from "@/components/ui/money-input";

/** The lifecycle, in order. `waiting` is what everyone who can't act sees. */
const LIFECYCLE: {
  status: Exclude<GrantStatus, "cancelled">;
  label: string;
  next: string;
  waiting: string;
}[] = [
  { status: "proposed", label: "Proposed", next: "Admin approves", waiting: "Waiting on an admin to approve" },
  { status: "approved", label: "Approved", next: "Admin issues payment", waiting: "Waiting on an admin to pay" },
  { status: "issued", label: "Issued", next: "Partner confirms it cleared", waiting: "Waiting for the payment to clear" },
  { status: "cashed", label: "Cashed", next: "Partner reconciles receipts", waiting: "Waiting on a partner to reconcile" },
  { status: "reconciled", label: "Reconciled", next: "Closed", waiting: "Closed" },
];

const STEP_INDEX = Object.fromEntries(LIFECYCLE.map((s, i) => [s.status, i])) as Record<
  GrantStatus,
  number
>;

type Approval = PoolSummary["approvals"][string];
type Confirm = { kind: "approve" | "reconcile" | "cancel"; grant: GrantRow };

export function GrantsTable({
  grants,
  receipts,
  lifecycle,
  approvals,
}: {
  grants: GrantRow[];
  receipts: Record<string, ReceiptRow[]>;
  lifecycle: PoolSummary["lifecycle"];
  approvals: PoolSummary["approvals"];
}) {
  const router = useRouter();
  const [filter, setFilter] = React.useState<GrantStatus | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [issueFor, setIssueFor] = React.useState<GrantRow | null>(null);
  const [receiptFor, setReceiptFor] = React.useState<GrantRow | null>(null);
  const [confirm, setConfirm] = React.useState<Confirm | null>(null);
  const [busy, setBusy] = React.useState(false);

  const canMoney = useCan("manageMoney");
  const canPartner = useCan("partnerWork");
  const canContribute = useCan("contribute");

  async function markCashed(g: GrantRow) {
    setBusy(true);
    const res = await markGrantCashed({ grantId: g.id });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`${g.companyName}: payment marked as cleared`);
    router.refresh();
  }

  async function runConfirm({ kind, grant: g }: Confirm) {
    setBusy(true);
    const res =
      kind === "approve"
        ? await approveGrant({ grantId: g.id })
        : kind === "reconcile"
          ? await reconcileGrant({ grantId: g.id })
          : await cancelGrant({ grantId: g.id });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    setConfirm(null);
    const shortfall = (res.data as { receiptShortfall?: number }).receiptShortfall;
    if (shortfall) {
      toast.warning(
        `Reconciled. Receipts are ${formatMoney(shortfall, { cents: true })} short of the award.`
      );
    } else {
      toast.success(
        kind === "approve"
          ? `Approved ${formatMoney(g.amountAwarded)} for ${g.companyName}`
          : kind === "reconcile"
            ? `${g.companyName} reconciled`
            : `Grant to ${g.companyName} cancelled`
      );
    }
    router.refresh();
  }

  /** The one thing this viewer can do to move the grant forward, or why not. */
  function nextAction(g: GrantRow, block?: boolean) {
    const cls = block ? "w-full max-md:h-10" : undefined;
    const step = LIFECYCLE[STEP_INDEX[g.status]];
    if (g.status === "cancelled") return <span className="text-xs text-fg-subtle">Cancelled</span>;
    if (g.status === "proposed" && canMoney) {
      return (
        <Button size="sm" variant="secondary" className={cls} onClick={() => setConfirm({ kind: "approve", grant: g })}>
          Approve…
        </Button>
      );
    }
    if (g.status === "approved" && canMoney) {
      return (
        <Button size="sm" variant="secondary" className={cls} onClick={() => setIssueFor(g)}>
          Issue payment…
        </Button>
      );
    }
    if (g.status === "issued" && canPartner) {
      return (
        <Button size="sm" variant="secondary" className={cls} disabled={busy} onClick={() => markCashed(g)}>
          Mark cashed
        </Button>
      );
    }
    if (g.status === "cashed" && canPartner) {
      return (
        <Button size="sm" variant="secondary" className={cls} onClick={() => setConfirm({ kind: "reconcile", grant: g })}>
          Reconcile…
        </Button>
      );
    }
    return <span className="text-xs text-fg-subtle">{step.waiting}</span>;
  }

  function menu(g: GrantRow) {
    const open = g.status !== "reconciled" && g.status !== "cancelled";
    const items = {
      receipt: canContribute && g.status !== "cancelled" && g.status !== "proposed",
      // Cashed is optional bookkeeping — a partner may reconcile straight from issued.
      reconcileEarly: canPartner && g.status === "issued",
      cancel: canMoney && open,
      // The memo sent up for sign-off; anyone may read it, contributors write it.
      request: g.applicationId != null && g.status !== "cancelled",
    };
    if (!items.receipt && !items.reconcileEarly && !items.cancel && !items.request) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${g.companyName}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {items.request && (
            <DropdownMenuItem asChild>
              <Link href={`/reports/funding/${g.applicationId}` as Route}>
                <FileTextIcon />
                Funding request
              </Link>
            </DropdownMenuItem>
          )}
          {items.receipt && (
            <DropdownMenuItem onClick={() => setReceiptFor(g)}>
              <ReceiptIcon />
              Add receipt…
            </DropdownMenuItem>
          )}
          {items.reconcileEarly && (
            <DropdownMenuItem onClick={() => setConfirm({ kind: "reconcile", grant: g })}>
              Reconcile now…
            </DropdownMenuItem>
          )}
          {items.cancel && (
            <>
              {(items.receipt || items.reconcileEarly) && <DropdownMenuSeparator />}
              <DropdownMenuItem variant="danger" onClick={() => setConfirm({ kind: "cancel", grant: g })}>
                Cancel grant…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  const shown = filter
    ? grants.filter((g) => g.status === filter)
    : grants.filter((g) => g.status !== "cancelled");
  const cancelledCount = lifecycle.cancelled.count;

  return (
    <div className="flex flex-col gap-3">
      {/* Lifecycle: where the money is, and who moves it next. Doubles as the filter. */}
      <div>
        <div className="grid grid-cols-5 gap-px overflow-hidden rounded-lg border border-border bg-border shadow-xs">
          {LIFECYCLE.map((s, i) => {
            const cell = lifecycle[s.status];
            const active = filter === s.status;
            return (
              <button
                key={s.status}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(active ? null : s.status)}
                className={cn(
                  "relative min-w-0 cursor-pointer bg-panel px-1.5 py-2.5 text-left transition-colors outline-none hover:bg-bg-subtle focus-visible:bg-bg-subtle sm:px-3.5",
                  active && "bg-accent-subtle/60 shadow-[inset_0_-2px_0_var(--accent)] hover:bg-accent-subtle/60"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <StatusSteps status={s.status} className="max-sm:hidden" />
                  <span className="truncate text-2xs font-medium text-fg-muted sm:text-xs">{s.label}</span>
                </div>
                <div className="tnum mt-1 text-md leading-6 font-semibold">{cell.count}</div>
                <div className="tnum truncate text-2xs text-fg-muted sm:text-xs">
                  {cell.count > 0 ? formatMoney(cell.total) : "—"}
                </div>
                <div className="mt-1.5 hidden truncate text-2xs text-fg-subtle lg:block">{s.next}</div>
                {i < LIFECYCLE.length - 1 && (
                  <ArrowRightIcon
                    className="absolute top-3 right-2 hidden size-3 text-fg-subtle sm:block"
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5 text-2xs text-fg-subtle">
          <span>
            Proposed grants don&apos;t reserve budget. Approval does — and it is blocked if it would
            overdraw the pool.
          </span>
          <span className="flex items-center gap-3">
            {cancelledCount > 0 && (
              <button
                type="button"
                className={cn(
                  "cursor-pointer underline-offset-2 hover:text-fg hover:underline",
                  filter === "cancelled" && "text-fg underline"
                )}
                onClick={() => setFilter(filter === "cancelled" ? null : "cancelled")}
              >
                {cancelledCount} cancelled
              </button>
            )}
            {filter && (
              <button
                type="button"
                className="cursor-pointer text-accent underline-offset-2 hover:underline"
                onClick={() => setFilter(null)}
              >
                Show all
              </button>
            )}
          </span>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong/70 px-4 py-8 text-center text-sm text-fg-muted">
          No {filter} grants in this pool.
        </p>
      ) : (
        <>
          {/* Desktop: the ledger table */}
          <Panel className="hidden lg:flex">
            <table className={dataTable.table}>
              <thead>
                <tr>
                  <th className={cn(dataTable.th, "w-8 px-0")}>
                    <span className="sr-only">Details</span>
                  </th>
                  <th className={cn(dataTable.th, "pl-0")}>Company</th>
                  <th className={dataTable.th}>Status</th>
                  <th className={cn(dataTable.th, "text-right")}>Awarded</th>
                  <th className={cn(dataTable.th, "text-right")}>Receipts</th>
                  <th className={dataTable.th}>Paid</th>
                  <th className={cn(dataTable.th, "text-right")}>Next step</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => {
                  const isOpen = expanded === g.id;
                  return (
                    <React.Fragment key={g.id}>
                      <tr className={cn(dataTable.row, isOpen && "bg-bg-subtle/60")}>
                        <td className={cn(dataTable.td, "px-0 text-center")}>
                          <button
                            type="button"
                            aria-expanded={isOpen}
                            aria-label={`${isOpen ? "Hide" : "Show"} receipts and history for ${g.companyName}`}
                            onClick={() => setExpanded(isOpen ? null : g.id)}
                            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-fg-subtle hover:bg-bg-subtle hover:text-fg"
                          >
                            <ChevronRightIcon className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
                          </button>
                        </td>
                        <td className={cn(dataTable.td, "max-w-72 py-1.5 pl-0")}>
                          <CompanyCell grant={g} />
                        </td>
                        <td className={cn(dataTable.td, "whitespace-nowrap")}>
                          <StatusLabel status={g.status} />
                        </td>
                        <td className={cn(dataTable.td, dataTable.num, "font-medium")}>
                          <Money value={g.amountAwarded} />
                          <OverPool approval={approvals[g.id]} />
                        </td>
                        <td className={cn(dataTable.td, dataTable.num)}>
                          <ReceiptCoverage grant={g} />
                        </td>
                        <td className={cn(dataTable.td, "text-xs whitespace-nowrap text-fg-muted")}>
                          <PaidCell grant={g} />
                        </td>
                        <td className={cn(dataTable.td, "text-right whitespace-nowrap")}>
                          <span className="inline-flex items-center justify-end gap-1">
                            {nextAction(g)}
                            {menu(g)}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} className="border-b border-border bg-bg-subtle/40 px-8 py-3">
                            <GrantDetail grant={g} receipts={receipts[g.id] ?? []} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </Panel>

          {/* Phones and tablets: one card per grant */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {shown.map((g) => {
              const isOpen = expanded === g.id;
              return (
                <li key={g.id} className="rounded-lg border border-border bg-panel shadow-xs">
                  <div className="flex items-start justify-between gap-3 p-3.5 pb-2.5">
                    <div className="min-w-0">
                      <CompanyCell grant={g} />
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={g.amountAwarded} className="text-base font-semibold" />
                      <OverPool approval={approvals[g.id]} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3.5 pb-3 text-xs text-fg-muted">
                    <StatusLabel status={g.status} />
                    <span className="tnum">
                      <ReceiptCoverage grant={g} />
                    </span>
                  </div>
                  <div className="flex items-center gap-2 border-t border-border px-3.5 py-2.5">
                    <div className="min-w-0 flex-1">{nextAction(g, true)}</div>
                    {menu(g)}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="max-md:h-10"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded(isOpen ? null : g.id)}
                    >
                      Details
                      <ChevronRightIcon className={cn("transition-transform", isOpen && "rotate-90")} />
                    </Button>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-bg-subtle/40 p-3.5">
                      <GrantDetail grant={g} receipts={receipts[g.id] ?? []} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <ConfirmDialog
        confirm={confirm}
        approval={confirm ? approvals[confirm.grant.id] : undefined}
        busy={busy}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
      />
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
    </div>
  );
}

/** Five ticks, filled up to the grant's stage — the lifecycle at a glance. */
function StatusSteps({ status, className }: { status: GrantStatus; className?: string }) {
  if (status === "cancelled") return null;
  const at = STEP_INDEX[status];
  const done = status === "reconciled";
  return (
    <span className={cn("inline-flex shrink-0 gap-0.5", className)} aria-hidden>
      {LIFECYCLE.map((s, i) => (
        <span
          key={s.status}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= at ? (done ? "bg-success" : "bg-fg-muted") : "bg-border-strong/70"
          )}
        />
      ))}
    </span>
  );
}

function StatusLabel({ status }: { status: GrantStatus }) {
  if (status === "cancelled") {
    return <span className="text-xs text-fg-subtle line-through">Cancelled</span>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-fg">
      <StatusSteps status={status} />
      {LIFECYCLE[STEP_INDEX[status]].label}
    </span>
  );
}

function CompanyCell({ grant: g }: { grant: GrantRow }) {
  return (
    <>
      {g.applicationId ? (
        <Link href={`/pipeline/${g.applicationId}`} className="font-medium hover:text-accent hover:underline">
          {g.companyName}
        </Link>
      ) : (
        <span className="font-medium">{g.companyName}</span>
      )}
      <div className="truncate text-xs text-fg-muted">
        {USE_OF_FUNDS_LABELS[g.useOfFunds]}
        {g.useOfFundsNarrative ? ` · ${g.useOfFundsNarrative}` : ""}
      </div>
    </>
  );
}

/** Inline warning on a proposed grant that the pool can't cover. */
function OverPool({ approval }: { approval: Approval | undefined }) {
  if (!approval || approval.ok) return null;
  return (
    <div className="flex items-center justify-end gap-1 text-2xs font-normal text-danger">
      <CircleAlertIcon className="size-3" />
      {formatMoney(approval.shortfall)} over pool
    </div>
  );
}

function ReceiptCoverage({ grant: g }: { grant: GrantRow }) {
  if (g.status === "proposed" || g.status === "approved" || g.status === "cancelled") {
    return <span className="text-xs text-fg-subtle">—</span>;
  }
  if (g.receiptCount === 0) {
    return (
      <span className={cn("text-xs", g.status === "reconciled" ? "text-fg-subtle" : "text-warning")}>
        {g.status === "reconciled" ? "None on file" : "No receipts yet"}
      </span>
    );
  }
  return (
    <span className="tnum text-xs text-fg-muted">
      <span className="text-fg">{formatMoney(g.receiptTotal)}</span> of {formatMoney(g.amountAwarded)}
    </span>
  );
}

function PaidCell({ grant: g }: { grant: GrantRow }) {
  if (!g.issuedAt) return <span className="text-fg-subtle">Not paid yet</span>;
  return (
    <>
      <span className="tnum">{format(g.issuedAt, "MMM d, yyyy")}</span>
      {g.paymentMethod && <span className="capitalize"> · {g.paymentMethod}</span>}
      {g.paymentRef && <span className="font-mono text-2xs text-fg-subtle"> {g.paymentRef}</span>}
    </>
  );
}

/** The drawer under a grant: its receipts and the dated trail of who moved it. */
function GrantDetail({ grant: g, receipts }: { grant: GrantRow; receipts: ReceiptRow[] }) {
  const trail: [string, Date | null, string?][] = [
    ["Proposed", g.createdAt],
    ["Approved", g.approvedAt, g.approvedByName ? `by ${g.approvedByName}` : undefined],
    ["Issued", g.issuedAt, [g.paymentMethod, g.paymentRef].filter(Boolean).join(" ") || undefined],
    ["Cashed", g.cashedAt],
    ["Reconciled", g.reconciledAt],
  ];
  return (
    <div className="grid gap-5 md:grid-cols-[1fr_220px]">
      <div className="min-w-0">
        <div className={cn(microLabel, "mb-1.5")}>Receipts</div>
        {receipts.length === 0 ? (
          <p className="text-xs text-fg-muted">
            None filed. Founders send receipts for what the grant paid for; anyone on the team can
            record them here, and reconciling compares their total to the award.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border bg-panel">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <ReceiptIcon className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="min-w-0 flex-1 truncate">
                  {r.vendor ?? "Receipt"}
                  {r.description && <span className="text-fg-muted"> · {r.description}</span>}
                </span>
                <span className="tnum shrink-0 text-xs text-fg-subtle">{format(r.submittedAt, "MMM d")}</span>
                <Money value={r.amount} cents className="shrink-0 font-medium" />
              </li>
            ))}
          </ul>
        )}
        {g.useOfFundsNarrative && (
          <>
            <div className={cn(microLabel, "mt-4 mb-1")}>What it pays for</div>
            <p className="max-w-prose text-sm text-fg-muted">{g.useOfFundsNarrative}</p>
          </>
        )}
      </div>
      <div>
        <div className={cn(microLabel, "mb-1.5")}>Trail</div>
        <ol className="flex flex-col gap-1.5">
          {trail.map(([label, at, note]) => (
            <li key={label} className="flex items-baseline gap-2 text-xs">
              <span
                className={cn("size-1.5 shrink-0 translate-y-[-1px] rounded-full", at ? "bg-fg-muted" : "bg-border-strong/70")}
              />
              <span className={cn("w-20 shrink-0", at ? "text-fg" : "text-fg-subtle")}>{label}</span>
              <span className="tnum text-fg-muted">
                {at ? format(at, "MMM d, yyyy") : "—"}
                {at && note ? ` · ${note}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function MathRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5 text-sm", strong && "font-semibold")}>
      <span className={strong ? undefined : "text-fg-muted"}>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

function ConfirmDialog({
  confirm,
  approval,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: Confirm | null;
  approval: Approval | undefined;
  busy: boolean;
  onClose: () => void;
  onConfirm: (c: Confirm) => void;
}) {
  const g = confirm?.grant;
  const kind = confirm?.kind;
  const blocked = kind === "approve" && approval != null && !approval.ok;
  return (
    <Dialog open={!!confirm} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {g && kind === "approve" && (
          <>
            <DialogHeader>
              <DialogTitle>Approve {formatMoney(g.amountAwarded)} for {g.companyName}</DialogTitle>
              <DialogDescription>
                Approval reserves the money in {g.poolName}. Payment is a separate step.
              </DialogDescription>
            </DialogHeader>
            {approval && (
              <div className="divide-y divide-border rounded-md border border-border px-3">
                <MathRow label="Remaining in pool" value={formatMoney(approval.remaining)} />
                <MathRow label="This award" value={`− ${formatMoney(g.amountAwarded)}`} />
                <MathRow
                  strong
                  label="Remaining after approval"
                  value={<span className={blocked ? "text-danger" : undefined}>{formatMoney(approval.after)}</span>}
                />
              </div>
            )}
            {blocked && approval && (
              <p className="flex gap-2 rounded-md border border-danger-border bg-danger-bg p-2.5 text-xs text-danger">
                <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
                This would overdraw the pool by {formatMoney(approval.shortfall)}, so it can&apos;t be
                approved. Cancel the proposal and re-propose a smaller award, release another
                commitment, or raise the pool in Settings.
              </p>
            )}
          </>
        )}
        {g && kind === "reconcile" && (
          <>
            <DialogHeader>
              <DialogTitle>Reconcile {g.companyName}</DialogTitle>
              <DialogDescription>
                Reconciling closes the grant: the payment matched the bank statement and the
                receipts are on file.
              </DialogDescription>
            </DialogHeader>
            <div className="divide-y divide-border rounded-md border border-border px-3">
              <MathRow label="Awarded" value={formatMoney(g.amountAwarded, { cents: true })} />
              <MathRow
                strong
                label={`Receipts on file (${g.receiptCount})`}
                value={formatMoney(g.receiptTotal, { cents: true })}
              />
            </div>
            <p className="text-xs text-fg-muted">
              If receipts don&apos;t cover the award the grant still closes, and the shortfall is
              recorded in the activity log.
            </p>
          </>
        )}
        {g && kind === "cancel" && (
          <DialogHeader>
            <DialogTitle>Cancel the grant to {g.companyName}?</DialogTitle>
            <DialogDescription>
              {g.status === "proposed"
                ? "The proposal is withdrawn. The application can be proposed again later."
                : `${formatMoney(g.amountAwarded)} returns to the pool. If money has already moved, recover it before you cancel — this only changes the record.`}
            </DialogDescription>
          </DialogHeader>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {blocked ? "Close" : "Not now"}
          </Button>
          {confirm && !blocked && (
            <Button
              variant={kind === "cancel" ? "danger" : "default"}
              disabled={busy}
              onClick={() => onConfirm(confirm)}
            >
              {busy
                ? "Saving…"
                : kind === "approve"
                  ? "Approve grant"
                  : kind === "reconcile"
                    ? "Reconcile"
                    : "Cancel grant"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue {grant ? formatMoney(grant.amountAwarded) : ""}</DialogTitle>
          <DialogDescription>
            Record how the money actually moves to {grant?.companyName}. The reference is what you
            will match against the bank statement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Payment method">
            {(control) => (
              <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                <SelectTrigger {...control}>
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
            )}
          </Field>
          <Field label="Reference (check no., transfer ID)">
            <Input id="ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </Field>
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add receipt</DialogTitle>
          <DialogDescription>
            {grant
              ? `${grant.companyName} — ${formatMoney(grant.receiptTotal)} of ${formatMoney(grant.amountAwarded)} receipted so far`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <MoneyInput id="ramount" required value={amount} onValueChange={setAmount} />
            </Field>
            <Field label="Vendor">
              <Input
                id="vendor"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                placeholder="Stripe Atlas"
              />
            </Field>
          </div>
          <Field label="Description">
            <Input
              id="rdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Delaware C-corp formation"
            />
          </Field>
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
