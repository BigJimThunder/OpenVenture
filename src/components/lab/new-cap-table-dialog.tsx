"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createCapTable } from "@/lib/actions/captable";
import { PRESETS } from "@/lib/captable/presets";
import { cn } from "@/lib/utils";
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

export function NewCapTableDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [presetKey, setPresetKey] = React.useState("pitch-comp-safe");
  const [name, setName] = React.useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const preset = PRESETS.find((p) => p.key === presetKey);
    const res = await createCapTable({
      name: name.trim() || `${preset?.name ?? "Cap table"} — sandbox`,
      presetKey,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    router.push(`/lab/${(res.data as { capTableId: string }).capTableId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          New cap table
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New cap table</DialogTitle>
          <DialogDescription>
            Presets model the situations grantees actually walk in with.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPresetKey(p.key)}
                className={cn(
                  "cursor-pointer rounded-md border p-3 text-left transition-colors",
                  presetKey === p.key
                    ? "border-accent bg-accent-subtle/50"
                    : "border-border bg-panel hover:border-border-strong"
                )}
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="mt-0.5 text-xs text-fg-muted">{p.description}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Robotics — pre-seed model"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
