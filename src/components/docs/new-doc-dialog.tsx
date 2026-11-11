"use client";

import * as React from "react";
import { PlusIcon } from "lucide-react";
import { useCan } from "@/components/shell/viewer";
import { Button } from "@/components/ui/button";
import { DocFormDialog } from "./doc-form-dialog";

/** "New doc" button + dialog. Renders nothing for read-only members. */
export function NewDocDialog({ folders, label = "New doc" }: { folders: string[]; label?: string }) {
  const [open, setOpen] = React.useState(false);
  if (!useCan("contribute")) return null;
  return (
    <>
      <Button className="max-md:h-10" onClick={() => setOpen(true)}>
        <PlusIcon />
        {label}
      </Button>
      {open && <DocFormDialog folders={folders} open onOpenChange={setOpen} />}
    </>
  );
}
