import type { Commitment, SlotOption } from "./engine";
import { formatDay, formatMinute, formatMinuteRange, zonedParts, type IsoDay } from "./time";

/** Words for what the engine found. Pure, shared by the UI, emails and the clipboard. */

/** "Priya", "Priya and Tom", "Priya, Tom and 2 others". */
export function nameList(names: readonly string[], max = 3): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const rest = names.length - (max - 1);
  return `${names.slice(0, max - 1).join(", ")} and ${rest} others`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "2:00–2:30 PM" for the suggested start. */
export function slotTime(option: Pick<SlotOption, "startMinute" | "durationMinutes">): string {
  return formatMinuteRange(option.startMinute, option.startMinute + option.durationMinutes);
}

/**
 * The stretch a suggestion stands for: "2:00–4:30 PM, any 30 minutes" when
 * there is slack, or just the time when there is none.
 */
export function slotWindow(option: Pick<SlotOption, "windowStart" | "windowEnd" | "durationMinutes">): string {
  const range = formatMinuteRange(option.windowStart, option.windowEnd);
  if (option.windowEnd - option.windowStart <= option.durationMinutes) return range;
  return `${range}, any ${durationLabel(option.durationMinutes)}`;
}

export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes % 60 === 0) return minutes === 60 ? "hour" : `${minutes / 60} hours`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

/** "Everyone free", "5 of 6, without Priya". */
export function attendanceLabel(
  option: Pick<SlotOption, "available" | "missing">,
  nameOf: (id: string) => string
): string {
  if (option.missing.length === 0) {
    return option.available.length === 2 ? "Both free" : "Everyone free";
  }
  const total = option.available.length + option.missing.length;
  return `${option.available.length} of ${total}, without ${nameList(option.missing.map((m) => firstName(nameOf(m.memberId))))}`;
}

/**
 * What is in someone's way, phrased for the viewer. A class name is private to
 * the member and admins — pass `label: null` for everyone else and they read
 * "is busy". Club meetings and coffee chats are visible to all.
 */
export function conflictPhrase(
  name: string,
  conflict: Pick<Commitment, "kind" | "label"> & { startMinute: number; endMinute: number }
): string {
  const time = formatMinuteRange(conflict.startMinute, conflict.endMinute);
  if (conflict.kind === "meeting") return `${name} has ${conflict.label ?? "a club meeting"} ${time}`;
  if (conflict.kind === "coffee_chat") return `${name} has a coffee chat${conflict.label ? ` (${conflict.label})` : ""} ${time}`;
  if (conflict.label) return `${name} has ${conflict.label} ${time}`;
  return `${name} is busy ${time}`;
}

/** "Eastern Time (EST)". */
export function zoneName(instant: number, timeZone: string): string {
  const part = (style: "longGeneric" | "short") => {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style })
        .formatToParts(new Date(instant))
        .find((p) => p.type === "timeZoneName")?.value;
    } catch {
      return undefined;
    }
  };
  const long = part("longGeneric");
  const short = part("short");
  if (long && short && long !== short) return `${long} (${short})`;
  return long ?? short ?? timeZone;
}

/**
 * A short plain-text note offering a founder the top few times. The founder's
 * own calendar is the one thing the app cannot see, so this is the hand-off.
 */
export function founderMessage(args: {
  options: readonly Pick<SlotOption, "day" | "startMinute" | "start" | "durationMinutes">[];
  timeZone: string;
  orgName: string;
  companyName?: string | null;
}): string {
  const options = args.options.slice(0, 3);
  if (options.length === 0) return "";
  const zone = zoneName(options[0].start, args.timeZone);
  const lines = options.map((o) => `- ${formatDay(o.day)}, ${slotTime(o)}`);
  const about = args.companyName ? ` about ${args.companyName}` : "";
  return [
    `Hi, we'd like to find ${durationLabel(options[0].durationMinutes) === "hour" ? "an hour" : durationLabel(options[0].durationMinutes)} for a coffee chat${about}. Any of these work on our side (${zone}):`,
    "",
    ...lines,
    "",
    `Tell us which suits you, or send a couple of times that are better for you.`,
    "",
    args.orgName,
  ].join("\n");
}

/** Day and minute of an instant in club time, for showing a manually typed time. */
export function localMoment(instant: number, timeZone: string): { day: IsoDay; minute: number; label: string } {
  const p = zonedParts(instant, timeZone);
  return { day: p.day, minute: p.minute, label: `${formatDay(p.day)}, ${formatMinute(p.minute)}` };
}
