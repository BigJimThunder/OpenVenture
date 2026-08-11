"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PiggyBankIcon } from "lucide-react";
import { toast } from "sonner";
import { createPool } from "@/lib/actions/grants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewPoolDialog({ defaultFiscalYear }: { defaultFiscalYear: number }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await createPool({
      name: String(fd.get("name") ?? ""),
      fiscalYear: Number(fd.get("fiscalYear")),
      totalBudget: Number(fd.get("totalBudget")),
      rolloverFromPrior: fd.get("rolloverFromPrior")
        ? Number(fd.get("rolloverFromPrior"))
        : 0,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Pool created");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PiggyBankIcon />
          New pool
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create a grant pool</DialogTitle>
          <DialogDescription>
            One pool per fiscal year — remaining budget is always derived, never stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pool-name">Name</Label>
            <Input
              id="pool-name"
              name="name"
              required
              defaultValue={`FY${defaultFiscalYear} Grant Pool`}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pool-fy">Fiscal year</Label>
              <Input
                id="pool-fy"
                name="fiscalYear"
                type="number"
                required
                defaultValue={defaultFiscalYear}
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pool-budget">Budget ($)</Label>
              <Input
                id="pool-budget"
                name="totalBudget"
                type="number"
                min={1}
                step="0.01"
                required
                placeholder="50000"
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pool-rollover">Rollover ($)</Label>
              <Input
                id="pool-rollover"
                name="rolloverFromPrior"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                className="tnum"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create pool"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
