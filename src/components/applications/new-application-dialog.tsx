"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CopyIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import {
  checkDuplicates,
  createApplication,
  getNewApplicationOptions,
} from "@/lib/actions/applications";
import { APPLICATION_PRIORITIES, type ApplicationPriority } from "@/db/schema";
import { cn } from "@/lib/utils";
import { PriorityGlyph, PRIORITY_LABELS } from "@/components/patterns/priority-glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/patterns/field";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";

type Candidate = {
  applicationId: string;
  refLabel: string;
  companyName: string;
  reason: string;
  status: string;
  stageName: string;
};
type Options = { sectors: { id: string; name: string }[]; sources: { id: string; name: string }[] };

const NONE = "none";

/**
 * Fast add — must take under 10 seconds for the common case: only the company
 * name is required. Likely duplicates surface as you type, before you create
 * a second record for the same founder.
 *
 * Renders its own button by default. Pass `open`/`onOpenChange` to drive it
 * from elsewhere (the sidebar button, the `C` shortcut, the command palette);
 * in that mode the trigger is omitted.
 */
export function NewApplicationDialog({
  open: controlledOpen,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (controlled) onOpenChange?.(next);
      else setUncontrolledOpen(next);
    },
    [controlled, onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button size="sm" className="max-md:h-10">
            <PlusIcon />
            New application
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>
            Only the company name is required — everything else can be filled in on the record.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per open, so the form and its duplicate check start clean. */}
        {open && <NewApplicationForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function NewApplicationForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [companyName, setCompanyName] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [applicantEmail, setApplicantEmail] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [priority, setPriority] = React.useState<ApplicationPriority>("none");
  const [sourceId, setSourceId] = React.useState(NONE);
  const [sectorId, setSectorId] = React.useState(NONE);
  const [options, setOptions] = React.useState<Options | null>(null);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    void getNewApplicationOptions({}).then((res) => {
      if (!cancelled && res.ok) setOptions(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced duplicate check on the three fields that identify a company.
  React.useEffect(() => {
    const query = {
      companyName: companyName.trim(),
      domain: domain.trim(),
      applicantEmail: applicantEmail.trim(),
    };
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        if (query.companyName.length < 3 && !query.domain && !query.applicantEmail) {
          if (!cancelled) setCandidates([]);
          return;
        }
        const res = await checkDuplicates(query);
        if (!cancelled && res.ok) setCandidates(res.data.candidates);
      },
      350
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [companyName, domain, applicantEmail]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const text = (name: string) => String(fd.get(name) ?? "").trim() || undefined;
    const res = await createApplication({
      companyName,
      domain: domain.trim() || undefined,
      applicantName: text("applicantName"),
      applicantEmail: applicantEmail.trim() || undefined,
      amountRequested: fd.get("amountRequested") ? Number(fd.get("amountRequested")) : undefined,
      pitchSummary: text("pitchSummary"),
      priority,
      sourceId: sourceId === NONE ? undefined : sourceId,
      sectorIds: sectorId === NONE ? undefined : [sectorId],
      // The member has seen the warning above the button and is going ahead.
      allowDuplicate: candidates.length > 0,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    onDone();
    if (res.data.duplicate) {
      toast.info("That company already has an open application — opening it.");
    }
    router.push(`/pipeline/${res.data.applicationId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Company">
          <Input id="companyName"
            required
            autoFocus
            maxLength={120}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Lecture Loop"
           
          />
        </Field>
        <Field label="Website">
          <Input id="domain"
            inputMode="url"
            autoCapitalize="none"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="lectureloop.app"
           
          />
        </Field>
        <Field label="Founder">
          <Input id="applicantName" name="applicantName" maxLength={120} placeholder="Jordan Lee" />
        </Field>
        <Field label="Founder email">
          <Input id="applicantEmail"
            type="email"
            autoCapitalize="none"
            value={applicantEmail}
            onChange={(e) => setApplicantEmail(e.target.value)}
            placeholder="jordan@school.edu"
           
          />
        </Field>
      </div>

      {candidates.length > 0 && (
        <div className="rounded-lg border border-warning-border bg-warning-bg px-3 py-2.5" role="status">
          <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
            <CopyIcon className="size-3.5" />
            {candidates.length === 1 ? "This may already be in the pipeline" : "These may be the same company"}
          </div>
          <ul className="mt-1.5 flex flex-col gap-1">
            {candidates.map((c) => (
              <li key={c.applicationId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <Link
                  href={`/pipeline/${c.applicationId}`}
                  onClick={onDone}
                  className="font-medium underline-offset-2 hover:underline max-md:py-1.5"
                >
                  <span className="font-mono text-xs text-fg-muted">{c.refLabel}</span> {c.companyName}
                </Link>
                <span className="text-xs text-fg-muted">
                  {c.reason} · {c.status === "open" ? c.stageName : c.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ask">
          <MoneyInput name="amountRequested" value={amount} onValueChange={setAmount} decimals={0} placeholder="1,500" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <Label>Priority</Label>
          <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Priority">
            {APPLICATION_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={priority === p}
                aria-label={PRIORITY_LABELS[p]}
                title={PRIORITY_LABELS[p]}
                onClick={() => setPriority(p)}
                className={cn(
                  "flex h-8 cursor-pointer items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 max-md:h-11",
                  priority === p
                    ? "border-accent bg-accent-subtle"
                    : "border-border bg-panel hover:border-border-strong"
                )}
              >
                {p === "none" ? <span className="text-xs text-fg-subtle">—</span> : <PriorityGlyph priority={p} />}
              </button>
            ))}
          </div>
        </div>
        {options && options.sources.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sourceId">How it reached us</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger id="sourceId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {options.sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {options && options.sectors.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sectorId">Sector</Label>
            <Select value={sectorId} onValueChange={setSectorId}>
              <SelectTrigger id="sectorId">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Not set</SelectItem>
                {options.sectors.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Field label="One-line pitch">
        <Textarea id="pitchSummary"
          name="pitchSummary"
          rows={2}
          maxLength={2000}
          placeholder="What are they building, and what's the grant for?"
          className="max-md:text-base"
        />
      </Field>

      <DialogFooter>
        <Button type="submit" disabled={busy || !companyName.trim()} className="max-md:h-12 max-md:text-base">
          {busy ? "Adding…" : candidates.length > 0 ? "Add anyway" : "Add to pipeline"}
        </Button>
      </DialogFooter>
    </form>
  );
}
