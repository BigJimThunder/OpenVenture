"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { moveApplicationStage } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeclineFields, useDeclineForm } from "./decline-fields";

export type DeclineTarget = { id: string; companyName: string };

/**
 * The one decline step: reason, note, and the founder email, confirmed once.
 * Mount it with a `key` per application so the form starts clean.
 */
export function DeclineDialog({
  target,
  lostStageId,
  onClose,
}: {
  target: DeclineTarget | null;
  lostStageId: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {target && lostStageId && (
          <DeclineBody key={target.id} target={target} lostStageId={lostStageId} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeclineBody({
  target,
  lostStageId,
  onClose,
}: {
  target: DeclineTarget;
  lostStageId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const form = useDeclineForm(target.id);
  const [busy, setBusy] = React.useState(false);

  async function confirm() {
    if (!form.valid) return;
    setBusy(true);
    const input = form.toInput();
    const res = await moveApplicationStage({
      applicationId: target.id,
      toStageId: lostStageId,
      declineReason: input.declineReason,
      declineNote: input.note,
      founderEmail: input.founderEmail,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      input.founderEmail.send
        ? `${target.companyName} declined — the founder has been emailed`
        : `${target.companyName} declined`
    );
    onClose();
    router.refresh();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Decline {target.companyName}</DialogTitle>
        <DialogDescription>
          One step: the reason goes on the record, the application moves to declined, and the
          founder hears from us if you choose.
        </DialogDescription>
      </DialogHeader>
      <DeclineFields form={form} />
      <DialogFooter>
        <Button variant="ghost" onClick={onClose} className="max-md:h-11">
          Cancel
        </Button>
        <Button variant="danger" disabled={!form.valid || busy} onClick={confirm} className="max-md:h-11">
          {busy ? "Declining…" : form.send ? "Decline and send" : "Decline"}
        </Button>
      </DialogFooter>
    </>
  );
}
