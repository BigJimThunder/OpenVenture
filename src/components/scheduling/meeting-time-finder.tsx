"use client";

import * as React from "react";
import { findGroupTimesAction } from "@/lib/actions/availability";
import { useViewer } from "@/components/shell/viewer";
import { can } from "@/lib/permissions";
import { groupSlotItems, MemberChips, SlotsByDay, UnknownNotice, useFinderQuery, useNameOf } from "./finder-parts";
import { Segmented } from "./segmented";

/**
 * "Find a time" inside the meeting dialog: the best-attended slots over the
 * next two weeks for everyone, or for a chosen group. Picking one hands the
 * instant back to the form.
 */
export function MeetingTimeFinder({
  durationMinutes,
  excludeMeetingId,
  selected,
  onPick,
}: {
  durationMinutes: number;
  /** When moving an existing meeting, so it does not conflict with itself. */
  excludeMeetingId?: string;
  selected: number | null;
  onPick: (start: Date) => void;
}) {
  const viewer = useViewer();
  const [who, setWho] = React.useState<"everyone" | "some">("everyone");
  const [chosen, setChosen] = React.useState<Set<string>>(() => new Set([viewer.memberId]));
  const [includeUnknown, setIncludeUnknown] = React.useState(false);

  const duration = Math.min(480, Math.max(15, Math.round(durationMinutes / 15) * 15 || 60));
  const memberIds = who === "everyone" ? [] : [...chosen].sort();
  const ready = who === "everyone" || chosen.size > 0;
  const key = ready ? JSON.stringify([memberIds, duration, includeUnknown, excludeMeetingId]) : null;
  const { data, error, loading } = useFinderQuery(key, () =>
    findGroupTimesAction({ memberIds, durationMinutes: duration, days: 14, includeUnknown, excludeMeetingId, skipToday: true })
  );
  const nameOf = useNameOf(data?.members ?? []);
  const items = data ? groupSlotItems(data.byDay, nameOf) : [];
  const best = data?.best[0];

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-bg-subtle/50 p-3">
      <Segmented
        label="Who needs to be there"
        value={who}
        onChange={setWho}
        options={[
          { value: "everyone", label: "Everyone" },
          { value: "some", label: "Choose people" },
        ]}
      />
      {who === "some" && data && (
        <MemberChips
          members={data.members}
          selected={chosen}
          viewerId={viewer.memberId}
          unknown={new Set(data.unknown)}
          onToggle={(id) =>
            setChosen((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })
          }
        />
      )}
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
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      {!data && loading && <p className="text-xs text-fg-muted">Looking at everyone&apos;s week…</p>}
      {!ready && <p className="text-xs text-fg-muted">Choose at least one person.</p>}
      {data && ready && items.length === 0 && !loading && (
        <p className="text-sm text-fg-muted">
          No {duration}-minute gap in the next two weeks works for anyone with a schedule on file. Try a shorter meeting.
        </p>
      )}
      {data && ready && items.length > 0 && (
        <div className={loading ? "opacity-60" : undefined} aria-busy={loading}>
          <p className="mb-2 text-xs text-fg-muted">
            {data.everyoneFree
              ? `Times when all ${data.considered} are free, next two weeks.`
              : "No time fits everyone. These have the best attendance."}{" "}
            {data.zone}.
          </p>
          <SlotsByDay
            items={items}
            selected={selected}
            bestKey={best ? `${best.day}|${best.startMinute}` : undefined}
            initialDays={5}
            onPick={(item) => onPick(new Date(item.start))}
          />
        </div>
      )}
    </div>
  );
}
