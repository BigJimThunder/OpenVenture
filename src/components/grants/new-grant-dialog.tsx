"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";
import { createGrant } from "@/lib/actions/grants";
import { USE_OF_FUNDS, type UseOfFunds } from "@/db/schema";
import { cn, formatMoney } from "@/lib/utils";
import { USE_OF_FUNDS_LABELS } from "./use-of-funds";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export { USE_OF_FUNDS_LABELS };

type GrantableApp = {
  id: string;
  companyId: string;
  companyName: string;
  amountRequested: string | null;
  useOfFundsNarrative: string | null;
  stageName: string;
};

export function NewGrantDialog({
  pools,
  defaultPoolId,
  applications,
  prefillApplicationId,
  triggerLabel = "New grant",
  remaining,
}: {
  pools: { id: string; name: string }[];
  defaultPoolId: string;
  applications: GrantableApp[];
  prefillApplicationId?: string;
  triggerLabel?: string;
  /** What the default pool has left — lets the form warn before an admin has to refuse. */
  remaining?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [appId, setAppId] = React.useState<string | undefined>(prefillApplicationId);
  const [poolId, setPoolId] = React.useState(defaultPoolId);
  const [amount, setAmount] = React.useState("");
  const [useOfFunds, setUseOfFunds] = React.useState<UseOfFunds>("other");
  const [narrative, setNarrative] = React.useState("");

  const selectedApp = applications.find((a) => a.id === appId);
  const poolRemaining = poolId === defaultPoolId ? remaining : undefined;
  const overPool = poolRemaining != null && Number(amount) > poolRemaining;

  function selectApp(a: GrantableApp) {
    setAppId(a.id);
    setPickerOpen(false);
    if (!amount && a.amountRequested) setAmount(String(Number(a.amountRequested)));
    if (!narrative && a.useOfFundsNarrative) setNarrative(a.useOfFundsNarrative);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!appId) {
      toast.error("Pick the application this grant funds");
      return;
    }
    setBusy(true);
    const res = await createGrant({
      applicationId: appId,
      poolId,
      amountAwarded: Number(amount),
      useOfFunds,
      useOfFundsNarrative: narrative || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Grant proposed");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Propose a grant</DialogTitle>
          <DialogDescription>
            A proposal records what the club agreed to. It doesn&apos;t reserve budget — an
            admin&apos;s approval does.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Application</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="secondary" className="justify-between font-normal">
                  {selectedApp ? (
                    <span>
                      {selectedApp.companyName}
                      <span className="ml-2 text-2xs text-fg-subtle">
                        {selectedApp.stageName}
                        {selectedApp.amountRequested
                          ? ` · asking ${formatMoney(selectedApp.amountRequested)}`
                          : ""}
                      </span>
                    </span>
                  ) : (
                    <span className="text-fg-subtle">Search applications…</span>
                  )}
                  <ChevronDownIcon className="text-fg-subtle" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search applications…" />
                  <CommandList>
                    <CommandEmpty>No application is ready for a grant.</CommandEmpty>
                    <CommandGroup>
                      {applications.map((a) => (
                        <CommandItem key={a.id} value={a.companyName} onSelect={() => selectApp(a)}>
                          <span className="truncate">{a.companyName}</span>
                          <span className="ml-auto text-2xs text-fg-subtle">
                            {a.stageName}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amount">Amount ($)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min={1}
                step={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Use of funds</Label>
              <Select value={useOfFunds} onValueChange={(v) => setUseOfFunds(v as UseOfFunds)}>
                <SelectTrigger>
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
          </div>

          {poolRemaining != null && (
            <p
              className={cn(
                "tnum -mt-1 text-xs",
                overPool ? "text-danger" : "text-fg-subtle"
              )}
            >
              {overPool
                ? `The pool has ${formatMoney(poolRemaining)} left. You can still propose this, but it can't be approved until the award is lowered or the pool grows.`
                : `The pool has ${formatMoney(poolRemaining)} left to approve against.`}
            </p>
          )}

          {pools.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label>Pool</Label>
              <Select value={poolId} onValueChange={setPoolId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pools.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="narrative">What will it pay for?</Label>
            <Textarea
              id="narrative"
              rows={2}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Incorporation filing + registered agent for year one"
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={busy || !amount}>
              {busy ? "Proposing…" : "Propose grant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
