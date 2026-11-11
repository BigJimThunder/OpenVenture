import Link from "next/link";
import { format } from "date-fns";
import { ArrowRightIcon, CheckCircle2Icon, RotateCcwIcon, XCircleIcon } from "lucide-react";
import type { DeclineReason, GrantStatus, VoteOutcome } from "@/db/schema";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { cn, formatMoney } from "@/lib/utils";

const GRANT_PHRASE: Record<GrantStatus, string> = {
  proposed: "proposed from",
  approved: "approved from",
  issued: "issued from",
  cashed: "paid from",
  reconciled: "reconciled against",
  cancelled: "cancelled in",
};

/**
 * What was decided and what the app did about it, in one line:
 * "Funded · $1,200 proposed from FY2026 Pool → view grant". Shown on the vote
 * page and the application record so the chain is visible from either end.
 */
export function DecisionSummary({
  outcome,
  outcomeNote,
  decidedAt,
  declineReason,
  declineNote,
  grant,
  nextStep,
  links,
  children,
  className,
}: {
  outcome: VoteOutcome | "funded" | "declined";
  outcomeNote?: string | null;
  decidedAt?: Date | null;
  declineReason?: DeclineReason | null;
  declineNote?: string | null;
  grant?: { status: GrantStatus; amountAwarded: string; poolName: string } | null;
  nextStep?: string | null;
  /** Where to go from here — the grant, the application, the vote. */
  links?: { href: string; label: string }[];
  /** Extra actions (e.g. Reopen). */
  children?: React.ReactNode;
  className?: string;
}) {
  const funded = outcome === "fund" || outcome === "funded";
  const declined = outcome === "decline" || outcome === "declined";
  const Icon = funded ? CheckCircle2Icon : declined ? XCircleIcon : RotateCcwIcon;
  const note = declined ? (declineNote ?? outcomeNote) : outcomeNote;

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        funded
          ? "border-success-border bg-success-bg"
          : declined
            ? "border-danger-border bg-danger-bg"
            : "border-border bg-bg-subtle",
        className
      )}
      aria-label="Decision"
    >
      <div className="flex min-w-0 gap-2.5">
        <Icon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            funded ? "text-success" : declined ? "text-danger" : "text-fg-muted"
          )}
        />
        <div className="min-w-0">
          <div className="tnum text-sm font-semibold">
            {funded ? (
              <>
                Funded
                {grant ? (
                  <span className="font-normal">
                    {" · "}
                    <span className="font-semibold">{formatMoney(grant.amountAwarded)}</span>{" "}
                    {GRANT_PHRASE[grant.status]} {grant.poolName}
                  </span>
                ) : (
                  <span className="font-normal"> · no grant proposed yet</span>
                )}
              </>
            ) : declined ? (
              <>
                Declined
                {declineReason && (
                  <span className="font-normal"> · {DECLINE_REASON_LABELS[declineReason]}</span>
                )}
              </>
            ) : outcome === "revisit" ? (
              <>
                Revisit
                <span className="font-normal"> · the vote didn&apos;t settle it</span>
              </>
            ) : (
              <>
                No quorum
                <span className="font-normal"> · not enough ballots to decide</span>
              </>
            )}
          </div>
          {note && <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg-muted">{note}</p>}
          {!funded && !declined && nextStep && (
            <p className="mt-0.5 text-sm text-fg-muted">Next: {nextStep}</p>
          )}
          {decidedAt && (
            <p className="tnum mt-0.5 text-xs text-fg-subtle">{format(decidedAt, "MMM d, yyyy")}</p>
          )}
        </div>
      </div>
      {(links?.length || children) && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 max-sm:pl-6.5">
          {links?.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className="inline-flex items-center gap-1 text-sm font-medium text-fg underline-offset-4 hover:underline max-md:py-2"
            >
              {l.label}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          ))}
          {children}
        </div>
      )}
    </section>
  );
}
