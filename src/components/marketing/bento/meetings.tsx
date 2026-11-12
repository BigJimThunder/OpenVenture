"use client";

import * as React from "react";
import { Check, Coffee, Vote, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, styles, usd } from "../kit";

const QUORUM = 5;

const AGENDA: { icon: LucideIcon; kind: string; subject: React.ReactNode; minutes: number }[] = [
  { icon: Vote, kind: "Vote", subject: "SplitStay", minutes: 10 },
  { icon: Coffee, kind: "Coffee chat readout", subject: "TapTix", minutes: 10 },
  { icon: Wallet, kind: "Budget check", subject: <>{usd(2200)} remaining</>, minutes: 5 },
];

const MEMBERS = [
  { initials: "PR", name: "Priya Raman" },
  { initials: "MC", name: "Marcus Chen" },
  { initials: "EK", name: "Elena K." },
  { initials: "SG", name: "Sam G." },
  { initials: "MK", name: "Maya K." },
  { initials: "JW", name: "Jamal W." },
  { initials: "SA", name: "Sofia A." },
  { initials: "TR", name: "Tom R." },
];

/**
 * A meeting as the chair sees it: the agenda the app drafted from what is
 * waiting, and attendance as one tap per member. Quorum follows the count.
 */
export function MeetingsVisual() {
  const [absent, setAbsent] = React.useState<ReadonlySet<string>>(() => new Set(["JW", "TR"]));
  // Nothing animates on first paint; marks pop only once the visitor has tapped.
  const [touched, setTouched] = React.useState(false);

  const present = MEMBERS.length - absent.size;
  const quorate = present >= QUORUM;

  function toggle(initials: string) {
    setTouched(true);
    setAbsent((prev) => {
      const next = new Set(prev);
      if (!next.delete(initials)) next.add(initials);
      return next;
    });
  }

  return (
    <div className="@container flex min-h-56 flex-col">
      <div className="flex flex-1 flex-col rounded-xl border border-border-strong bg-panel shadow-xs">
        <div className="flex items-start gap-3 px-3 pb-2 pt-2.5 lg:@max-[21rem]:px-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-fg">Investment committee</p>
            <p className="tnum mt-0.5 truncate text-xs leading-snug text-fg-muted">
              Thu 6:00 pm · 25 min
            </p>
          </div>
          <Chip key={String(quorate)} tone={quorate ? "success" : "warning"} className={cn(touched && styles.pop, "mt-px")}>
            {quorate ? "Quorum met" : "Below quorum"}
          </Chip>
        </div>

        <ol aria-label="Agenda" className="border-t border-border px-3 py-1.5 lg:@max-[21rem]:px-2.5 lg:@max-[21rem]:py-1">
          {AGENDA.map((item) => (
            <li key={item.kind} className="flex h-6 items-center gap-2 text-xs lg:@max-[21rem]:h-5.5">
              <item.icon className="size-3.5 shrink-0 text-fg-subtle lg:@max-[21rem]:hidden" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg-muted">
                {item.kind}: <span className="tnum font-medium text-fg">{item.subject}</span>
              </span>
              <span className="tnum w-12 shrink-0 rounded border border-border bg-bg-subtle text-center font-mono text-2xs leading-[1.125rem] text-fg-muted">
                {item.minutes} min
              </span>
            </li>
          ))}
        </ol>

        <div className="flex flex-1 items-center gap-3 border-t border-border px-3 py-2 lg:@max-[21rem]:px-2.5 @[21rem]:flex-col @[21rem]:items-stretch @[21rem]:justify-center @[21rem]:gap-1.5">
          <div className="min-w-0 flex-1 @[21rem]:flex @[21rem]:flex-none @[21rem]:items-baseline @[21rem]:justify-between">
            <p className={cn(styles.label, "hidden @[21rem]:block")}>Attendance</p>
            <p role="status" aria-live="polite" className="tnum text-xs leading-snug text-fg-muted">
              <span className="block text-md font-semibold leading-tight text-fg @[21rem]:inline @[21rem]:text-xs @[21rem]:font-medium">
                {present} of {MEMBERS.length}
              </span>{" "}
              present
              <span className="block text-fg-subtle @[21rem]:inline @[21rem]:text-fg-muted">
                <span aria-hidden className="hidden @[21rem]:inline">
                  {" · "}
                </span>
                quorum {QUORUM}
              </span>
              <span className="sr-only">, {quorate ? "quorum met" : "below quorum"}</span>
            </p>
          </div>
          <div role="group" aria-label="Attendance" className="grid shrink-0 grid-cols-4 gap-1 @[21rem]:flex @[21rem]:justify-between @[21rem]:gap-0 @[26rem]:justify-start @[26rem]:gap-2">
            {MEMBERS.map((m) => {
              const here = !absent.has(m.initials);
              return (
                <button
                  key={m.initials}
                  type="button"
                  aria-pressed={here}
                  aria-label={`${m.name}, ${here ? "present" : "absent"}`}
                  onClick={() => toggle(m.initials)}
                  className={cn(
                    "relative inline-flex size-9 cursor-pointer items-center justify-center rounded-full border text-2xs font-semibold tracking-tight outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-panel max-md:size-11 max-md:text-xs",
                    here
                      ? "border-transparent bg-accent-subtle text-fg hover:border-accent/50"
                      : "border-dashed border-border-strong bg-transparent text-fg-subtle hover:border-fg-subtle"
                  )}
                >
                  {m.initials}
                  {here && (
                    <span
                      aria-hidden
                      className={cn(
                        touched && styles.pop,
                        "absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-accent text-accent-fg ring-2 ring-panel"
                      )}
                    >
                      <Check className="size-2.5" strokeWidth={3.5} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
