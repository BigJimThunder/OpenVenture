"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, GavelIcon } from "lucide-react";
import { toast } from "sonner";
import { decideVote, getFundedEmailPreview } from "@/lib/actions/votes";
import { USE_OF_FUNDS, type UseOfFunds } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { USE_OF_FUNDS_LABELS } from "@/components/grants/new-grant-dialog";
import { DeclineFields, useDeclineForm } from "@/components/applications/decline-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Outcome = "fund" | "decline" | "revisit" | "no_quorum";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "fund", label: "Fund" },
  { value: "decline", label: "Decline" },
  { value: "revisit", label: "Revisit" },
  { value: "no_quorum", label: "No quorum" },
];

const SOURCE_HINT = {
  ballots: (n: number) => `Median of ${n} fund ${n === 1 ? "ballot" : "ballots"}`,
  memo: () => "The memo's proposed amount",
  ask: () => "The founder's ask",
};

export type DecisionDialogProps = {
  roundId: string;
  applicationId: string;
  companyName: string;
  tally: { fund: number; decline: number; abstain: number };
  suggestion: { amount: string; source: "ballots" | "memo" | "ask"; basis: number } | null;
  pools: { id: string; name: string; remaining: number }[];
  /** The application already has a live grant — a fund decision links it instead of proposing another. */
  existingGrant: { amountAwarded: string; status: string; poolName: string } | null;
  defaultNarrative: string | null;
  wonStageName: string | null;
  lostStageName: string | null;
};

/**
 * Record the club's decision — one dialog, one confirm. The summary above the
 * button spells out everything the app will do, so nothing is a surprise and
 * nothing has to be typed again on another screen.
 */
