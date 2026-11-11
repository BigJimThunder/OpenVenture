"use client";

import * as React from "react";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { DeclineDialog } from "./decline-dialog";

/** "Decline…" for the record page — opens the same one-step dialog as the board. */
export function DeclineButton({
  applicationId,
  companyName,
  lostStageId,
}: {
  applicationId: string;
  companyName: string;
  lostStageId: string;
}) {
  const canEdit = useCan("contribute");
  const [open, setOpen] = React.useState(false);
  if (!canEdit) return null;
  return (
    <>
      <Button variant="danger-ghost" size="sm" onClick={() => setOpen(true)} className="max-md:h-10">
        Decline…
      </Button>
      <DeclineDialog
        target={open ? { id: applicationId, companyName } : null}
        lostStageId={lostStageId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
