"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { resetCalendarFeed } from "@/lib/actions/settings";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/patterns/form-confirm-dialog";
import { CopyField } from "@/components/patterns/form-copy-field";

/** The feed link, and a way to replace it when someone should stop seeing it. */
export function CalendarFeed({ url }: { url: string | null }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function reset() {
    setBusy(true);
    const res = await resetCalendarFeed({});
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    toast.success(url ? "New link ready. The old one no longer works." : "Calendar link created.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      {url ? (
        <CopyField value={url} label="Calendar feed" />
      ) : (
        <p className="text-sm text-fg-muted">No link yet. Create one, then share it with the club.</p>
      )}
      <p className="text-xs text-fg-muted">
        Anyone with this link can see the club&apos;s meeting times and titles, without signing in.
        Reset it when someone who had it leaves.
      </p>
      <div>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => (url ? setConfirmOpen(true) : void reset())}>
          <RefreshCwIcon />
          {url ? "Reset link" : "Create link"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset the calendar link?"
        description="The current link stops working straight away. Everyone subscribed will need the new link to keep seeing club meetings."
        confirmLabel="Reset link"
        tone="danger"
        onConfirm={reset}
      />
    </div>
  );
}
