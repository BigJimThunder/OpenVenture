"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LockIcon, RotateCcwIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { finalizeFundingRequest, reopenFundingRequest, sendFundingRequest } from "@/lib/actions/funding-request";
import { updateClubPreferences } from "@/lib/actions/settings";
import {
  reconcileItems,
  type FundingRequestContent,
  type FundingRequestFacts,
} from "@/lib/reports/funding-request";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function FinalizeFundingRequest({
  applicationId,
  companyName,
  blockers,
  facts,
  content,
  disabled,
  beforeSubmit,
}: {
  applicationId: string;
  companyName: string;
  blockers: string[];
  facts: FundingRequestFacts;
  content: FundingRequestContent;
  /** The viewer isn't a partner: shown, but not offered. */
  disabled: boolean;
  /** Flush pending autosaves so the server finalizes what is on screen. */
  beforeSubmit: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const warnings = [
    reconcileItems(content.askedItems, facts.askedTotal, "the founder asked for"),
    reconcileItems(content.approvedItems, facts.approvedTotal, "the grant is"),
  ].flatMap((r) => (r.state === "mismatch" ? [r.message] : []));

  async function confirm() {
    setBusy(true);
    await beforeSubmit();
    const res = await finalizeFundingRequest({ applicationId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Finalized. Send it for sign-off when you are ready.");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="max-md:h-11" disabled={disabled || blockers.length > 0}>
          <LockIcon />
          Finalize
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finalize the request for {companyName}</DialogTitle>
          <DialogDescription>
            The numbers are frozen as they stand now and the text is locked. If the grant changes later, the
            memo will not. A partner can reopen it.
          </DialogDescription>
        </DialogHeader>
        {warnings.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-warning-border bg-warning-bg px-3 py-2.5 text-sm text-warning">
            {warnings.map((w) => (
              <div key={w} className="tnum flex gap-2">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                {w}
              </div>
            ))}
            <p className="pl-6 text-xs">You can finalize anyway, but the reader will do the sum.</p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="max-md:h-11">
            Keep editing
          </Button>
          <Button onClick={confirm} disabled={busy} className="max-md:h-11">
            {busy ? "Finalizing…" : "Finalize"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReopenFundingRequest({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function reopen() {
    setBusy(true);
    const res = await reopenFundingRequest({ applicationId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Reopened as a draft. The numbers are live again.");
    router.refresh();
  }
  return (
    <Button size="sm" variant="secondary" onClick={reopen} disabled={busy} className="max-md:h-10">
      <RotateCcwIcon />
      {busy ? "Reopening…" : "Reopen"}
    </Button>
  );
}

export function SendFundingRequest({
  applicationId,
  companyName,
  approverName,
  approverEmail,
  alreadySent,
}: {
  applicationId: string;
  companyName: string;
  approverName: string;
  approverEmail: string;
  alreadySent: boolean;
}) {
  const router = useRouter();
  const canSaveDefault = useCan("manageClub");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [to, setTo] = React.useState(approverEmail);
  const [note, setNote] = React.useState("");
  const [remember, setRemember] = React.useState(true);
  const valid = /\S+@\S+\.\S+/.test(to.trim());
  const offerRemember = canSaveDefault && !approverEmail;

  async function send() {
    setBusy(true);
    const res = await sendFundingRequest({ applicationId, to: to.trim(), note: note.trim() || undefined });
    if (res.ok && offerRemember && remember) {
      await updateClubPreferences({ reports: { approverEmail: res.data.sentTo[0] } });
    }
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Sent to ${res.data.sentTo.join(", ")}`);
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={alreadySent ? "secondary" : "default"} className="max-md:h-10">
          <SendIcon />
          {alreadySent ? "Send again" : "Send for sign-off"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send the {companyName} request for sign-off</DialogTitle>
          <DialogDescription>
            The whole memo goes in the body of the email, so it can be read and answered without signing in.
            Replies come to you.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fr-send-to">To{approverName ? ` (${approverName})` : ""}</Label>
            <Input
              id="fr-send-to"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="advisor@university.edu"
              className="max-md:text-base"
            />
            {!approverEmail && (
              <p className="text-xs text-fg-subtle">
                {canSaveDefault
                  ? "No approver is saved for the club yet."
                  : "No approver is saved for the club yet. An admin can set one in Settings → Reports."}
              </p>
            )}
            {offerRemember && (
              <label className="flex items-center gap-2 text-sm max-md:py-1.5">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
                Use this address for future requests
              </label>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fr-send-note">
              Note above the memo <span className="font-normal text-fg-subtle">— optional</span>
            </Label>
            <Textarea
              id="fr-send-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              placeholder="We voted on Thursday. The founder needs the parts by the 20th."
              className="max-md:text-base"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} className="max-md:h-11">
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !valid} className="max-md:h-11">
            {busy ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
