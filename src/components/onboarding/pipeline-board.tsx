"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheckIcon,
  BellIcon,
  CheckIcon,
  CircleIcon,
  MailIcon,
  RotateCcwIcon,
  UserPlusIcon,
} from "lucide-react";
import { toast } from "sonner";
import { resendInvite, toggleOnboardingTask } from "@/lib/actions/members";
import {
  nudgeOnboarding,
  setOnboardingDueDate,
  verifyOnboardingItem,
  waiveOnboardingItem,
} from "@/lib/actions/onboarding";
import type { MemberRole, OnboardingTaskKind } from "@/db/schema";
import { STAGES, STAGE_HINT, STAGE_LABEL, type Stage } from "@/lib/onboarding/progress";
import { KIND_META } from "@/lib/onboarding/resource";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn, initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EnrollDialog, type EnrollTrack } from "./enroll-dialog";

export type BoardItem = {
  id: string;
  assignmentId: string;
  title: string;
  kind: OnboardingTaskKind;
  required: boolean;
  /** "Nov 3, 4:12 PM" in the club's timezone, or null while open. */
  doneOn: string | null;
  verified: boolean;
  waived: boolean;
};

export type BoardEntry = {
  memberId: string;
  name: string;
  email: string;
  role: MemberRole;
  cohort: string | null;
  stage: Stage;
  enrolled: boolean;
  trackIds: string[];
  trackNames: string[];
  requiredDone: number;
  requiredTotal: number;
  nextTitle: string | null;
  overdue: boolean;
  daysUntilDue: number | null;
  /**
   * Dates arrive formatted, in the club's timezone: formatting them here
   * would differ between the server render and the browser.
   */
  dueOn: string | null;
  /** YYYY-MM-DD for the date input. */
  dueInput: string;
  invitedOn: string;
  invitedAgo: string;
  invitedBy: string | null;
  lastNudgeAgo: string | null;
  completedOn: string | null;
  /** Sort key only. */
  completedAt: string | null;
  items: BoardItem[];
};

type Result = { ok: true } | { ok: false; error: string };
const ALL = "all";
const COMPLETE_PREVIEW = 6;

function dueLabel(e: BoardEntry): { text: string; tone: "danger" | "warning" | "muted" } | null {
  if (e.stage === "complete" || e.daysUntilDue == null) return null;
  if (e.overdue) {
    const days = Math.max(1, -e.daysUntilDue);
    return { text: `${days} day${days === 1 ? "" : "s"} overdue`, tone: "danger" };
  }
  if (e.daysUntilDue <= 3) {
    return { text: e.daysUntilDue <= 1 ? "Due tomorrow" : `Due in ${e.daysUntilDue} days`, tone: "warning" };
  }
  return { text: `Due ${e.dueOn}`, tone: "muted" };
}

/** What a card says under the name: the one fact that explains where this person is. */
function statusLine(e: BoardEntry): string {
  switch (e.stage) {
    case "invited":
      return `Invited ${e.invitedAgo}${e.invitedBy ? ` by ${e.invitedBy.split(" ")[0]}` : ""}`;
    case "setup":
      return "Signed in, hasn't confirmed their details";
    case "in_progress":
      return e.nextTitle ? `Stuck on: ${e.nextTitle}` : "Working through it";
    case "complete":
      return e.completedOn ? `Finished ${e.completedOn}` : "Finished";
  }
}

/**
 * The admin's view of onboarding: who is at which step. Four columns on a
 * wide screen, four stacked sections on a phone. A card opens that member's
 * checklist with the things an admin can do about it.
 */
