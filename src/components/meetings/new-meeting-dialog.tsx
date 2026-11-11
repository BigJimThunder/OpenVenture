"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/shell/viewer";
import { MeetingFormDialog } from "./meeting-form-dialog";

/** "New meeting" button + dialog. Renders nothing for read-only members. */
export function NewMeetingDialog({ label = "New meeting" }: { label?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!useCan("contribute")) return null;
  return (
    <>
      <Button className="max-md:h-10" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      {open && <MeetingFormDialog open onOpenChange={setOpen} />}
    </>
  );
}
