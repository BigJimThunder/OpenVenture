"use client";

import * as React from "react";
import { CalendarPlusIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { checkTimeAction, findGroupTimesAction, findTeamTimesAction } from "@/lib/actions/availability";
import type { Combination, SlotOption } from "@/lib/scheduling/engine";
import { attendanceLabel, firstName, nameList, slotTime, slotWindow } from "@/lib/scheduling/format";
import { formatDay, inputToMinute, zonedToUtc, type IsoDay } from "@/lib/scheduling/time";
import type { FinderMember } from "@/lib/scheduling/views";
import { Field, FieldToggle } from "@/components/patterns/field";
import { MeetingFormDialog } from "@/components/meetings/meeting-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BusyHeatmap } from "./heatmap";
import { MemberChips, PeopleAtTime, SlotsByDay, UnknownNotice, groupSlotItems, useFinderQuery, useNameOf } from "./finder-parts";
import { Segmented } from "./segmented";

type Mode = "group" | "team" | "at";

const DURATIONS = [30, 45, 60, 90, 120];

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it by hand.");
  }
}

function useIdSet(initial: string[] = []) {
  const [set, setSet] = React.useState<Set<string>>(() => new Set(initial));
  const toggle = React.useCallback((id: string) => {
    setSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  return [set, toggle, setSet] as const;
}

/**
 * The general "find a time" tool. Three questions:
 *   these people — when are they all free?
 *   any N people — which few, and when?
 *   a specific time — who can make it?
 */
export function TimeFinder({
  members,
  viewerId,
  today,
  timeZone,
  zone,
  unknownIds,
  canManageClub,
}: {
  members: FinderMember[];
  viewerId: string;
  /** Club-time today, for the date picker's floor. */
  today: IsoDay;
  timeZone: string;
  zone: string;
  /** Members with no schedule for the current term. */
  unknownIds: string[];
  canManageClub: boolean;
}) {
  const [mode, setMode] = React.useState<Mode>("group");
  const [duration, setDuration] = React.useState(60);
  const [days, setDays] = React.useState(14);
  const [includeUnknown, setIncludeUnknown] = React.useState(false);
  const [people, togglePerson, setPeople] = useIdSet();
  const [n, setN] = React.useState(2);
  const [requirePartner, setRequirePartner] = React.useState(false);
  const [date, setDate] = React.useState(today);
  const [time, setTime] = React.useState("17:00");
  const [meetingAt, setMeetingAt] = React.useState<Date | null>(null);

  const nameOf = useNameOf(members);
  const unknown = React.useMemo(() => new Set(unknownIds), [unknownIds]);
  const schedulable = members.filter((m) => m.role !== "read_only");
  const chosen = [...people].sort();

  const base = { durationMinutes: duration, includeUnknown };
  const group = useFinderQuery(mode === "group" ? JSON.stringify(["g", chosen, duration, days, includeUnknown]) : null, () =>
    findGroupTimesAction({ ...base, days, memberIds: chosen })
  );
  const teamReady = chosen.length <= n;
  const team = useFinderQuery(
    mode === "team" && teamReady ? JSON.stringify(["t", chosen, n, requirePartner, duration, days, includeUnknown]) : null,
    () => findTeamTimesAction({ ...base, days, required: chosen, n, requirePartner })
  );
  const minute = inputToMinute(time);
  const startMs = minute != null && date ? zonedToUtc(date, minute, timeZone) : null;
  const at = useFinderQuery(
    mode === "at" && startMs != null ? JSON.stringify(["a", startMs, chosen, n, requirePartner, duration, includeUnknown]) : null,
    () =>
      checkTimeAction({
        ...base,
        start: new Date(startMs!),
        pool: chosen.length > 0 ? chosen : undefined,
        n,
        requirePartner,
      })
  );

  const describe = (o: Pick<SlotOption, "day" | "startMinute" | "durationMinutes">, who?: string) =>
    `${formatDay(o.day)}, ${slotTime(o)} ${zone}${who ? `: ${who}` : ""}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-4 shadow-xs">
          <Segmented
            label="What are you trying to find"
            value={mode}
            onChange={setMode}
            options={[
              { value: "group", label: "These people" },
              { value: "team", label: "Any N people" },
              { value: "at", label: "A set time" },
            ]}
          />
          <p className="-mt-1 text-sm text-fg-muted">
            {mode === "group"
              ? "Choose who needs to be there. We show when all of them are free, or the best attendance when no time fits everyone."
              : mode === "team"
                ? "For a coffee chat or a small working group: say how many, and we suggest who and when, sharing the load around."
                : "Already have a time in mind? See who can make it and which few to send."}
          </p>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {mode === "group" ? "Who" : mode === "team" ? "Must include" : "Choose from"}
              </span>
              <span className="text-xs text-fg-muted">
                {people.size === 0 ? (
                  mode === "group" ? "Everyone" : mode === "team" ? "Nobody in particular" : "Everyone"
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer text-accent underline-offset-2 hover:underline"
                    onClick={() => setPeople(new Set())}
                  >
                    Clear {people.size}
                  </button>
                )}
              </span>
            </div>
            <MemberChips
              members={mode === "group" ? members : schedulable}
              selected={people}
              onToggle={togglePerson}
              viewerId={viewerId}
              unknown={unknown}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="How long">
              <NativeSelect value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d < 60 ? `${d} minutes` : d === 60 ? "1 hour" : `${d / 60} hours`}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {mode !== "at" ? (
              <Field label="Looking at">
                <NativeSelect value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  <option value={7}>Next 7 days</option>
                  <option value={14}>Next 2 weeks</option>
                  <option value={28}>Next 4 weeks</option>
                </NativeSelect>
              </Field>
            ) : (
              <>
                <Field label="Date">
                  <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className="tnum" />
                </Field>
                <Field label="Time" hint={zone}>
                  <Input type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} className="tnum" />
                </Field>
              </>
            )}
            {mode !== "group" && (
              <Field label="How many people">
                <NativeSelect value={n} onChange={(e) => setN(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 8].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
          </div>
          {mode !== "group" && (
            <FieldToggle label="Keep a partner in the group" hint="At least one partner or admin, when one is free.">
              <Switch checked={requirePartner} onCheckedChange={setRequirePartner} />
            </FieldToggle>
          )}
        </div>

        {mode === "group" && (
          <Results loading={group.loading} error={group.error} waiting={!group.data}>
            {group.data && (
              <>
                <UnknownNotice
                  unknown={group.data.unknown}
                  nameOf={nameOf}
                  includeUnknown={includeUnknown}
                  onIncludeChange={setIncludeUnknown}
                  hasTerms={group.data.hasTerms}
                  canManageClub={canManageClub}
                />
                {group.data.best.length === 0 ? (
                  <Nothing>
                    No {duration}-minute gap in this range works for anyone with a schedule on file. Try a shorter time or a
                    longer range.
                  </Nothing>
                ) : (
                  <>
                    <h3 className="text-sm font-semibold">
                      {group.data.everyoneFree
                        ? group.data.considered === 1
                          ? "Free times"
                          : `Best times when all ${group.data.considered} are free`
                        : "No time fits everyone. Best attendance:"}
                    </h3>
                    <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-panel shadow-xs">
                      {group.data.best.map((o) => (
                        <li key={`${o.day}|${o.startMinute}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="tnum text-sm font-medium">
                              {formatDay(o.day)} · {slotTime(o)}
                            </div>
                            <div className="tnum text-xs text-fg-muted">
                              {attendanceLabel(o, nameOf)}
                              {o.windowEnd - o.windowStart > o.durationMinutes && ` · open ${slotWindow(o)}`}
                              {o.reluctant.length > 0 &&
                                ` · ${nameList(o.reluctant.map((id) => firstName(nameOf(id))))} would rather not`}
                              {o.maybe.length > 0 && ` · ${o.maybe.length} unconfirmed`}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="max-md:size-10"
                              aria-label="Copy this time"
                              onClick={() => copyText(describe(o), "Time")}
                            >
                              <CopyIcon />
                            </Button>
                            <Button variant="secondary" className="max-md:h-10" onClick={() => setMeetingAt(new Date(o.start))}>
                              <CalendarPlusIcon />
                              Schedule
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <h3 className="mt-1 text-sm font-semibold">Day by day</h3>
                    <div className="rounded-lg border border-border bg-panel p-3.5 shadow-xs">
                      <SlotsByDay
                        items={groupSlotItems(group.data.byDay, nameOf)}
                        selected={null}
                        onPick={(item) => setMeetingAt(new Date(item.start))}
                      />
                    </div>
                    <p className="text-xs text-fg-muted">
                      Times are {zone}. Classes get 10 minutes either side; club meetings and scheduled coffee chats count as
                      busy. Tap a time to schedule a meeting then.
                    </p>
                  </>
                )}
              </>
            )}
          </Results>
        )}

        {mode === "team" && (
          <Results loading={team.loading} error={team.error} waiting={!team.data && teamReady}>
            {!teamReady && <Nothing>You chose {chosen.length} people for a group of {n}. Raise the number or clear a few.</Nothing>}
            {teamReady && team.data && (
              <>
                <UnknownNotice
                  unknown={team.data.unknown}
                  nameOf={nameOf}
                  includeUnknown={includeUnknown}
                  onIncludeChange={setIncludeUnknown}
                  hasTerms={team.data.hasTerms}
                  canManageClub={canManageClub}
                />
                {team.data.options.length === 0 ? (
                  <Nothing>
                    No time in this range has {n} {n === 1 ? "person" : "people"} free
                    {chosen.length > 0 ? " alongside the ones you chose" : ""}. Try a longer range or a smaller group.
                  </Nothing>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {team.data.options.map((o, i) => (
                      <li key={`${o.day}|${o.startMinute}`} className="rounded-lg border border-border bg-panel p-3.5 shadow-xs">
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                          <div className="min-w-0">
                            <div className="tnum flex items-center gap-2 text-sm font-medium">
                              {formatDay(o.day)} · {slotTime(o)}
                              {i === 0 && (
                                <span className="rounded-full bg-accent-subtle px-1.5 text-2xs font-medium text-accent">Best</span>
                              )}
                            </div>
                            {o.windowEnd - o.windowStart > o.durationMinutes && (
                              <div className="tnum text-xs text-fg-muted">Same people are free {slotWindow(o)}</div>
                            )}
                          </div>
                          <Button
                            variant="secondary"
                            className="max-md:h-10"
                            onClick={() =>
                              copyText(describe(o, nameList(o.combination.picks.map((p) => nameOf(p.memberId)), 8)), "Suggestion")
                            }
                          >
                            <CopyIcon />
                            Copy
                          </Button>
                        </div>
                        <CombinationList combination={o.combination} nameOf={nameOf} viewerId={viewerId} />
                        {o.alsoFree.length > 0 && (
                          <p className="mt-2 text-xs text-fg-muted">
                            Also free: {nameList(o.alsoFree.map((id) => firstName(nameOf(id))), 5)}.
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-fg-muted">
                  Times are {zone}. People are suggested by who has had the fewest coffee chats in the last month.
                </p>
              </>
            )}
          </Results>
        )}

        {mode === "at" && (
          <Results loading={at.loading} error={at.error} waiting={!at.data && startMs != null}>
            {startMs == null && <Nothing>Pick a date and a time.</Nothing>}
            {at.data && startMs != null && (
              <>
                <h3 className="tnum text-sm font-semibold">
                  {formatDay(at.data.day)} · {slotTime(at.data)}: {at.data.availableCount} of {at.data.people.length} can make it
                </h3>
                {at.data.combinations.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {at.data.combinations.map((c, i) => (
                      <li key={i} className="rounded-lg border border-border bg-panel p-3.5 shadow-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-fg-muted">
                            {i === 0
                              ? "Suggested"
                              : c.swap
                                ? `Or ${firstName(nameOf(c.swap.in))} instead of ${firstName(nameOf(c.swap.out))}`
                                : "Alternative"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="-my-1 max-md:size-10"
                            aria-label="Copy this group"
                            onClick={() => copyText(describe(at.data!, nameList(c.picks.map((p) => nameOf(p.memberId)), 8)), "Group")}
                          >
                            <CopyIcon />
                          </Button>
                        </div>
                        <CombinationList combination={c} nameOf={nameOf} viewerId={viewerId} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Nothing>Fewer than {n} of them can make this time.</Nothing>
                )}
                <div className="rounded-lg border border-border bg-panel p-3.5 shadow-xs">
                  <PeopleAtTime people={at.data.people} nameOf={nameOf} viewerId={viewerId} />
                </div>
                <FieldToggle
                  label="Count members without a schedule as possibly free"
                  hint="Off by default: someone we know nothing about is not the same as someone who is free."
                >
                  <Switch checked={includeUnknown} onCheckedChange={setIncludeUnknown} />
                </FieldToggle>
              </>
            )}
          </Results>
        )}
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        <div className="rounded-lg border border-border bg-panel p-4 shadow-xs">
          <h3 className="text-sm font-semibold">The week at a glance</h3>
          <p className="mt-0.5 mb-3 text-xs text-fg-muted">
            {people.size === 0 ? "Everyone" : `The ${people.size} you chose`}, next 7 days. Pale is where to look.
          </p>
          <HeatmapFor memberIds={chosen} fallback={group.data?.heatmap ?? null} active={mode === "group"} />
        </div>
      </aside>

      {meetingAt && (
        <MeetingFormDialog
          open
          onOpenChange={(open) => !open && setMeetingAt(null)}
          initialStart={meetingAt}
          initialDurationMinutes={duration}
        />
      )}
    </div>
  );
}

/** In "these people" mode the heat map rides along with the results; otherwise it asks for itself. */
function HeatmapFor({
  memberIds,
  fallback,
  active,
}: {
  memberIds: string[];
  fallback: React.ComponentProps<typeof BusyHeatmap>["heatmap"] | null;
  active: boolean;
}) {
  const own = useFinderQuery(active ? null : JSON.stringify(["h", memberIds]), () =>
    findGroupTimesAction({ memberIds, durationMinutes: 60, days: 7 })
  );
  const heatmap = active ? fallback : (own.data?.heatmap ?? null);
  if (!heatmap) return <div className="h-64 animate-pulse rounded-md bg-bg-subtle" aria-hidden />;
  if (heatmap.known === 0) {
    return <p className="text-xs text-fg-muted">Nobody here has a schedule on file yet, so there is nothing to draw.</p>;
  }
  return <BusyHeatmap heatmap={heatmap} />;
}

function Results({
  loading,
  error,
  waiting,
  children,
}: {
  loading: boolean;
  error: string | null;
  /** Nothing to show yet. */
  waiting: boolean;
  children: React.ReactNode;
}) {
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
        {error}
      </p>
    );
  }
  if (waiting) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-bg-subtle" />
        ))}
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {children}
    </div>
  );
}

function Nothing({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border-strong/70 bg-bg-subtle/40 px-4 py-6 text-center text-sm text-fg-muted">
      {children}
    </p>
  );
}

function CombinationList({
  combination,
  nameOf,
  viewerId,
}: {
  combination: Combination;
  nameOf: (id: string) => string;
  viewerId: string;
}) {
  return (
    <>
      <ul className="mt-2 flex flex-col gap-1">
        {combination.picks.map((p) => (
          <li key={p.memberId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{p.memberId === viewerId ? "You" : nameOf(p.memberId)}</span>
            <span className="text-xs text-fg-muted">{p.reason}</span>
          </li>
        ))}
      </ul>
      {combination.noPartner && <p className="mt-1.5 text-xs text-warning">No partner is free at this time.</p>}
    </>
  );
}