export function PipelineBoard({
  entries,
  tracks,
  unenrolled,
  emailConfigured,
}: {
  entries: BoardEntry[];
  tracks: EnrollTrack[];
  unenrolled: { id: string; displayName: string }[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [cohort, setCohort] = React.useState(ALL);
  const [track, setTrack] = React.useState(ALL);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [showAllComplete, setShowAllComplete] = React.useState(false);
  const [enrolling, setEnrolling] = React.useState(false);

  const cohorts = [...new Set(entries.map((e) => e.cohort).filter((c): c is string => Boolean(c)))].sort();
  const shown = entries.filter(
    (e) => (cohort === ALL || e.cohort === cohort) && (track === ALL || e.trackIds.includes(track))
  );
  const open = entries.find((e) => e.memberId === openId) ?? null;
  const byStage = (stage: Stage) =>
    shown
      .filter((e) => e.stage === stage)
      .sort((a, b) =>
        stage === "complete"
          ? (b.completedAt ?? "").localeCompare(a.completedAt ?? "")
          : Number(b.overdue) - Number(a.overdue) ||
            (a.daysUntilDue ?? 9999) - (b.daysUntilDue ?? 9999) ||
            a.name.localeCompare(b.name)
      );
  const filtered = cohort !== ALL || track !== ALL;

  return (
    <div className="flex flex-col gap-4">
      {(cohorts.length > 1 || tracks.length > 1 || unenrolled.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {cohorts.length > 1 && (
            <Select value={cohort} onValueChange={setCohort}>
              <SelectTrigger className="w-auto min-w-36 max-md:h-10" aria-label="Filter by cohort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All cohorts</SelectItem>
                {cohorts.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {tracks.length > 1 && (
            <Select value={track} onValueChange={setTrack}>
              <SelectTrigger className="w-auto min-w-36 max-md:h-10" aria-label="Filter by track">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All tracks</SelectItem>
                {tracks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              className="max-md:h-10"
              onClick={() => {
                setCohort(ALL);
                setTrack(ALL);
              }}
            >
              Clear filters
            </Button>
          )}
          {tracks.length > 0 && unenrolled.length > 0 && (
            <Button variant="secondary" size="sm" className="ml-auto max-md:h-10" onClick={() => setEnrolling(true)}>
              <UserPlusIcon />
              Enroll existing members
              <span className="tnum text-fg-subtle">{unenrolled.length}</span>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-x-3 gap-y-6 lg:grid-cols-4">
        {STAGES.map((stage) => {
          const list = byStage(stage);
          const capped = stage === "complete" && !showAllComplete ? list.slice(0, COMPLETE_PREVIEW) : list;
          return (
            <section key={stage} aria-labelledby={`stage-${stage}`} className="flex min-w-0 flex-col gap-2">
              <header className="flex items-baseline gap-2 border-b border-border pb-2">
                <h2 id={`stage-${stage}`} className="text-sm font-semibold">
                  {STAGE_LABEL[stage]}
                </h2>
                <span className="tnum text-sm text-fg-subtle">{list.length}</span>
                <span className="ml-auto truncate text-xs text-fg-subtle lg:hidden xl:inline">{STAGE_HINT[stage]}</span>
              </header>
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-fg-subtle">
                  {filtered ? "Nobody matches the filters" : "Nobody here"}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {capped.map((e) => (
                    <li key={e.memberId}>
                      <MemberCard entry={e} onOpen={() => setOpenId(e.memberId)} />
                    </li>
                  ))}
                </ul>
              )}
              {stage === "complete" && list.length > COMPLETE_PREVIEW && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start max-md:h-10"
                  onClick={() => setShowAllComplete((v) => !v)}
                >
                  {showAllComplete ? "Show fewer" : `Show all ${list.length}`}
                </Button>
              )}
            </section>
          );
        })}
      </div>

      <p className="max-w-2xl text-xs text-fg-subtle">
        Ticks are self-attested: a member confirms they read, watched or agreed, and nobody proctors it. Open a
        card to verify what you have seen for yourself, waive an item, or send a reminder.
      </p>

      {open && (
        <MemberDrawer
          key={open.memberId}
          entry={open}
          emailConfigured={emailConfigured}
          onClose={() => setOpenId(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {enrolling && (
        <EnrollDialog
          tracks={tracks}
          initialTrackId={(track !== ALL ? track : tracks[0]?.id) ?? ""}
          members={unenrolled}
          onClose={() => setEnrolling(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function MemberCard({ entry: e, onOpen }: { entry: BoardEntry; onOpen: () => void }) {
  const due = dueLabel(e);
  const pct = e.requiredTotal > 0 ? (e.requiredDone / e.requiredTotal) * 100 : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-2 rounded-lg border bg-panel px-3 py-2.5 text-left shadow-xs outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent/40",
        e.overdue ? "border-danger-border" : "border-border"
      )}
    >
      <span className="flex items-center gap-2.5">
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px]">{initials(e.name)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{e.name}</span>
          <span className="block truncate text-xs text-fg-subtle">
            {[e.cohort, e.role !== "analyst" ? ROLE_LABEL[e.role] : null].filter(Boolean).join(" · ") || e.email}
          </span>
        </span>
        {due && due.tone !== "muted" && <Badge variant={due.tone}>{due.text}</Badge>}
      </span>
      {e.stage === "in_progress" && (
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-subtle">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </span>
          <span className="tnum shrink-0 text-xs text-fg-muted">
            {e.requiredDone} of {e.requiredTotal}
          </span>
        </span>
      )}
      <span className="flex items-baseline gap-2 text-xs text-fg-muted">
        <span className="min-w-0 flex-1 truncate">{statusLine(e)}</span>
        {due?.tone === "muted" && <span className="tnum shrink-0 text-fg-subtle">{due.text}</span>}
      </span>
    </button>
  );
}

function MemberDrawer({
  entry: e,
  emailConfigured,
  onClose,
  onChanged,
}: {
  entry: BoardEntry;
  emailConfigured: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const due = dueLabel(e);

  async function run(key: string, fn: () => Promise<Result>, success: string) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(success);
    onChanged();
  }

  const first = e.name.split(" ")[0];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        // Opening straight into the date field would pop the phone's date picker.
        onOpenAutoFocus={(ev) => ev.preventDefault()}
        className="content-start sm:top-2 sm:right-2 sm:bottom-2 sm:left-auto sm:h-[calc(100svh-1rem)] sm:max-h-none sm:max-w-md sm:translate-x-0 sm:translate-y-0"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 pr-8">
            <Avatar className="size-8">
              <AvatarFallback className="text-[11px]">{initials(e.name)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate">{e.name}</span>
              <span className="block truncate text-xs font-normal text-fg-muted">{e.email}</span>
            </span>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant={e.stage === "complete" ? "success" : "neutral"}>{STAGE_LABEL[e.stage]}</Badge>
              {due && <Badge variant={due.tone === "muted" ? "outline" : due.tone}>{due.text}</Badge>}
              <span className="text-xs text-fg-subtle">
                {[ROLE_LABEL[e.role], e.cohort, ...e.trackNames].filter(Boolean).join(" · ")}
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-fg-muted">Added</dt>
          <dd className="tnum">
            {e.invitedOn}
            {e.invitedBy && <span className="text-fg-muted"> by {e.invitedBy}</span>}
          </dd>
          <dt className="text-fg-muted">Status</dt>
          <dd>{statusLine(e)}</dd>
          {e.lastNudgeAgo && (
            <>
              <dt className="text-fg-muted">Last reminder</dt>
              <dd className="tnum">{e.lastNudgeAgo}</dd>
            </>
          )}
          {e.enrolled && e.stage !== "complete" && (
            <>
              <dt className="pt-1.5 text-fg-muted">
                <label htmlFor="drawer-due">Due date</label>
              </dt>
              <dd>
                <Input
                  id="drawer-due"
                  type="date"
                  defaultValue={e.dueInput}
                  disabled={busy === "due"}
                  className="tnum w-44 max-md:h-10"
                  // On blur, not on change: a typed date passes through several valid years.
                  onBlur={(ev) => {
                    const value = ev.target.value;
                    if (value === e.dueInput) return;
                    run("due", () => setOnboardingDueDate({ memberId: e.memberId, dueOn: value || null }), value ? "Due date changed" : "Due date cleared");
                  }}
                />
              </dd>
            </>
          )}
        </dl>

        <div className="flex flex-wrap gap-2">
          {e.stage === "invited" && (
            <Button
              variant="secondary"
              size="sm"
              className="max-md:h-10"
              disabled={busy !== null}
              onClick={() => run("resend", () => resendInvite({ memberId: e.memberId }), `Invite re-sent to ${e.email}`)}
            >
              <MailIcon />
              {busy === "resend" ? "Sending…" : "Resend invite"}
            </Button>
          )}
          {(e.stage === "setup" || e.stage === "in_progress") && (
            <Button
              variant="secondary"
              size="sm"
              className="max-md:h-10"
              disabled={busy !== null}
              onClick={() => run("nudge", () => nudgeOnboarding({ memberId: e.memberId }), `Reminder sent to ${first}`)}
            >
              <BellIcon />
              {busy === "nudge" ? "Sending…" : "Send a nudge"}
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="max-md:h-10">
            <Link href={`/members/${e.memberId}`}>Open profile</Link>
          </Button>
        </div>
        {!emailConfigured && e.stage !== "complete" && (
          <p className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
            Email isn&apos;t connected, so invites and reminders are only written to the server log. Message {first}{" "}
            directly, or connect email in Settings.
          </p>
        )}

        {e.items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-fg-muted">
            {e.enrolled
              ? "This track has no items yet."
              : `${first} isn't on a track, so the only step is confirming their details.`}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {e.items.map((item) => {
              const done = item.doneOn != null;
              const key = `${item.assignmentId}:${item.id}`;
              const ref = { assignmentId: item.assignmentId, taskId: item.id };
              return (
                <li key={key} className="flex items-start gap-2.5 px-3 py-2.5">
                  <span className={cn("mt-0.5 shrink-0", done ? "text-success" : "text-fg-subtle")}>
                    {done ? <CheckIcon className="size-4" strokeWidth={3} /> : <CircleIcon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{item.title}</span>
                    <span className="tnum block text-xs text-fg-subtle">
                      {KIND_META[item.kind].label}
                      {item.required ? "" : " · optional"}
                      {done && ` · ${item.waived ? "waived" : "done"} ${item.doneOn}`}
                      {item.verified && " · verified"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {done && !item.verified && !item.waived && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="max-md:h-10"
                        disabled={busy !== null}
                        onClick={() => run(key, () => verifyOnboardingItem(ref), "Marked verified")}
                      >
                        <BadgeCheckIcon />
                        Verify
                      </Button>
                    )}
                    {done ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="max-md:size-10"
                        disabled={busy !== null}
                        aria-label={`Reopen “${item.title}”`}
                        title="Reopen"
                        onClick={() => run(key, () => toggleOnboardingTask({ ...ref, done: false }), "Reopened")}
                      >
                        <RotateCcwIcon />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="max-md:h-10"
                        disabled={busy !== null}
                        onClick={() => run(key, () => waiveOnboardingItem(ref), `Waived for ${first}`)}
                      >
                        Waive
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-fg-subtle">
          Verify records that you saw it yourself. Waive excuses {first} from an item; it counts as done and is
          logged under your name.
        </p>
      </DialogContent>
    </Dialog>
  );
}
