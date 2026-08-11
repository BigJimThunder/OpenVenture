"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SendIcon, VoteIcon } from "lucide-react";
import { toast } from "sonner";
import { circulateMemo, updateMemoMeta } from "@/lib/actions/memos";
import { openVoteRound } from "@/lib/actions/votes";
import { MEMO_RECOMMENDATIONS, type MemoRecommendation, type MemoStatus, type MemberRole } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "@/components/ui/dialog";

const REC_LABELS: Record<MemoRecommendation, string> = {
  fund: "Fund",
  decline: "Decline",
  watch: "Watch",
  more_diligence: "More diligence",
};

export function MemoToolbar({
  memoId,
  status,
  recommendation,
  proposedAmount,
  hasOpenRound,
  viewerRole,
  members,
}: {
  memoId: string;
  status: MemoStatus;
  recommendation: MemoRecommendation | null;
  proposedAmount: string | null;
  hasOpenRound: boolean;
  viewerRole: MemberRole;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [voteOpen, setVoteOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(proposedAmount ? String(Number(proposedAmount)) : "");
  const closed = status === "decided" || status === "archived";
  const isPartnerPlus = viewerRole === "admin" || viewerRole === "partner";

  async function setRec(rec: MemoRecommendation) {
    const res = await updateMemoMeta({ memoId, recommendation: rec });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function saveAmount() {
    const res = await updateMemoMeta({
      memoId,
      proposedAmount: amount === "" ? null : Number(amount),
    });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  async function circulate() {
    setBusy(true);
    const res = await circulateMemo({ memoId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Version ${(res.data as { versionNo: number }).versionNo} circulated to the club`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={recommendation ?? undefined}
        onValueChange={(v) => setRec(v as MemoRecommendation)}
        disabled={closed}
      >
        <SelectTrigger className="h-8 w-40">
          <SelectValue placeholder="Recommendation…" />
        </SelectTrigger>
        <SelectContent>
          {MEMO_RECOMMENDATIONS.map((r) => (
            <SelectItem key={r} value={r}>
              {REC_LABELS[r]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={0}
          step={1}
          placeholder="Amount $"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={saveAmount}
          disabled={closed}
          className="tnum w-28"
        />
      </div>
      {!closed && (
        <Button size="sm" variant="secondary" onClick={circulate} disabled={busy}>
          <SendIcon />
          {status === "draft" ? "Circulate" : "Re-circulate"}
        </Button>
      )}
      {!closed && !hasOpenRound && status !== "draft" && isPartnerPlus && (
        <Button size="sm" onClick={() => setVoteOpen(true)}>
          <VoteIcon />
          Open vote
        </Button>
      )}

      <OpenVoteDialog
        open={voteOpen}
        onOpenChange={setVoteOpen}
        memoId={memoId}
        members={members}
      />
    </div>
  );
}

function OpenVoteDialog({
  open,
  onOpenChange,
  memoId,
  members,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  memoId: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [hours, setHours] = React.useState("48");
  const [recused, setRecused] = React.useState<Set<string>>(new Set());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await openVoteRound({
      memoId,
      closesInHours: Number(hours),
      recusedMemberIds: [...recused],
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onOpenChange(false);
    toast.success("Blind vote opened — ballots are hidden until reveal");
    router.push(`/memos/${memoId}/vote`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Open a blind vote</DialogTitle>
          <DialogDescription>
            Conviction 1–5 + fund/decline + required rationale. Nobody — chair included —
            sees ballots until reveal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hours">Closes in (hours)</Label>
            <Input
              id="hours"
              type="number"
              min={1}
              max={336}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="tnum w-24"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Recusals (conflicts of interest)</Label>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
              {members.map((m) => (
                <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={recused.has(m.id)}
                    onCheckedChange={(c) => {
                      const next = new Set(recused);
                      if (c) next.add(m.id);
                      else next.delete(m.id);
                      setRecused(next);
                    }}
                  />
                  {m.name}
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Opening…" : "Open vote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
