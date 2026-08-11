"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, XIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { addAgendaItem, removeAgendaItem } from "@/lib/actions/meetings";
import type { AgendaItemKind, AgendaItemStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Item = {
  id: string;
  title: string;
  kind: AgendaItemKind;
  status: AgendaItemStatus;
  durationMinutes: number | null;
  presenterName: string | null;
  companyName: string | null;
  applicationId: string | null;
  voteRoundId: string | null;
  notes: string | null;
};

type Suggestions = {
  applications: { applicationId: string; companyName: string; stageName: string }[];
  voteRounds: { id: string; title: string; memoId: string | null }[];
  overdueActions: { id: string; title: string; assigneeName: string | null }[];
};

export function AgendaBuilder({
  meetingId,
  items,
  suggestions,
  editable,
}: {
  meetingId: string;
  items: Item[];
  suggestions: Suggestions;
  editable: boolean;
  members: { id: string; displayName: string }[];
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(input: {
    title: string;
    kind?: AgendaItemKind;
    applicationId?: string;
    voteRoundId?: string;
  }) {
    setBusy(true);
    const res = await addAgendaItem({ meetingId, kind: "other", ...input });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTitle("");
    router.refresh();
  }

  async function remove(agendaItemId: string) {
    const res = await removeAgendaItem({ agendaItemId });
    if (!res.ok) toast.error(res.error);
    else router.refresh();
  }

  const hasSuggestions =
    suggestions.applications.length > 0 ||
    suggestions.voteRounds.length > 0 ||
    suggestions.overdueActions.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {items.length === 0 && (
          <p className="py-1 text-xs text-fg-muted">No agenda yet — add items or use a suggestion.</p>
        )}
        {items.map((item, idx) => (
          <div
            key={item.id}
            className={cn(
              "group flex items-center gap-2.5 rounded-md border border-border px-3 py-2",
              item.status === "done" && "opacity-60"
            )}
          >
            <span className="tnum w-5 shrink-0 text-xs text-fg-subtle">{idx + 1}.</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className={cn("truncate text-sm", item.status === "done" && "line-through")}>
                  {item.applicationId ? (
                    <Link href={`/applications/${item.applicationId}`} className="hover:text-accent">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </span>
                {item.kind !== "other" && <Badge variant="neutral">{item.kind.replace("_", " ")}</Badge>}
                {item.status !== "pending" && (
                  <Badge
                    variant={
                      item.status === "done" ? "success" : item.status === "in_progress" ? "warning" : "neutral"
                    }
                  >
                    {item.status.replace("_", " ")}
                  </Badge>
                )}
              </div>
              {item.notes && <p className="mt-0.5 truncate text-xs text-fg-muted">{item.notes}</p>}
            </div>
            {item.durationMinutes && (
              <span className="tnum shrink-0 text-2xs text-fg-subtle">{item.durationMinutes}m</span>
            )}
            {editable && (
              <button
                onClick={() => remove(item.id)}
                className="shrink-0 cursor-pointer text-fg-subtle opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {editable && (
        <>
          <div className="flex gap-2">
            <Input
              placeholder="Add agenda item…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && title.trim() && add({ title: title.trim() })}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || !title.trim()}
              onClick={() => add({ title: title.trim() })}
            >
              <PlusIcon />
              Add
            </Button>
          </div>

          {hasSuggestions && (
            <div className="rounded-md border border-dashed border-border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                <SparklesIcon className="size-3" />
                Suggested
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.applications.map((s) => (
                  <button
                    key={s.applicationId}
                    disabled={busy}
                    onClick={() =>
                      add({
                        title: `${s.companyName} — ${s.stageName.toLowerCase()} review`,
                        kind: "application_review",
                        applicationId: s.applicationId,
                      })
                    }
                    className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                  >
                    {s.companyName} · {s.stageName}
                  </button>
                ))}
                {suggestions.voteRounds.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => add({ title: s.title, kind: "ic_vote", voteRoundId: s.id })}
                    className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-xs transition-colors hover:border-accent hover:text-accent"
                  >
                    🗳 {s.title}
                  </button>
                ))}
                {suggestions.overdueActions.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() =>
                      add({
                        title: `Overdue: ${s.title}${s.assigneeName ? ` (${s.assigneeName})` : ""}`,
                        kind: "admin",
                      })
                    }
                    className="cursor-pointer rounded-full border border-border bg-panel px-2.5 py-1 text-xs transition-colors hover:border-warning hover:text-warning"
                  >
                    ⏰ {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