export function DecisionDialog(props: DecisionDialogProps) {
  const [open, setOpen] = React.useState(false);
  const lead = props.tally.fund > props.tally.decline ? "fund" : props.tally.decline > props.tally.fund ? "decline" : "revisit";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="max-md:h-12 max-md:w-full">
          <GavelIcon />
          Record the decision
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>The club&apos;s decision on {props.companyName}</DialogTitle>
          <DialogDescription>
            The vote advises; the club decides. Record it once and the application, the memo and
            the grant follow.
          </DialogDescription>
        </DialogHeader>
        {open && <DecisionForm {...props} initial={lead} onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function DecisionForm({
  roundId,
  applicationId,
  companyName,
  suggestion,
  pools,
  existingGrant,
  defaultNarrative,
  wonStageName,
  lostStageName,
  initial,
  onDone,
}: DecisionDialogProps & { initial: Outcome; onDone: () => void }) {
  const router = useRouter();
  const [outcome, setOutcome] = React.useState<Outcome>(initial);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");

  // Fund
  const [amount, setAmount] = React.useState(suggestion ? String(Number(suggestion.amount)) : "");
  const [poolId, setPoolId] = React.useState(pools[0]?.id ?? "");
  const [useOfFunds, setUseOfFunds] = React.useState<UseOfFunds>("other");
  const [narrative, setNarrative] = React.useState(defaultNarrative ?? "");
  const [emailFounder, setEmailFounder] = React.useState<boolean | null>(null);
  const [fundedEmail, setFundedEmail] = React.useState<{
    applicantEmail: string | null;
    subject: string;
    body: string;
    clubSendsByDefault: boolean;
  } | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);

  // Decline
  const decline = useDeclineForm(applicationId);

  // Revisit / no quorum
  const [nextStep, setNextStep] = React.useState("");
  const [nextStepDue, setNextStepDue] = React.useState("");

  const amountValid = /^\d{1,7}(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  const pool = pools.find((p) => p.id === poolId) ?? null;
  const overPool = !existingGrant && pool != null && amountValid && Number(amount) > pool.remaining;

  // Preview follows the amount; fetched once for the default switch state, then on change.
  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await getFundedEmailPreview({
        applicationId,
        amount: existingGrant?.amountAwarded ?? (amountValid ? amount.trim() : undefined),
      });
      if (!cancelled && res.ok) setFundedEmail(res.data);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applicationId, amount, amountValid, existingGrant]);

  const canEmailFunded = Boolean(fundedEmail?.applicantEmail);
  const sendFunded = canEmailFunded && (emailFounder ?? fundedEmail?.clubSendsByDefault ?? false);

  const valid =
    outcome === "fund"
      ? existingGrant != null || (amountValid && poolId !== "")
      : outcome === "decline"
        ? decline.valid
        : true;

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    const res =
      outcome === "fund"
        ? await decideVote({
            roundId,
            outcome,
            note: note.trim() || undefined,
            // With an existing grant the server links it; no pool or amount needed.
            ...(existingGrant ? {} : { poolId, amount: amount.trim() }),
            useOfFunds,
            useOfFundsNarrative: narrative.trim() || undefined,
            emailFounder: sendFunded,
          })
        : outcome === "decline"
          ? await decideVote({
              roundId,
              outcome,
              note: decline.toInput().note,
              declineReason: decline.toInput().declineReason,
              founderEmail: decline.toInput().founderEmail,
            })
          : await decideVote({
              roundId,
              outcome,
              note: note.trim() || undefined,
              nextStep: nextStep.trim() || undefined,
              nextStepDue: nextStep.trim() && nextStepDue ? new Date(`${nextStepDue}T12:00:00`) : null,
            });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      outcome === "fund"
        ? res.data.grantCreated && res.data.amount
          ? `Funded — ${formatMoney(res.data.amount)} proposed from ${res.data.poolName}`
          : "Funded — linked to the existing grant"
        : outcome === "decline"
          ? `${companyName} declined`
          : outcome === "revisit"
            ? "Recorded — the club will revisit"
            : "Recorded — no quorum"
    );
    onDone();
    router.refresh();
  }

  const effects: string[] =
    outcome === "fund"
      ? [
          "Outcome recorded on the vote; memo marked decided",
          `Application moves to ${wonStageName ?? "Funded"}`,
          existingGrant
            ? `Existing ${formatMoney(existingGrant.amountAwarded)} grant (${existingGrant.status}) stays as is`
            : amountValid && pool
              ? `${formatMoney(amount)} grant proposed from ${pool.name} — an admin approves it`
              : "A grant is proposed — an admin approves it",
          sendFunded ? `Founder emailed at ${fundedEmail?.applicantEmail}` : "No email to the founder",
        ]
      : outcome === "decline"
        ? [
            "Outcome recorded on the vote; memo marked decided",
            `Application moves to ${lostStageName ?? "Declined"} with the reason`,
            decline.send ? `Founder emailed at ${decline.preview?.applicantEmail}` : "No email to the founder",
          ]
        : [
            outcome === "revisit" ? "Outcome recorded: revisit" : "Outcome recorded: no quorum",
            "Application stays where it is; memo stays circulated",
            nextStep.trim() ? `Next step set: ${nextStep.trim()}` : "A partner can open a new vote from the memo",
          ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-bg-subtle p-1" role="tablist" aria-label="Decision">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={outcome === o.value}
            onClick={() => setOutcome(o.value)}
            className={cn(
              "h-11 cursor-pointer rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-9",
              outcome === o.value
                ? o.value === "fund"
                  ? "bg-panel text-success shadow-xs"
                  : o.value === "decline"
                    ? "bg-panel text-danger shadow-xs"
                    : "bg-panel text-fg shadow-xs"
                : "text-fg-muted hover:text-fg"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {outcome === "fund" &&
        (existingGrant ? (
          <p className="rounded-lg border border-border bg-bg-subtle px-3 py-2.5 text-sm">
            This application already has a{" "}
            <span className="tnum font-medium">{formatMoney(existingGrant.amountAwarded)}</span> grant (
            {existingGrant.status}, {existingGrant.poolName}). Recording the decision links it — change
            the amount on the Grants page.
          </p>
        ) : pools.length === 0 ? (
          <p className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5 text-sm">
            There is no grant pool yet. An admin creates one on the Grants page, then you can record
            a fund decision.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-amount">Grant amount</Label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-fg-subtle">
                    $
                  </span>
                  <Input
                    id="decision-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    aria-invalid={amount !== "" && !amountValid}
                    className="tnum h-11 pl-7 text-lg font-semibold"
                    placeholder="0"
                  />
                </div>
                <span className="text-xs text-fg-subtle">
                  {suggestion && Number(amount) === Number(suggestion.amount)
                    ? `${SOURCE_HINT[suggestion.source](suggestion.basis)}. Change it if the club agreed something else.`
                    : suggestion
                      ? `Suggested: ${formatMoney(suggestion.amount)} (${SOURCE_HINT[suggestion.source](suggestion.basis).toLowerCase()}).`
                      : "Nobody suggested an amount — enter what the club agreed."}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-pool">From pool</Label>
                <Select value={poolId} onValueChange={setPoolId}>
                  <SelectTrigger id="decision-pool" className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pools.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {formatMoney(p.remaining)} left
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className={cn("text-xs", overPool ? "text-warning" : "text-fg-subtle")}>
                  {overPool
                    ? `More than the ${formatMoney(pool!.remaining)} left in this pool — it can be proposed, but approval will be blocked.`
                    : "Proposing commits nothing. The budget is checked when an admin approves."}
                </span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-use">Use of funds</Label>
                <Select value={useOfFunds} onValueChange={(v) => setUseOfFunds(v as UseOfFunds)}>
                  <SelectTrigger id="decision-use" className="max-md:h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_OF_FUNDS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {USE_OF_FUNDS_LABELS[u]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-narrative">What it pays for</Label>
                <Textarea
                  id="decision-narrative"
                  rows={2}
                  value={narrative}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Incorporation filing fees and registered agent for the first year."
                  maxLength={2000}
                  className="max-md:text-base"
                />
              </div>
            </div>
          </div>
        ))}

      {outcome === "fund" && (
        <div className="rounded-lg border border-border bg-bg-subtle/50">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Tell the founder</div>
              <div className="truncate text-xs text-fg-muted">
                {!fundedEmail
                  ? "Checking what would be sent…"
                  : !fundedEmail.applicantEmail
                    ? "No founder email on file — nothing will be sent."
                    : sendFunded
                      ? `To ${fundedEmail.applicantEmail} when you confirm.`
                      : "We'll leave the good news to a person."}
              </div>
            </div>
            {fundedEmail?.applicantEmail && (
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="cursor-pointer rounded text-xs text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-2"
              >
                {showPreview ? "Hide" : "Preview"}
              </button>
            )}
            <Switch
              checked={sendFunded}
              onCheckedChange={setEmailFounder}
              disabled={!canEmailFunded}
              aria-label="Email the founder"
            />
          </div>
          {showPreview && fundedEmail && (
            <div className="border-t border-border px-3 py-3 text-sm">
              <div className="text-xs text-fg-muted">
                <span className="text-fg-subtle">Subject</span> {fundedEmail.subject}
              </div>
              <p className="mt-2 leading-relaxed whitespace-pre-wrap text-fg-muted">{fundedEmail.body}</p>
            </div>
          )}
        </div>
      )}

      {outcome === "decline" && <DeclineFields form={decline} />}

      {(outcome === "revisit" || outcome === "no_quorum") && (
        <div className="grid gap-3 sm:grid-cols-[1fr_170px]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-next">Next step</Label>
            <Input
              id="decision-next"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
              placeholder={outcome === "revisit" ? "Ask the founder for pilot numbers" : "Re-run the vote at Thursday's meeting"}
              maxLength={200}
              className="max-md:h-11 max-md:text-base"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="decision-due">Due</Label>
            <Input
              id="decision-due"
              type="date"
              value={nextStepDue}
              onChange={(e) => setNextStepDue(e.target.value)}
              className="tnum max-md:h-11 max-md:text-base"
            />
          </div>
        </div>
      )}

      {outcome !== "decline" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="decision-note">
            Decision note <span className="font-normal text-fg-subtle">— optional</span>
          </Label>
          <Textarea
            id="decision-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              outcome === "fund"
                ? "Conditions, what was agreed in the room…"
                : "What does the club need to see before it votes again?"
            }
            maxLength={2000}
            className="max-md:text-base"
          />
        </div>
      )}

      <ul className="flex flex-col gap-1 rounded-lg border border-border px-3 py-2.5 text-sm" aria-label="What happens when you confirm">
        {effects.map((e) => (
          <li key={e} className="flex gap-2">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
            <span className="tnum text-fg-muted">{e}</span>
          </li>
        ))}
      </ul>

      <DialogFooter>
        <Button variant="ghost" onClick={onDone} className="max-md:h-11">
          Cancel
        </Button>
        <Button
          onClick={confirm}
          disabled={busy || !valid || (outcome === "fund" && !existingGrant && pools.length === 0)}
          variant={outcome === "decline" ? "danger" : "default"}
          className="max-md:h-12 max-md:text-base"
        >
          {busy
            ? "Recording…"
            : outcome === "fund"
              ? existingGrant
                ? "Record: fund"
                : amountValid
                  ? `Fund ${formatMoney(amount)}`
                  : "Fund"
              : outcome === "decline"
                ? decline.send
                  ? "Decline and send"
                  : "Record: decline"
                : outcome === "revisit"
                  ? "Record: revisit"
                  : "Record: no quorum"}
        </Button>
      </DialogFooter>
    </div>
  );
}
