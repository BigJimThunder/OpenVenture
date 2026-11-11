"use client";

import * as React from "react";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { checkTimeAction, findGroupTimesAction, findTeamTimesAction } from "@/lib/actions/availability";
import { can } from "@/lib/permissions";
import { COFFEE_CHAT_MINUTES } from "@/lib/scheduling/engine";
import { firstName, founderMessage, localMoment, nameList } from "@/lib/scheduling/format";
import { formatMinute } from "@/lib/scheduling/time";
import { toLocalInputValue } from "@/components/meetings/meeting-labels";
import { useViewer } from "@/components/shell/viewer";
import { FieldToggle } from "@/components/patterns/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  groupSlotItems,
  MemberChips,
  PeopleAtTime,
  SlotsByDay,
  UnknownNotice,
  useFinderQuery,
  useNameOf,
  type SlotItem,
} from "./finder-parts";
import { Segmented } from "./segmented";

const LOOK_AHEAD_DAYS = 14;

/**
 * Scheduling a coffee chat without the group chat. Either let the app pick
 * who goes (it shares the chats around and starts with the application's
 * owner) or choose the members yourself; either way the times offered are
 * ones the members' class schedules already allow. A hand-typed time is
 * still possible and is checked for conflicts as you type it.
 *
 * The founder's calendar is the one thing we cannot see, hence "Copy times
 * to send the founder".
 */
