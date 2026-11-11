"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SendIcon,
  VoteIcon,
} from "lucide-react";
import { toast } from "sonner";
import { circulateMemo, setMemoArchived, updateMemoMeta } from "@/lib/actions/memos";
import { openVoteRound } from "@/lib/actions/votes";
import { MEMO_RECOMMENDATIONS, type MemoRecommendation, type MemoStatus } from "@/db/schema";
import { formatMoney } from "@/lib/utils";
import { useCan, useViewer } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { REC_LABEL } from "./memo-labels";

const NO_REC = "none";

/**
 * The memo's header actions: circulate, open a vote, and a menu for editing
 * the details (title, recommendation, proposed amount) or archiving a draft.
 * Everything a member's role can't do is simply absent.
 */
export function MemoActions({
  memoId,
  title,
  status,
  recommendation,
  proposedAmount,
  amountRequested,
  authorMemberId,
  hasOpenRound,
  hasAnyRound,
  members,
}: {
  memoId: string;
  title: string;
  status: MemoStatus;
  recommendation: MemoRecommendation | null;
  proposedAmount: string | null;
  amountRequested: string | null;
  authorMemberId: string;
  hasOpenRound: boolean;
  hasAnyRound: boolean;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const viewer = useViewer();
  const canWrite = useCan("contribute");
  const canRunVotes = useCan("runVotes");
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<"details" | "vote" | "circulate" | "archive" | null>(null);

  const closed = status === "decided" || status === "archived";
  const canArchive =
    status === "draft" && !hasAnyRound && (viewer.memberId === authorMemberId || canRunVotes);
  const canRestore = status === "archived" && (viewer.memberId === authorMemberId || canRunVotes);

  if (!canWrite) return null;

  async function circulate() {
    const res = await circulateMemo({ memoId });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(`Version ${res.data.versionNo} sent to the club`);
    router.refresh();
  }

  async function archive(archived: boolean) {
    setBusy(true);
    const res = await setMemoArchived({ memoId, archived });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(archived ? "Draft archived" : "Draft restored");
    if (archived) router.push("/memos");
    router.refresh();
  }

  if (status === "archived") {
    return canRestore ? (
      <Button variant="secondary" className="max-md:h-10" onClick={() => archive(false)} disabled={busy}>
        <ArchiveRestoreIcon />
        Restore draft
      </Button>
    ) : null;
  }

  return (
    <>
      {!closed && (
        <Button
          variant={status === "draft" ? "default" : "secondary"}
          className="max-md:h-10"
          onClick={() => setDialog("circulate")}
        >
          <SendIcon />
          {status === "draft" ? "Circulate" : "Circulate new version"}
        </Button>
      )}
      {!closed && !hasOpenRound && status !== "draft" && canRunVotes && (
        <Button className="max-md:h-10" onClick={() => setDialog("vote")}>
          <VoteIcon />
          Open vote
        </Button>
      )}
      {!closed && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" className="max-md:size-10" aria-label="Memo actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onSelect={() => setDialog("details")}>
              <PencilIcon />
              Edit details
            </DropdownMenuItem>
            {canArchive && (
              <DropdownMenuItem onSelect={() => setDialog("archive")}>
                <ArchiveIcon />
                Archive draft
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {dialog === "details" && (
        <DetailsDialog
          memoId={memoId}
          title={title}
          recommendation={recommendation}
          proposedAmount={proposedAmount}
          amountRequested={amountRequested}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        open={dialog === "circulate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={status === "draft" ? "Circulate this memo?" : "Circulate a new version?"}
        description="A snapshot of the memo as it stands is saved as a numbered version, and every active member gets an email with a link. You can keep editing afterwards; the snapshot doesn't change."
        confirmLabel="Circulate to the club"
        onConfirm={circulate}
      />
      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Archive this draft?"
        description="It leaves the memo list and the application is free to start a fresh memo. Nothing is deleted — the author, a partner or an admin can restore it from the Archived group."
        confirmLabel="Archive draft"
        tone="danger"
        onConfirm={() => archive(true)}
      />
      <OpenVoteDialog
        open={dialog === "vote"}
        onOpenChange={(o) => setDialog(o ? "vote" : null)}
        memoId={memoId}
        members={members}
      />
    </>
  );
}

function DetailsDialog({
  memoId,
  title,
  recommendation,
  proposedAmount,
  amountRequested,
  onClose,
}: {
  memoId: string;
  title: string;
  recommendation: MemoRecommendation | null;
  proposedAmount: string | null;
  amountRequested: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [rec, setRec] = React.useState<string>(recommendation ?? NO_REC);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = String(fd.get("proposedAmount") ?? "").replace(/[$,\s]/g, "");
    setBusy(true);
    const res = await updateMemoMeta({
      memoId,
      title: String(fd.get("title") ?? ""),
      recommendation: rec === NO_REC ? null : (rec as MemoRecommendation),
      proposedAmount: amount || null,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Memo details saved");
    onClose();
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Memo details</DialogTitle>
          <DialogDescription>
            The recommendation and amount are the author&apos;s proposal. The club&apos;s vote decides.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="memo-title">Title</Label>
            <Input id="memo-title" name="title" required maxLength={200} defaultValue={title} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Recommendation</Label>
              <Select value={rec} onValueChange={setRec}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REC}>Not decided yet</SelectItem>
                  {MEMO_RECOMMENDATIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REC_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="memo-amount">Proposed amount ($)</Label>
              <Input
                id="memo-amount"
                name="proposedAmount"
                inputMode="decimal"
                placeholder="—"
                className="tnum"
                defaultValue={proposedAmount ? proposedAmount.replace(/\.00$/, "") : ""}
              />
            </div>
          </div>
          {amountRequested && (
            <p className="tnum text-xs text-fg-muted">
              The founder asked for {formatMoney(amountRequested)}.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="secondary" className="max-sm:h-10" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
    toast.success("Blind vote opened. Ballots stay hidden until reveal.");
    router.push(`/memos/${memoId}/vote`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open a blind vote</DialogTitle>
          <DialogDescription>
            Each member gives a conviction score, fund or decline, and a reason. Nobody — the chair
            included — sees ballots until reveal.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hours">Closes in (hours)</Label>
            <Input
              id="hours"
              type="number"
              inputMode="numeric"
              min={1}
              max={336}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="tnum w-24"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Recusals — anyone with a conflict of interest</Label>
            <div className="flex max-h-48 flex-col overflow-y-auto rounded-md border border-border p-1">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-sm px-2 text-sm hover:bg-bg-subtle max-md:min-h-11"
                >
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
            <Button type="submit" className="max-sm:h-10" disabled={busy}>
              {busy ? "Opening…" : "Open vote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
