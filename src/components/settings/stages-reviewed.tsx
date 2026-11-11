"use client";

import * as React from "react";
import { CheckCircle2Icon } from "lucide-react";
import { toast } from "sonner";
import { updateClubPreferences } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";

/** The one getting-started step that needs a human to say "yes, this is right". */
export function StagesReviewed({ reviewed }: { reviewed: boolean }) {
  const [done, setDone] = React.useState(reviewed);
  const [pending, startTransition] = React.useTransition();

  function set(next: boolean) {
    startTransition(async () => {
      const res = await updateClubPreferences({ setup: { stagesReviewed: next } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setDone(next);
      if (next) toast.success("Stages confirmed");
    });
  }

  if (done) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-border bg-success-bg px-4 py-3 text-sm">
        <span className="flex items-center gap-2 text-success">
          <CheckCircle2Icon className="size-4" />
          You&apos;ve confirmed these stages match how the club decides.
        </span>
        <Button variant="ghost" size="sm" onClick={() => set(false)} disabled={pending}>
          Undo
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-bg-subtle/60 px-4 py-3">
      <p className="max-w-md text-sm text-fg-muted">
        Read through the stages below. Rename, reorder or change their rules until they describe
        your club&apos;s real process — then confirm.
      </p>
      <Button onClick={() => set(true)} disabled={pending} className="max-md:h-10">
        <CheckCircle2Icon />
        These stages match our process
      </Button>
    </div>
  );
}