export function CoffeeChatScheduler({
  applicationId,
  members,
  need,
  attendees,
  onAttendeesChange,
  scheduledAt,
  onScheduledAtChange,
}: {
  applicationId: string;
  members: { id: string; displayName: string }[];
  /** How many members the stage wants at the chat. */
  need: number;
  attendees: ReadonlySet<string>;
  onAttendeesChange: (ids: string[]) => void;
  scheduledAt: Date | null;
  onScheduledAtChange: (at: Date | null) => void;
}) {
  const viewer = useViewer();
  const [who, setWho] = React.useState<"auto" | "choose">("auto");
  const [includeMe, setIncludeMe] = React.useState(true);
  const [includeUnknown, setIncludeUnknown] = React.useState(false);
  const [manual, setManual] = React.useState(false);

  const required = who === "auto" ? (includeMe ? [viewer.memberId] : []) : [...attendees].sort();
  // From tomorrow: a founder needs more notice than "in an hour".
  const base = { durationMinutes: COFFEE_CHAT_MINUTES, days: LOOK_AHEAD_DAYS, includeUnknown, skipToday: true };
  const team = useFinderQuery(who === "auto" ? JSON.stringify(["t", required, need, includeUnknown]) : null, () =>
    findTeamTimesAction({ ...base, required, n: Math.max(need, required.length), applicationId })
  );
  const group = useFinderQuery(
    who === "choose" && required.length > 0 ? JSON.stringify(["g", required, includeUnknown]) : null,
    () => findGroupTimesAction({ ...base, memberIds: required })
  );
  // A typed time is checked against the people involved; in "pick for me" it also proposes who.
  const typed = manual && scheduledAt ? scheduledAt.getTime() : null;
  const check = useFinderQuery(typed != null ? JSON.stringify(["a", typed, who, required, need, includeUnknown]) : null, () =>
    checkTimeAction({
      start: new Date(typed!),
      durationMinutes: COFFEE_CHAT_MINUTES,
      includeUnknown,
      required,
      n: who === "auto" ? Math.max(need, required.length) : undefined,
      applicationId,
    })
  );

  const data = who === "auto" ? team.data : group.data;
  const loading = who === "auto" ? team.loading : group.loading;
  const error = who === "auto" ? team.error : group.error;
  const nameOf = useNameOf(
    React.useMemo(
      () => data?.members ?? members.map((m) => ({ id: m.id, name: m.displayName, role: "analyst" as const })),
      [data, members]
    )
  );
  const short = (id: string) => (id === viewer.memberId ? "you" : firstName(nameOf(id)));

  const teamOptions = who === "auto" ? (team.data?.options ?? []) : [];
  const items: SlotItem[] =
    who === "auto"
      ? teamOptions.map((o) => ({
          key: `${o.day}|${o.startMinute}`,
          day: o.day,
          start: o.start,
          time: formatMinute(o.startMinute),
          detail: nameList(o.combination.picks.map((p) => short(p.memberId)), 4),
          tone: "full" as const,
        }))
      : group.data
        ? groupSlotItems(group.data.byDay, nameOf)
        : [];
  const best = who === "auto" ? teamOptions[0] : group.data?.best[0];
  const offered = who === "auto" ? teamOptions : (group.data?.best ?? []);
  const picked = who === "auto" ? teamOptions.find((o) => o.start === scheduledAt?.getTime()) : undefined;

  function pick(item: SlotItem) {
    setManual(false);
    onScheduledAtChange(new Date(item.start));
    const option = teamOptions.find((o) => o.start === item.start);
    if (option) onAttendeesChange(option.combination.picks.map((p) => p.memberId));
  }

  function switchWho(next: "auto" | "choose") {
    setWho(next);
    setManual(false);
    onScheduledAtChange(null);
    onAttendeesChange([viewer.memberId]);
  }

  async function copyForFounder() {
    if (!data || offered.length === 0) return;
    const text = founderMessage({
      options: offered,
      timeZone: data.timeZone,
      orgName: data.orgName,
      companyName: team.data?.companyName,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${Math.min(3, offered.length)} times copied, in ${data.zone}`);
    } catch {
      toast.error("Couldn't copy. Pick a time and write to the founder by hand.");
    }
  }

  const when = scheduledAt && data ? localMoment(scheduledAt.getTime(), data.timeZone) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>Who goes</Label>
        <Segmented
          label="Who goes"
          value={who}
          onChange={switchWho}
          options={[
            { value: "auto", label: `Pick ${need} for me` },
            { value: "choose", label: "I'll choose" },
          ]}
        />
        {who === "auto" ? (
          <FieldToggle
            className="pt-1"
            label="Include me"
            hint="The other seats go to whoever has had the fewest chats lately, starting with the application's owner."
          >
            <Checkbox
              checked={includeMe}
              onCheckedChange={(v) => {
                setIncludeMe(v === true);
                onScheduledAtChange(null);
              }}
            />
          </FieldToggle>
        ) : (
          <MemberChips
            members={members.map((m) => ({ id: m.id, name: m.displayName }))}
            selected={attendees}
            viewerId={viewer.memberId}
            unknown={new Set(group.data?.unknown ?? [])}
            onToggle={(id) => {
              const next = new Set(attendees);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              onAttendeesChange([...next]);
            }}
          />
        )}
        {who === "choose" && attendees.size < need && (
          <p className="text-xs text-fg-subtle">
            {need} verdicts are needed and each member records their own, so add {need - attendees.size} more.
          </p>
        )}
      </div>

      {data && (
        <UnknownNotice
          unknown={data.unknown}
          nameOf={nameOf}
          includeUnknown={includeUnknown}
          onIncludeChange={setIncludeUnknown}
          hasTerms={data.hasTerms}
          canManageClub={can(viewer.role, "manageClub")}
        />
      )}

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label>When</Label>
          {data && <span className="text-xs text-fg-muted">Next two weeks · {data.zone}</span>}
        </div>
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {!data && loading && <div className="h-24 animate-pulse rounded-lg bg-bg-subtle" aria-busy />}
        {who === "choose" && required.length === 0 && <p className="text-sm text-fg-muted">Choose who goes to see times.</p>}
        {data && !loading && items.length === 0 && (who === "auto" || required.length > 0) && (
          <p className="rounded-lg border border-dashed border-border-strong/70 px-3 py-4 text-center text-sm text-fg-muted">
            {who === "auto"
              ? `No ${COFFEE_CHAT_MINUTES}-minute slot in the next two weeks has ${need} members free. Choose people yourself, or set a time below.`
              : "No slot in the next two weeks works for these members. Try a different pair, or set a time below."}
          </p>
        )}
        {items.length > 0 && (
          <div className={loading ? "opacity-60" : undefined} aria-busy={loading}>
            <SlotsByDay
              items={items}
              selected={manual ? null : (scheduledAt?.getTime() ?? null)}
              bestKey={best ? `${best.day}|${best.startMinute}` : undefined}
              initialDays={5}
              onPick={pick}
            />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            aria-expanded={manual}
            onClick={() => setManual((v) => !v)}
            className="min-h-8 cursor-pointer text-xs font-medium text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 max-md:min-h-10"
          >
            {manual ? "Back to suggested times" : "Set a time myself"}
          </button>
          {offered.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="-ml-2 max-md:h-10" onClick={copyForFounder}>
              <CopyIcon />
              Copy times to send the founder
            </Button>
          )}
        </div>
        {manual && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-bg-subtle/50 p-3">
            <Input
              type="datetime-local"
              aria-label="Date and time"
              className="tnum max-md:text-base"
              value={scheduledAt ? toLocalInputValue(scheduledAt) : ""}
              onChange={(e) => onScheduledAtChange(e.target.value ? new Date(e.target.value) : null)}
            />
            {typed != null && check.data && check.data.start === new Date(typed).toISOString() && (
              <>
                {who === "choose" ? (
                  check.data.people.every((p) => p.state === "free" && !p.soft) ? (
                    <p className="text-xs text-success">Everyone you chose is free then.</p>
                  ) : (
                    <PeopleAtTime people={check.data.people} nameOf={nameOf} viewerId={viewer.memberId} only="problems" />
                  )
                ) : check.data.combinations.length === 0 ? (
                  <>
                    <p className="text-xs text-warning">Fewer than {need} members are free then.</p>
                    <PeopleAtTime
                      people={check.data.people.filter((p) => required.includes(p.memberId))}
                      nameOf={nameOf}
                      viewerId={viewer.memberId}
                      only="problems"
                    />
                  </>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs text-fg-muted">Free then. Tap a group to send:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {check.data.combinations.map((c) => {
                        const ids = c.picks.map((p) => p.memberId);
                        const on = ids.length === attendees.size && ids.every((id) => attendees.has(id));
                        return (
                          <Button
                            key={ids.join()}
                            type="button"
                            variant={on ? "default" : "secondary"}
                            size="sm"
                            className="max-md:h-10"
                            aria-pressed={on}
                            onClick={() => onAttendeesChange(ids)}
                          >
                            {nameList(ids.map(short), 4)}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {when && (
        <div className="rounded-lg border border-accent/40 bg-accent-subtle/50 px-3 py-2 text-sm" role="status">
          <div className="tnum font-medium">
            {when.label}, {COFFEE_CHAT_MINUTES} minutes
          </div>
          <div className="text-xs text-fg-muted">
            {picked
              ? picked.combination.picks
                  .map((p) => `${p.memberId === viewer.memberId ? "You" : nameOf(p.memberId)}${p.reason === "already chosen" ? "" : ` (${p.reason})`}`)
                  .join(", ")
              : nameList([...attendees].map((id) => (id === viewer.memberId ? "You" : nameOf(id))), 6)}
            {picked?.combination.noPartner ? ". No partner is free at this time." : ""}
          </div>
        </div>
      )}
    </div>
  );
}
