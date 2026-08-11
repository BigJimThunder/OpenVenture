"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, CopyPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { duplicateAsScenario, archiveCapTable } from "@/lib/actions/captable";
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

export function TableActions({
  capTableId,
  tableName,
}: {
  capTableId: string;
  tableName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function duplicate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await duplicateAsScenario({
      capTableId,
      name: String(fd.get("name") ?? ""),
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Scenario created");
    router.push(`/lab/${res.data.capTableId}`);
  }

  async function archive() {
    if (!window.confirm(`Archive “${tableName}”? It disappears from the Lab list.`)) return;
    setBusy(true);
    const res = await archiveCapTable({ capTableId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Cap table archived");
    router.push("/lab");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <CopyPlusIcon />
            Duplicate as scenario
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate as scenario</DialogTitle>
            <DialogDescription>
              Copies the full event ledger into a sandbox branch — the original stays untouched.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={duplicate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="scenario-name">Scenario name</Label>
              <Input
                id="scenario-name"
                name="name"
                required
                autoFocus
                defaultValue={`${tableName} — scenario`}
                maxLength={120}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Duplicating…" : "Duplicate"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="ghost" disabled={busy} onClick={archive}>
        <ArchiveIcon />
        Archive
      </Button>
    </>
  );
}
