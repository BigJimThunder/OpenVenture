"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, CoffeeIcon } from "lucide-react";
import { toast } from "sonner";
import { createCoffeeChat, logCoffeeChat } from "@/lib/actions/applications";
import type { CoffeeChatVerdict } from "@/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { VerdictButtons } from "./verdict-buttons";
import { Field } from "@/components/patterns/field";
import { CoffeeChatScheduler } from "@/components/scheduling/coffee-chat-scheduler";

type Mode = "log" | "schedule";

/**
 * Coffee chats, built for the walk back from the café. "Log one" is the
 * default: who was there, your verdict, a debrief — one screen, one save.
 * "Schedule" is for the chat that hasn't happened yet: it offers times the
 * members' class schedules already allow, and can pick the members too.
 */
export function CoffeeChatDialog({
  applicationId,
  members,
  viewerMemberId,
  minAttendees,
  variant = "secondary",
  label = "Log a coffee chat",
}: {
  applicationId: string;
  members: { id: string; displayName: string }[];
  viewerMemberId: string;
  /** The stage's rule, shown as a hint. */
  minAttendees?: number | null;
  variant?: "default" | "secondary";
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("log");
  const [busy, setBusy] = React.useState(false);
  const [attendees, setAttendees] = React.useState<Set<string>>(() => new Set([viewerMemberId]));
  const [verdict, setVerdict] = React.useState<CoffeeChatVerdict | null>(null);
  const [debrief, setDebrief] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState<Date | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setAttendees(new Set([viewerMemberId]));
    setScheduledAt(null);
  }

  function reset() {
    setMode("log");
    setScheduledAt(null);
    setAttendees(new Set([viewerMemberId]));
    setVerdict(null);
    setDebrief("");
  }

  function toggle(id: string) {
    // Whoever logs or schedules it is always in.
    if (id === viewerMemberId) return;
    setAttendees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const location = String(fd.get("location") ?? "").trim() || undefined;
    const when = String(fd.get("when") ?? "");
    setBusy(true);
    const res =
      mode === "log"
        ? await logCoffeeChat({
            applicationId,
            attendeeMemberIds: [...attendees],
            happenedAt: when ? new Date(`${when}T12:00:00`) : undefined,
            location,
            debrief: debrief.trim() || undefined,
            verdict: verdict ?? undefined,
          })
        : await createCoffeeChat({
            applicationId,
            scheduledAt: scheduledAt ?? undefined,
            location,
            attendeeMemberIds: [...attendees],
          });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setOpen(false);
    reset();
    toast.success(mode === "log" ? "Coffee chat logged" : "Coffee chat scheduled");
    router.refresh();
  }

  const others = members.filter((m) => m.id !== viewerMemberId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="max-md:h-10">
          <CoffeeIcon />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={mode === "schedule" ? "sm:max-w-lg" : "sm:max-w-md"}>
        <DialogHeader>
          <DialogTitle>Coffee chat</DialogTitle>
          <DialogDescription>
            {minAttendees
              ? `${minAttendees} members each record a verdict before the application can advance.`
              : "Each member who was there records their own verdict."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg-subtle p-1" role="tablist">
          {(
            [
              ["log", "It happened"],
              ["schedule", "Schedule one"],
            ] as const
          ).map(([m, text]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => m !== mode && switchMode(m)}
              className={cn(
                "h-10 cursor-pointer rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8",
                mode === m ? "bg-panel text-fg shadow-xs" : "text-fg-muted hover:text-fg"
              )}
            >
              {text}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "schedule" && (
            <CoffeeChatScheduler
              applicationId={applicationId}
              members={members}
              need={Math.max(2, minAttendees ?? 2)}
              attendees={attendees}
              onAttendeesChange={(ids) => setAttendees(new Set(ids))}
              scheduledAt={scheduledAt}
              onScheduledAtChange={setScheduledAt}
            />
          )}
          {mode === "log" && (
            <div className="flex flex-col gap-1.5">
              <Label>Who was there</Label>
              <div className="flex flex-wrap gap-1.5">
                <span className="inline-flex h-10 items-center gap-1.5 rounded-full border border-accent/50 bg-accent-subtle px-3.5 text-sm font-medium text-accent sm:h-8 sm:px-3 sm:text-xs">
                  <CheckIcon className="size-3.5" />
                  You
                </span>
                {others.map((m) => {
                  const on = attendees.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(m.id)}
                      className={cn(
                        "inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:h-8 sm:px-3 sm:text-xs",
                        on
                          ? "border-accent/50 bg-accent-subtle font-medium text-accent"
                          : "border-border bg-panel text-fg-muted hover:border-border-strong hover:text-fg"
                      )}
                    >
                      {on && <CheckIcon className="size-3.5" />}
                      {m.displayName}
                    </button>
                  );
                })}
              </div>
              {minAttendees != null && attendees.size < minAttendees && (
                <p className="text-xs text-fg-subtle">
                  Add who else was there — {minAttendees} verdicts are needed, and each member records their own.
                </p>
              )}
            </div>
          )}

          {mode === "log" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Your verdict</Label>
                <VerdictButtons value={verdict} onChange={setVerdict} />
              </div>
              <Field label="Debrief">
                <Textarea
                  id="chat-debrief"
                  rows={4}
                  value={debrief}
                  onChange={(e) => setDebrief(e.target.value)}
                  placeholder="What did you learn? What surprised you? What's still unanswered?"
                  maxLength={5000}
                  className="max-md:text-base"
                />
              </Field>
            </>
          )}

          <div className={cn("grid gap-3", mode === "log" && "grid-cols-2")}>
            {mode === "log" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chat-when">Date (today if blank)</Label>
                <Input id="chat-when" name="when" type="date" className="tnum max-md:h-11 max-md:text-base" />
              </div>
            )}
            <Field label="Where">
              <Input
                id="chat-location"
                name="location"
                placeholder="Campus café"
                maxLength={200}
                className="max-md:h-11 max-md:text-base"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={busy || (mode === "schedule" && (attendees.size === 0 || !scheduledAt))}
              className="max-md:h-12 max-md:text-base"
            >
              {busy ? "Saving…" : mode === "log" ? "Save coffee chat" : "Schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
