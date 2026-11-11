"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { addCapEvent } from "@/lib/actions/captable";
import type { CapEventPayload } from "@/lib/captable/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Kind =
  | "share_issuance"
  | "pool_create"
  | "option_grant"
  | "safe_issue"
  | "note_issue"
  | "stock_split";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "share_issuance", label: "Issue shares (founder or investor)" },
  { value: "pool_create", label: "Create or grow the option pool" },
  { value: "option_grant", label: "Grant options from the pool" },
  { value: "safe_issue", label: "SAFE" },
  { value: "note_issue", label: "Convertible note" },
  { value: "stock_split", label: "Stock split" },
];

function slugId(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "stakeholder";
}

export function AddEventDialog({
  capTableId,
  existingStakeholders,
}: {
  capTableId: string;
  existingStakeholders: { id: string; name: string; kind: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>("share_issuance");

  // Shared fields
  const [name, setName] = React.useState("");
  const [holderKind, setHolderKind] = React.useState("founder");
  const [amount, setAmount] = React.useState(""); // shares or $ depending on kind
  const [capType, setCapType] = React.useState<"post_money" | "pre_money" | "uncapped">("post_money");
  const [cap, setCap] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [mfn, setMfn] = React.useState(false);
  const [interest, setInterest] = React.useState("6");
  const [splitN, setSplitN] = React.useState("2");

  function stakeholderRef() {
    const existing = existingStakeholders.find(
      (s) => s.name.toLowerCase() === name.trim().toLowerCase()
    );
    return existing
      ? { id: existing.id, name: existing.name, kind: existing.kind as "founder" }
      : { id: slugId(name.trim()), name: name.trim(), kind: holderKind as "founder" };
  }

  function buildPayload(): CapEventPayload | string {
    const n = Number(amount);
    switch (kind) {
      case "share_issuance":
        if (!name.trim()) return "Stakeholder name is required";
        if (!(n > 0)) return "Share count must be positive";
        return { kind: "share_issuance", stakeholder: stakeholderRef(), classId: "common", shares: n };
      case "pool_create":
        if (!(n > 0)) return "Share count must be positive";
        return { kind: "pool_create", classId: "pool", shares: n };
      case "option_grant":
        if (!name.trim()) return "Grantee name is required";
        if (!(n > 0)) return "Share count must be positive";
        return { kind: "option_grant", stakeholder: stakeholderRef(), classId: "pool", shares: n };
      case "safe_issue": {
        if (!name.trim()) return "Investor name is required";
        if (!(n > 0)) return "Principal must be positive";
        const capN = Number(cap);
        if (capType !== "uncapped" && !(capN > 0)) return "A valuation cap is required";
        const d = discount === "" ? undefined : Number(discount) / 100;
        return {
          kind: "safe_issue",
          instrumentId: `safe-${Date.now().toString(36)}`,
          stakeholder: stakeholderRef(),
          principal: n,
          capType,
          valuationCap: capType === "uncapped" ? undefined : capN,
          discount: d,
          mfn,
        };
      }
      case "note_issue": {
        if (!name.trim()) return "Investor name is required";
        if (!(n > 0)) return "Principal must be positive";
        const capN = Number(cap);
        return {
          kind: "note_issue",
          instrumentId: `note-${Date.now().toString(36)}`,
          stakeholder: stakeholderRef(),
          principal: n,
          interestRate: Number(interest) / 100 || 0,
          issueDate: new Date().toISOString(),
          capType: capN > 0 ? "pre_money" : "uncapped",
          valuationCap: capN > 0 ? capN : undefined,
          discount: discount === "" ? undefined : Number(discount) / 100,
        };
      }
      case "stock_split": {
        const num = Number(splitN);
        if (!(num >= 2)) return "Split ratio must be at least 2";
        return { kind: "stock_split", numerator: Math.round(num), denominator: 1 };
      }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (typeof payload === "string") {
      toast.error(payload);
      return;
    }
    setBusy(true);
    const res = await addCapEvent({ capTableId, payload });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    setName("");
    setAmount("");
    setCap("");
    setDiscount("");
    setMfn(false);
    router.refresh();
  }

  const needsName = kind !== "pool_create" && kind !== "stock_split";
  const amountLabel =
    kind === "safe_issue" || kind === "note_issue"
      ? "Principal ($)"
      : kind === "stock_split"
        ? null
        : "Shares";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          Add event
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a ledger event</DialogTitle>
          <DialogDescription>
            Something that happened to the company&apos;s ownership. The whole ledger is recomputed
            before it saves, so an event that can&apos;t be true is refused with the reason.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Event type</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_OPTIONS.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsName && (
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sname">Stakeholder</Label>
                <Input
                  id="sname"
                  list="lab-stakeholders"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jordan Lee"
                />
                <datalist id="lab-stakeholders">
                  {existingStakeholders.map((s) => (
                    <option key={s.id} value={s.name} />
                  ))}
                </datalist>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Type</Label>
                <Select value={holderKind} onValueChange={setHolderKind}>
                  <SelectTrigger className="capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["founder", "employee", "advisor", "angel", "fund", "accelerator"].map((k) => (
                      <SelectItem key={k} value={k} className="capitalize">
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {amountLabel && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="samount">{amountLabel}</Label>
              <Input
                id="samount"
                type="number"
                min={1}
                className="tnum"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          )}

          {kind === "safe_issue" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Cap type</Label>
                  <Select value={capType} onValueChange={(v) => setCapType(v as typeof capType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="post_money">Post-money (YC standard)</SelectItem>
                      <SelectItem value="pre_money">Pre-money (original)</SelectItem>
                      <SelectItem value="uncapped">Uncapped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {capType !== "uncapped" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="scap">Valuation cap ($)</Label>
                    <Input id="scap" type="number" min={1} className="tnum" value={cap} onChange={(e) => setCap(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 items-end gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sdisc">Discount % (optional)</Label>
                  <Input id="sdisc" type="number" min={0} max={99} className="tnum" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
                  <Checkbox checked={mfn} onCheckedChange={(c) => setMfn(c === true)} />
                  MFN clause
                </label>
              </div>
            </>
          )}

          {kind === "note_issue" && (
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ncap">Cap ($, optional)</Label>
                <Input id="ncap" type="number" min={0} className="tnum" value={cap} onChange={(e) => setCap(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="nint">Interest %</Label>
                <Input id="nint" type="number" min={0} max={25} className="tnum" value={interest} onChange={(e) => setInterest(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ndisc">Discount %</Label>
                <Input id="ndisc" type="number" min={0} max={99} className="tnum" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
            </div>
          )}

          {kind === "stock_split" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="split">Split (N-for-1)</Label>
              <Input id="split" type="number" min={2} className="tnum w-24" value={splitN} onChange={(e) => setSplitN(e.target.value)} />
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
