"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PinIcon, PinOffIcon } from "lucide-react";
import { toast } from "sonner";
import { togglePinDoc } from "@/lib/actions/docs";
import { Button } from "@/components/ui/button";

export function PinButton({ docId, pinned }: { docId: string; pinned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    const res = await togglePinDoc({ docId, pinned: !pinned });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <Button size="sm" variant="secondary" disabled={busy} onClick={toggle}>
      {pinned ? <PinOffIcon /> : <PinIcon />}
      {pinned ? "Unpin" : "Pin"}
    </Button>
  );
}
