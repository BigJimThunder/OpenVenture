"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileTextIcon } from "lucide-react";
import { toast } from "sonner";
import { createMemo } from "@/lib/actions/memos";
import { Button } from "@/components/ui/button";

export function StartMemoButton({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function start() {
    setBusy(true);
    const res = await createMemo({ applicationId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    const { memoId, existed } = res.data as { memoId: string; existed: boolean };
    if (existed) toast.info("This application already has a memo — opening it.");
    router.push(`/memos/${memoId}`);
  }

  return (
    <Button variant="secondary" size="sm" onClick={start} disabled={busy}>
      <FileTextIcon />
      {busy ? "Creating…" : "Start memo"}
    </Button>
  );
}
