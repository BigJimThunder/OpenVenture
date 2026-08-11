"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createApplication } from "@/lib/actions/applications";
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

/** Fast add — must take under 10 seconds for the common case. */
export function NewApplicationDialog() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [manualOpen, setManualOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // ⌘K "New application" and the global C shortcut land here via ?new=1.
  // Open state is derived from the URL, not copied into state; closing
  // strips the param so the dialog doesn't re-open on back/refresh.
  const wantNew = searchParams.get("new") === "1";
  const open = manualOpen || wantNew;

  function setOpen(next: boolean) {
    setManualOpen(next);
    if (!next && wantNew) router.replace(pathname, { scroll: false });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const res = await createApplication({
      companyName: String(fd.get("companyName") ?? ""),
      domain: String(fd.get("domain") ?? "") || undefined,
      applicantName: String(fd.get("applicantName") ?? "") || undefined,
      amountRequested: fd.get("amountRequested")
        ? Number(fd.get("amountRequested"))
        : undefined,
      pitchSummary: String(fd.get("pitchSummary") ?? "") || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    if (res.data.duplicate) {
      toast.info("That company already has an open application — opening it.");
    }
    router.push(`/applications/${res.data.applicationId}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          New application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New application</DialogTitle>
          <DialogDescription>
            Only the company name is required — fill in the rest later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="companyName">Company</Label>
              <Input id="companyName" name="companyName" required autoFocus placeholder="Acme Robotics" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domain">Website</Label>
              <Input id="domain" name="domain" placeholder="acme.dev" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="applicantName">Founder</Label>
              <Input id="applicantName" name="applicantName" placeholder="Jordan Lee" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amountRequested">Ask ($)</Label>
              <Input
                id="amountRequested"
                name="amountRequested"
                type="number"
                min={0}
                step={50}
                placeholder="1500"
                className="tnum"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pitchSummary">One-line pitch</Label>
            <Textarea
              id="pitchSummary"
              name="pitchSummary"
              rows={2}
              placeholder="What are they building, and what's the grant for?"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "Add to pipeline"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
