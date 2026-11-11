"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, ArchiveIcon, PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createStage, updateStage, reorderStage, archiveStage } from "@/lib/actions/stages";
import { STAGE_KINDS, type StageKind } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Field } from "@/components/patterns/field";

const COLOR_TOKENS = Array.from({ length: 10 }, (_, i) => `cat-${i + 1}`);

type StageRow = {
  id: string;
  name: string;
  kind: StageKind;
  colorToken: string;
  slaDays: number | null;
  minAttendees: number | null;
  requiresMemo: boolean;
  requiresVote: boolean;
  isEntryStage: boolean;
};

function gateSummary(s: StageRow) {
  const gates: string[] = [];
  if (s.minAttendees) gates.push(`${s.minAttendees} chat verdicts`);
  if (s.requiresMemo) gates.push("memo");
  if (s.requiresVote) gates.push("vote");
  if (s.slaDays) gates.push(`${s.slaDays}d SLA`);
  return gates.join(" · ");
}

function ColorSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COLOR_TOKENS.map((t) => (
          <SelectItem key={t} value={t}>
            <span className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ background: `var(--${t})` }}
                aria-hidden
              />
              {t}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EditStageDialog({ stage }: { stage: StageRow }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [colorToken, setColorToken] = React.useState(stage.colorToken);
  const [requiresMemo, setRequiresMemo] = React.useState(stage.requiresMemo);
  const [requiresVote, setRequiresVote] = React.useState(stage.requiresVote);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const sla = String(fd.get("slaDays") ?? "");
    const minAtt = String(fd.get("minAttendees") ?? "");
    const res = await updateStage({
      stageId: stage.id,
      name: String(fd.get("name") ?? ""),
      slaDays: sla ? Number(sla) : null,
      minAttendees: minAtt ? Number(minAtt) : null,
      requiresMemo,
      requiresVote,
      colorToken,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Stage updated");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${stage.name}`}>
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit {stage.name}</DialogTitle>
          <DialogDescription>
            Gates are enforced when an application advances past this stage.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`name-${stage.id}`}>Name</Label>
              <Input id={`name-${stage.id}`} name="name" required defaultValue={stage.name} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <ColorSelect value={colorToken} onChange={setColorToken} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`sla-${stage.id}`}>SLA (days)</Label>
              <Input
                id={`sla-${stage.id}`}
                name="slaDays"
                type="number"
                min={1}
                max={365}
                defaultValue={stage.slaDays ?? ""}
                placeholder="none"
                className="tnum"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`att-${stage.id}`}>Chat verdicts needed</Label>
              <Input
                id={`att-${stage.id}`}
                name="minAttendees"
                type="number"
                min={1}
                max={20}
                defaultValue={stage.minAttendees ?? ""}
                placeholder="none"
                className="tnum"
              />
            </div>
          </div>
          {stage.kind === "active" && (
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={requiresMemo}
                  onCheckedChange={(v) => setRequiresMemo(v === true)}
                />
                Requires a circulated memo to advance past
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={requiresVote}
                  onCheckedChange={(v) => setRequiresVote(v === true)}
                />
                Requires a revealed vote to advance past
              </label>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddStageDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<StageKind>("active");
  const [colorToken, setColorToken] = React.useState("cat-1");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await createStage({
      name: String(fd.get("name") ?? ""),
      kind,
      colorToken,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    toast.success("Stage added");
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <PlusIcon />
          Add stage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a stage</DialogTitle>
          <DialogDescription>
            New active stages slot in just before the terminal stages.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Name">
            <Input id="new-stage-name" name="name" required autoFocus placeholder="Deep Dive" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              {(control) => (
                <Select value={kind} onValueChange={(v) => setKind(v as StageKind)}>
                  <SelectTrigger {...control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
            <div className="flex flex-col gap-1.5">
              <Label>Color</Label>
              <ColorSelect value={colorToken} onChange={setColorToken} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add stage"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StageManager({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function move(stageId: string, direction: "up" | "down") {
    setBusy(true);
    const res = await reorderStage({ stageId, direction });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function archive(stage: StageRow) {
    if (!window.confirm(`Archive the ${stage.name} stage? Stage history is kept.`)) return;
    setBusy(true);
    const res = await archiveStage({ stageId: stage.id });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Stage archived");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      {stages.map((s) => {
        const sameKind = stages.filter((x) => x.kind === s.kind);
        const kindIdx = sameKind.findIndex((x) => x.id === s.id);
        const canUp = !s.isEntryStage && kindIdx > 0 && !sameKind[kindIdx - 1].isEntryStage;
        const canDown = !s.isEntryStage && kindIdx < sameKind.length - 1;
        return (
          <div
            key={s.id}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-bg-subtle"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: `var(--${s.colorToken})` }}
              aria-hidden
            />
            <span className="min-w-0 truncate font-medium">{s.name}</span>
            {s.kind !== "active" && <Badge variant="neutral">{s.kind}</Badge>}
            {s.isEntryStage && <Badge variant="neutral">entry</Badge>}
            <span className="ml-auto shrink-0 text-2xs text-fg-subtle">{gateSummary(s)}</span>
            <span className="flex shrink-0 items-center">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || !canUp}
                onClick={() => move(s.id, "up")}
                aria-label={`Move ${s.name} up`}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busy || !canDown}
                onClick={() => move(s.id, "down")}
                aria-label={`Move ${s.name} down`}
              >
                <ArrowDownIcon />
              </Button>
              <EditStageDialog stage={s} />
              {!s.isEntryStage && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => archive(s)}
                  aria-label={`Archive ${s.name}`}
                >
                  <ArchiveIcon />
                </Button>
              )}
            </span>
          </div>
        );
      })}
      <div className="pt-1">
        <AddStageDialog />
      </div>
    </div>
  );
}
