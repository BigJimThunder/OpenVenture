"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  recordCoffeeChatDebrief,
  recordCoffeeChatVerdict,
} from "@/lib/actions/applications";
import type { CoffeeChatVerdict } from "@/db/schema";
import { cn } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { VERDICT_LABELS, VerdictButtons } from "./verdict-buttons";

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
  };
  attendees: Attendee[];
  viewerMemberId: string;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");
  const [busy, setBusy] = React.useState(false);
  const [editingDebrief, setEditingDebrief] = React.useState(false);
  const [debrief, setDebrief] = React.useState(chat.debrief ?? "");
  const [changingVerdict, setChangingVerdict] = React.useState(false);

  const mine = attendees.find((a) => a.memberId === viewerMemberId);
  const verdictCount = attendees.filter((a) => a.verdict != null).length;

  async function setMyVerdict(verdict: CoffeeChatVerdict) {
    setBusy(true);
    const res = await recordCoffeeChatVerdict({ coffeeChatId: chat.id, verdict });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setChangingVerdict(false);
    router.refresh();
  }

  async function saveDebrief() {
    setBusy(true);
    const res = await recordCoffeeChatDebrief({ coffeeChatId: chat.id, debrief: debrief.trim() });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setEditingDebrief(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-border p-3.5">
      <div className="flex items-center justify-between gap-2 text-xs text-fg-muted">
        <span className="tnum">
          {chat.happenedAt
            ? format(chat.happenedAt, "EEE, MMM d, yyyy")
            : chat.scheduledAt
              ? `Scheduled for ${format(chat.scheduledAt, "EEE, MMM d · p")}`
              : "Not scheduled yet"}
          {chat.location ? ` · ${chat.location}` : ""}
        </span>
        <span className="tnum shrink-0 text-fg-subtle">
          {verdictCount}/{attendees.length} verdicts
        </span>
      </div>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {attendees.map((a) => (
          <li
            key={a.memberId}
            title={a.note ?? undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-xs",
              a.verdict == null && "pr-2.5 text-fg-muted"
            )}
          >
            {a.memberId === viewerMemberId ? "You" : a.memberName}
            {a.verdict ? (
              <Badge variant={verdictVariant(a.verdict)}>{VERDICT_LABELS[a.verdict]}</Badge>
            ) : (
              <span className="text-2xs text-fg-subtle">pending</span>
            )}
          </li>
        ))}
      </ul>

      {mine && canEdit && (mine.verdict == null || changingVerdict) && (
        <div className="mt-3 rounded-lg bg-bg-subtle p-3">
          <div className="mb-2 text-sm font-medium">
            {mine.verdict == null ? "Your verdict is needed" : "Change your verdict"}
          </div>
          <VerdictButtons value={mine.verdict} onChange={setMyVerdict} disabled={busy} />
        </div>
      )}
      {!mine && canEdit && (
        <div className="mt-3">
          {changingVerdict ? (
            <div className="rounded-lg bg-bg-subtle p-3">
              <div className="mb-2 text-sm font-medium">Your verdict</div>
              <VerdictButtons value={null} onChange={setMyVerdict} disabled={busy} />
            </div>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setChangingVerdict(true)} className="max-md:h-10">
              I was there too — add my verdict
            </Button>
          )}
        </div>
      )}
      {mine && canEdit && mine.verdict != null && !changingVerdict && (
        <button
          type="button"
          onClick={() => setChangingVerdict(true)}
          className="mt-2 cursor-pointer rounded text-xs text-fg-subtle underline-offset-2 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-2"
        >
          Change my verdict
        </button>
      )}

      {editingDebrief ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            rows={4}
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            placeholder="What did you learn? What surprised you? What's still unanswered?"
            aria-label="Debrief"
            autoFocus
            className="max-md:text-base"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditingDebrief(false)} className="max-md:h-10">
              Cancel
            </Button>
            <Button size="sm" onClick={saveDebrief} disabled={busy} className="max-md:h-10">
              {busy ? "Saving…" : "Save debrief"}
            </Button>
          </div>
        </div>
      ) : chat.debrief ? (
        <div className="mt-3">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{chat.debrief}</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditingDebrief(true)}
              className="mt-1 cursor-pointer rounded text-xs text-fg-subtle underline-offset-2 outline-none hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:py-2"
            >
              Edit debrief
            </button>
          )}
        </div>
      ) : canEdit ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3 max-md:h-10"
          onClick={() => setEditingDebrief(true)}
        >
          Add the debrief
        </Button>
      ) : null}
    </div>
  );
}
