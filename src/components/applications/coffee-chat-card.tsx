"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  recordCoffeeChatDebrief,
  recordCoffeeChatVerdict,
} from "@/lib/actions/applications";
import { COFFEE_CHAT_VERDICTS, type CoffeeChatVerdict } from "@/db/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Attendee = {
  memberId: string;
  memberName: string;
  verdict: CoffeeChatVerdict | null;
  note: string | null;
};

function verdictVariant(v: CoffeeChatVerdict | null) {
  return v === "advance" ? "success" : v === "decline" ? "danger" : "neutral";
}

export function CoffeeChatCard({
  chat,
  attendees,
  viewerMemberId,
}: {
  chat: {
    id: string;
    scheduledAt: Date | null;
    happenedAt: Date | null;
    location: string | null;
    debrief: string | null;
    verdict: CoffeeChatVerdict | null;
  };
  attendees: Attendee[];
  viewerMemberId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [editingDebrief, setEditingDebrief] = React.useState(false);
  const [debrief, setDebrief] = React.useState(chat.debrief ?? "");

  const mine = attendees.find((a) => a.memberId === viewerMemberId);

  async function setMyVerdict(verdict: CoffeeChatVerdict) {
    setBusy(true);
    const res = await recordCoffeeChatVerdict({ coffeeChatId: chat.id, verdict });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function saveDebrief() {
    setBusy(true);
    const res = await recordCoffeeChatDebrief({
      coffeeChatId: chat.id,
      debrief: debrief.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditingDebrief(false);
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span>
          {chat.happenedAt
            ? format(chat.happenedAt, "MMM d, yyyy")
            : chat.scheduledAt
              ? `Scheduled ${format(chat.scheduledAt, "MMM d, p")}`
              : "Unscheduled"}
          {chat.location ? ` · ${chat.location}` : ""}
        </span>
        {chat.verdict && <Badge variant={verdictVariant(chat.verdict)}>{chat.verdict}</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {attendees.map((a) => (
          <span
            key={a.memberId}
            title={a.note ?? undefined}
            className={cn(
              "flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs",
              a.verdict == null && "text-fg-muted"
            )}
          >
            {a.memberName}
            {a.verdict ? (
              <Badge variant={verdictVariant(a.verdict)}>{a.verdict}</Badge>
            ) : (
              <span className="text-2xs text-fg-subtle">no verdict</span>
            )}
          </span>
        ))}
      </div>

      {mine && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          <span className="text-fg-muted">My verdict:</span>
          {COFFEE_CHAT_VERDICTS.map((v) => (
            <button
              key={v}
              type="button"
              disabled={busy}
              onClick={() => setMyVerdict(v)}
              className={cn(
                "rounded-md border px-2 py-0.5 transition-colors",
                mine.verdict === v
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-border text-fg-muted hover:bg-bg-subtle"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {editingDebrief ? (
        <div className="mt-2 flex flex-col gap-2">
          <Textarea
            rows={3}
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            placeholder="How did it go? What did the team learn?"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditingDebrief(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveDebrief} disabled={busy}>
              {busy ? "Saving…" : "Save debrief"}
            </Button>
          </div>
        </div>
      ) : chat.debrief ? (
        <button
          type="button"
          className="mt-2 w-full text-left"
          onClick={() => setEditingDebrief(true)}
        >
          <p className="text-sm leading-relaxed">{chat.debrief}</p>
        </button>
      ) : (
        <button
          type="button"
          className="mt-2 text-xs text-accent hover:underline"
          onClick={() => setEditingDebrief(true)}
        >
          Add debrief…
        </button>
      )}
    </div>
  );
}
