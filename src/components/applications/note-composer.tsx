"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addApplicationNote } from "@/lib/actions/applications";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteComposer({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    const res = await addApplicationNote({ applicationId, body: body.trim() });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        placeholder="Add a note — founder call, diligence finding, next step…"
        rows={2}
        aria-label="New note"
        className="max-md:text-base"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      {body.trim() && (
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={busy} className="max-md:h-10">
            {busy ? "Saving…" : "Add note"}
          </Button>
        </div>
      )}
    </div>
  );
}
