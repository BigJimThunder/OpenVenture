"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * "Are you sure?" for anything a member can't trivially undo. Says what will
 * happen in the description, names the action on the button, and stays open
 * (with the button busy) until `onConfirm` settles.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  tone?: "default" | "danger";
  /** Resolve `false` to keep the dialog open (the action failed). */
  onConfirm: () => Promise<boolean | void>;
}) {
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    setBusy(true);
    const ok = await onConfirm();
    setBusy(false);
    if (ok !== false) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="pt-1 text-sm leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" className="max-sm:h-10" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "default"}
            className="max-sm:h-10"
            onClick={confirm}
            disabled={busy}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
