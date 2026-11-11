"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArchiveIcon, CopyPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { duplicateAsScenario, archiveCapTable } from "@/lib/actions/captable";
import { useCan } from "@/components/shell/viewer";
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
  const canContribute = useCan("contribute");
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  if (!canContribute) return null;

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
    setDuplicateOpen(false);
    toast.success("Scenario created");
    router.push(`/lab/${res.data.capTableId}`);
  }

  async function archive() {
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
      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="secondary">
            <CopyPlusIcon />
            Duplicate as scenario
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Duplicate as scenario</DialogTitle>
            <DialogDescription>
              Copies the whole ledger into a branch you can change freely. The original stays as
              it is, so you can compare two offers side by side.
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

      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            <ArchiveIcon />
            Archive
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive “{tableName}”?</DialogTitle>
            <DialogDescription>
              It leaves the Lab list for everyone in the club. Nothing is deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setArchiveOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" disabled={busy} onClick={archive}>
              {busy ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
