"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  endMeeting,
  saveAgendaNotes,
  setAgendaItemStatus,
  startMeeting,
} from "@/lib/actions/meetings";
import type { AgendaItemKind, AgendaItemStatus, AttendanceStatus } from "@/db/schema";
import { cn } from "@/lib/utils";
import { isTypingTarget, overlayOpen } from "@/components/shell/app-shell";
import { Kbd } from "@/components/patterns/kbd";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionItems, type MeetingAction } from "./action-items";
import { AttendanceGrid } from "./attendance-grid";
import { AGENDA_KIND_LABEL, ATTENDED } from "./meeting-labels";

type Item = {
  id: string;
  title: string;
  kind: AgendaItemKind;
  status: AgendaItemStatus;
  durationMinutes: number | null;
  notes: string | null;
  presenterName: string | null;
  applicationId: string | null;
  voteRoundId: string | null;
  memoIdForVote: string | null;
  /** ISO strings — the server's record of when the item actually ran. */
  startedAt: string | null;
  endedAt: string | null;
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/**
 * Run mode: the meeting, one agenda item at a time. Built for the phone in the
 * chair's hand first — the current item and its timer fill the screen, Back /
 * Next sit under the thumb, and attendance and action items open as sheets so
 * nobody has to leave. On a projector the same screen gains a side rail.
 *
 * Takes over the whole viewport (the app's nav is hidden) so nothing on screen
 * competes with the item being discussed.
 */
export function RunMode({
  meeting,
  items,
  members,
  attendance,
  actions,
  viewerMemberId,
}: {
  meeting: { id: string; title: string; status: string; durationMinutes: number };
  items: Item[];
  members: { id: string; displayName: string }[];
  attendance: Record<string, AttendanceStatus>;
  actions: (MeetingAction & { agendaItemId: string | null })[];
  viewerMemberId: string;
}) {
  const router = useRouter();
  const [idx, setIdx] = React.useState(() => {
    const live = items.findIndex((i) => i.status === "in_progress");
    if (live >= 0) return live;
    const pending = items.findIndex((i) => i.status === "pending");
    return pending >= 0 ? pending : Math.max(0, items.length - 1);
  });
  const [notes, setNotes] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.notes ?? ""]))
  );
  const savedNotes = React.useRef<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, i.notes ?? ""]))
  );
  // Local start times cover the gap before the server's startedAt arrives.
  const [localStart, setLocalStart] = React.useState<Record<string, number>>({});
  const [mountedAt] = React.useState(() => Date.now());
  // Null until mounted: the server and the browser read the clock at different
  // moments, so a clock value in the first render is a hydration mismatch.
  // Timers show 0:00 for one frame, then the real elapsed time.
  const [now, setNow] = React.useState<number | null>(null);
  const [sheet, setSheet] = React.useState<"attendance" | "actions" | "wrap" | null>(null);
  const [sendRecap, setSendRecap] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const current: Item | undefined = items[idx];
  const isLast = idx >= items.length - 1;

  React.useEffect(() => {
    // The first reading lands on the next frame, then once a second.
    const first = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      cancelAnimationFrame(first);
      clearInterval(t);
    };
  }, []);

  // Opening run mode is what starts the meeting and the first item's clock.
  const bootstrapped = React.useRef(false);
  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    (async () => {
      if (meeting.status === "scheduled") {
        const res = await startMeeting({ meetingId: meeting.id });
        if (!res.ok) toast.error(res.error);
      }
      const first = items[idx];
      if (first && first.status === "pending") {
        await setAgendaItemStatus({ agendaItemId: first.id, status: "in_progress" });
      }
      router.refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const flushNotes = React.useCallback(
    async (item: Item | undefined) => {
      if (!item) return;
      const value = notes[item.id] ?? "";
      if (value === savedNotes.current[item.id]) return;
      savedNotes.current[item.id] = value;
      const res = await saveAgendaNotes({ agendaItemId: item.id, notes: value });
      if (!res.ok) toast.error(`Notes didn't save: ${res.error}`);
    },
    [notes]
  );

  const goTo = React.useCallback(
    async (target: number, finishCurrent: "done" | "deferred" | null) => {
      if (busy || target < 0 || target >= items.length) return;
      setBusy(true);
      await flushNotes(current);
      if (current && finishCurrent && current.status !== "done") {
        const res = await setAgendaItemStatus({ agendaItemId: current.id, status: finishCurrent });
        if (!res.ok) toast.error(res.error);
      }
      const next = items[target];
      if (target !== idx) {
        setIdx(target);
        if (next.status === "pending" || next.status === "deferred") {
          setLocalStart((prev) => (prev[next.id] ? prev : { ...prev, [next.id]: Date.now() }));
          const res = await setAgendaItemStatus({ agendaItemId: next.id, status: "in_progress" });
          if (!res.ok) toast.error(res.error);
        }
      }
      setBusy(false);
      router.refresh();
    },
    [busy, current, flushNotes, idx, items, router]
  );

  const next = React.useCallback(() => {
    if (isLast) setSheet("wrap");
    else goTo(idx + 1, "done");
  }, [goTo, idx, isLast]);
  const back = React.useCallback(() => goTo(idx - 1, null), [goTo, idx]);

  // ← / → step through the agenda; Space advances (what a presenter clicker sends).
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || overlayOpen()) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        // Space on a focused button should press that button, not also advance.
        if (e.key === " " && e.target instanceof HTMLElement && e.target.closest("button, a")) return;
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [next, back]);

  async function finish() {
    setBusy(true);
    await flushNotes(current);
    if (current && current.status !== "done") {
      await setAgendaItemStatus({ agendaItemId: current.id, status: "done" });
    }
    const res = await endMeeting({ meetingId: meeting.id, sendRecap });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(sendRecap ? "Meeting wrapped. The recap is on its way." : "Meeting wrapped.");
    router.push(`/meetings/${meeting.id}`);
    router.refresh();
  }

  // ——— clocks ———
  const starts = items
    .map((i) => (i.startedAt ? Date.parse(i.startedAt) : localStart[i.id]))
    .filter((t): t is number => typeof t === "number");
  const meetingStart = starts.length ? Math.min(...starts) : mountedAt;
  const meetingElapsed = (now ?? meetingStart) - meetingStart;
  const meetingOver = meetingElapsed > meeting.durationMinutes * 60_000;

  let itemElapsed = 0;
  let itemRunning = false;
  if (current) {
    const started = current.startedAt ? Date.parse(current.startedAt) : localStart[current.id];
    if (current.status === "done" && current.startedAt && current.endedAt) {
      itemElapsed = Date.parse(current.endedAt) - Date.parse(current.startedAt);
    } else if (started) {
      itemElapsed = (now ?? started) - started;
      itemRunning = true;
    }
  }
  const allotted = current?.durationMinutes ? current.durationMinutes * 60_000 : null;
  const itemOver = allotted != null && itemElapsed > allotted;
  const itemNearEnd = allotted != null && !itemOver && itemElapsed > allotted * 0.8;

  const marked = Object.keys(attendance).length;
  const attending = Object.values(attendance).filter((s) => ATTENDED.includes(s)).length;
  const openActions = actions.filter((a) => a.status === "open").length;
  const doneCount = items.filter((i) => i.status === "done").length;

  const actionsPanel = (
    <ActionItems
      meetingId={meeting.id}
      agendaItemId={current?.id}
      applicationId={current?.applicationId ?? undefined}
      actions={actions}
      members={members}
      editable
      stacked
      viewerMemberId={viewerMemberId}
      emptyHint="Nothing yet. When someone says “I'll do that”, write it here with their name."
    />
  );

  return (
    <div className="fixed inset-0 z-45 flex flex-col bg-bg">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:h-14 md:px-4">
        <Button variant="ghost" size="icon" className="size-10 shrink-0" asChild>
          <Link href={`/meetings/${meeting.id}`} aria-label="Leave run mode">
            <XIcon />
          </Link>
        </Button>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold md:text-base">{meeting.title}</span>
        <span
          className={cn("tnum shrink-0 font-mono text-xs md:text-sm", meetingOver ? "text-danger" : "text-fg-muted")}
          aria-label="Meeting time elapsed"
        >
          {clock(meetingElapsed)}
          <span className="text-fg-subtle"> / {meeting.durationMinutes}m</span>
        </span>
        <Button
          variant="secondary"
          className="ml-1 hidden md:inline-flex"
          onClick={() => setSheet("attendance")}
        >
          <UsersIcon />
          <span className="tnum">
            {marked === 0 ? "Attendance" : `${attending} here`}
          </span>
        </Button>
        <Button variant="secondary" className="max-md:h-9" onClick={() => setSheet("wrap")}>
          End
        </Button>
      </header>

      {/* Agenda progress: one segment per item; tap to jump. */}
      {items.length > 1 && (
        <nav aria-label="Agenda" className="flex shrink-0 gap-1 px-3 pt-2 md:px-6 md:pt-3">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              onClick={() => goTo(i, null)}
              aria-label={`Item ${i + 1}: ${it.title}`}
              aria-current={i === idx ? "step" : undefined}
              className="group flex h-6 flex-1 cursor-pointer items-center outline-none"
            >
              <span
                className={cn(
                  "h-1.5 w-full rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-accent/40",
                  i === idx
                    ? "bg-accent"
                    : it.status === "done"
                      ? "bg-success"
                      : it.status === "deferred"
                        ? "bg-warning"
                        : "bg-border-strong/60 group-hover:bg-border-strong"
                )}
              />
            </button>
          ))}
        </nav>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Current item */}
        {/* Not a second <main>: run mode already renders inside the shell's. */}
        <section
          aria-label="Current agenda item"
          className="flex min-w-0 flex-1 flex-col overflow-y-auto px-4 pb-4 md:px-10 md:pb-8"
        >
          {current ? (
            <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
              <div className="flex flex-1 flex-col justify-center py-5 md:py-8">
                <div className="tnum text-xs font-medium text-fg-muted md:text-sm">
                  Item {idx + 1} of {items.length} · {AGENDA_KIND_LABEL[current.kind]}
                  {current.presenterName && ` · ${current.presenterName}`}
                </div>
                <h1 className="mt-2 text-xl leading-tight font-semibold tracking-tight text-balance md:text-[2.5rem]">
                  {current.title}
                </h1>

                <div className="mt-5 flex items-baseline gap-3 md:mt-8">
                  <span
                    className={cn(
                      "tnum font-mono text-[3.5rem] leading-none font-medium tracking-tight md:text-[5.5rem]",
                      itemOver ? "text-danger" : itemNearEnd ? "text-warning" : "text-fg",
                      !itemRunning && "text-fg-muted"
                    )}
                    role="timer"
                    aria-label="Time on this item"
                  >
                    {clock(itemElapsed)}
                  </span>
                  <span className="tnum text-sm text-fg-muted md:text-base">
                    {allotted != null
                      ? itemOver
                        ? `${clock(itemElapsed - allotted)} over ${current.durationMinutes} min`
                        : `of ${current.durationMinutes} min`
                      : current.status === "done"
                        ? "taken"
                        : "no time set"}
                  </span>
                </div>
                {allotted != null && (
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-1000 ease-linear",
                        itemOver ? "bg-danger" : itemNearEnd ? "bg-warning" : "bg-accent"
                      )}
                      style={{ width: `${Math.min(100, (itemElapsed / allotted) * 100)}%` }}
                    />
                  </div>
                )}

                {(current.applicationId || current.voteRoundId) && (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {current.applicationId && (
                      <Button variant="secondary" className="max-md:h-10" asChild>
                        <Link href={`/pipeline/${current.applicationId}`} target="_blank">
                          Open the application
                          <ExternalLinkIcon />
                        </Link>
                      </Button>
                    )}
                    {current.voteRoundId &&
                      (current.memoIdForVote ? (
                        <Button variant="secondary" className="max-md:h-10" asChild>
                          <Link href={`/memos/${current.memoIdForVote}/vote`} target="_blank">
                            Open the ballot
                            <ExternalLinkIcon />
                          </Link>
                        </Button>
                      ) : (
                        <span className="self-center text-sm text-fg-muted">
                          A blind vote is linked — members open it from their inbox.
                        </span>
                      ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="run-notes" className="text-xs font-medium text-fg-muted">
                  Notes for this item
                </label>
                <Textarea
                  id="run-notes"
                  rows={4}
                  className="text-base md:text-md"
                  placeholder="What was said or decided. Saved as you go; included in the recap."
                  value={notes[current.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [current.id]: e.target.value }))}
                  onBlur={() => flushNotes(current)}
                />
              </div>
            </div>
          ) : (
            <div className="m-auto max-w-sm text-center">
              <p className="text-md font-semibold">This meeting has no agenda</p>
              <p className="mt-1 text-sm text-fg-muted">
                You can still take attendance and capture action items here. To walk through topics
                one at a time, add them on the meeting page first.
              </p>
              <Button variant="secondary" className="mt-4 max-md:h-10" asChild>
                <Link href={`/meetings/${meeting.id}`}>Add an agenda</Link>
              </Button>
            </div>
          )}
        </section>

        {/* Projector / laptop rail */}
        <aside className="hidden w-[22rem] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border bg-bg-subtle/40 p-5 lg:flex">
          {items.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-medium text-fg-muted">
                Agenda <span className="tnum text-fg-subtle">· {doneCount} of {items.length} done</span>
              </h2>
              <ol className="flex flex-col">
                {items.map((it, i) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => goTo(i, null)}
                      className={cn(
                        "flex w-full cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40",
                        i === idx && "bg-panel font-medium shadow-xs"
                      )}
                    >
                      <span className="tnum w-4 shrink-0 text-xs text-fg-subtle">{i + 1}</span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          it.status === "done" && i !== idx && "text-fg-subtle line-through"
                        )}
                      >
                        {it.title}
                      </span>
                      {it.durationMinutes && (
                        <span className="tnum shrink-0 text-xs text-fg-subtle">{it.durationMinutes}m</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section>
            <h2 className="mb-2 text-xs font-medium text-fg-muted">Action items</h2>
            {actionsPanel}
          </section>
        </aside>
      </div>

      {/* Controls: thumb row on phones, a quieter bar with key hints on desktop. */}
      <footer className="pb-safe shrink-0 border-t border-border bg-panel">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 md:px-6 lg:max-w-none">
          <Button
            variant="secondary"
            className="h-14 w-14 shrink-0 rounded-xl md:h-10 md:w-auto md:rounded-md md:px-3"
            onClick={back}
            disabled={idx === 0 || busy || items.length === 0}
            aria-label="Previous item"
          >
            <ArrowLeftIcon className="max-md:size-5" />
            <span className="hidden md:inline">Back</span>
            <Kbd className="ml-1 hidden md:inline">←</Kbd>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-1 flex-col gap-0.5 rounded-xl text-xs lg:hidden md:h-10 md:flex-none md:flex-row md:gap-1.5 md:rounded-md md:text-sm"
            onClick={() => setSheet("attendance")}
          >
            <UsersIcon className="max-md:size-5" />
            <span className="tnum">{marked === 0 ? "Attendance" : `${attending} here`}</span>
          </Button>
          <Button
            variant="secondary"
            className="h-14 flex-1 flex-col gap-0.5 rounded-xl text-xs lg:hidden md:h-10 md:flex-none md:flex-row md:gap-1.5 md:rounded-md md:text-sm"
            onClick={() => setSheet("actions")}
          >
            <ListChecksIcon className="max-md:size-5" />
            <span className="tnum">{openActions === 0 ? "Action item" : `${openActions} action${openActions === 1 ? "" : "s"}`}</span>
          </Button>
          {current && current.status !== "done" && !isLast && (
            <Button
              variant="ghost"
              className="ml-auto hidden md:inline-flex"
              onClick={() => goTo(idx + 1, "deferred")}
              disabled={busy}
            >
              Defer to next time
            </Button>
          )}
          <Button
            className={cn(
              "h-14 flex-[1.4] rounded-xl text-base md:h-10 md:flex-none md:rounded-md md:px-4 md:text-sm",
              !(current && current.status !== "done" && !isLast) && "md:ml-auto"
            )}
            onClick={next}
            disabled={busy}
          >
            {isLast ? (
              <>
                <CheckIcon className="max-md:size-5" />
                Wrap up
              </>
            ) : (
              <>
                Next
                <ArrowRightIcon className="max-md:size-5" />
              </>
            )}
            <Kbd tone="on-accent" className="ml-1 hidden md:inline">
              →
            </Kbd>
          </Button>
        </div>
      </footer>

      <Dialog open={sheet === "attendance"} onOpenChange={(o) => setSheet(o ? "attendance" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Attendance</DialogTitle>
          </DialogHeader>
          <AttendanceGrid meetingId={meeting.id} members={members} attendance={attendance} editable />
          <DialogFooter className="sm:hidden">
            <Button className="h-12" onClick={() => setSheet(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === "actions"} onOpenChange={(o) => setSheet(o ? "actions" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Action items</DialogTitle>
            {current && <DialogDescription>New ones are filed under “{current.title}”.</DialogDescription>}
          </DialogHeader>
          {actionsPanel}
        </DialogContent>
      </Dialog>

      <Dialog open={sheet === "wrap"} onOpenChange={(o) => !busy && setSheet(o ? "wrap" : null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>End the meeting?</DialogTitle>
            <DialogDescription>It is marked completed and leaves run mode.</DialogDescription>
          </DialogHeader>
          <dl className="tnum grid grid-cols-3 gap-2 rounded-lg border border-border bg-bg-subtle/60 p-3 text-center">
            <div>
              <dd className="text-lg font-semibold">
                {doneCount + (current && current.status !== "done" ? 1 : 0)}/{items.length}
              </dd>
              <dt className="text-xs text-fg-muted">items covered</dt>
            </div>
            <div>
              <dd className={cn("text-lg font-semibold", marked === 0 && "text-warning")}>
                {marked}/{members.length}
              </dd>
              <dt className="text-xs text-fg-muted">attendance marked</dt>
            </div>
            <div>
              <dd className="text-lg font-semibold">{openActions}</dd>
              <dt className="text-xs text-fg-muted">open actions</dt>
            </div>
          </dl>
          {marked < members.length && (
            <button
              type="button"
              className="cursor-pointer text-left text-sm text-accent underline-offset-2 hover:underline"
              onClick={() => setSheet("attendance")}
            >
              {marked === 0 ? "Attendance hasn't been taken — do it now" : `${members.length - marked} members aren't marked — finish attendance`}
            </button>
          )}
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox checked={sendRecap} onCheckedChange={(c) => setSendRecap(c === true)} className="mt-0.5" />
            <span>
              Email the recap to every active member
              <span className="block text-xs text-fg-muted">
                Agenda, notes, who attended and the open action items.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button variant="secondary" className="max-sm:h-12" onClick={() => setSheet(null)} disabled={busy}>
              Keep going
            </Button>
            <Button className="max-sm:h-12" onClick={finish} disabled={busy}>
              {busy ? "Wrapping up…" : "End meeting"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
