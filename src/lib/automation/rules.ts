/**
 * The decisions behind the scheduled jobs: when is something due, who should
 * hear about it, and under which key has it already been said. Pure — no
 * database, no clock, no email — so every rule is unit-tested.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ——— Calendar, in the club's timezone ———

export type LocalDate = {
  /** YYYY-MM-DD in the given timezone. */
  date: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** ISO week, e.g. "2026-W46" — the weekly digest's dedupe key. */
  isoWeek: string;
  /** Calendar quarter, e.g. "2026-Q4" — the check-in reminder's dedupe key. */
  quarter: string;
};

export function localDate(now: Date, timeZone: string): LocalDate {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
  } catch {
    // An unknown timezone string in org settings must not break the run.
    return localDate(now, "UTC");
  }
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const civil = new Date(Date.UTC(year, month - 1, day));
  const weekday = civil.getUTCDay();

  // ISO 8601: the week belongs to the year that holds its Thursday.
  const thursday = new Date(civil);
  thursday.setUTCDate(civil.getUTCDate() + 3 - ((weekday + 6) % 7));
  const isoYear = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / (7 * DAY)) + 1;

  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    weekday,
    isoWeek: `${isoYear}-W${pad(week)}`,
    quarter: `${year}-Q${Math.floor((month - 1) / 3) + 1}`,
  };
}

/** The digest goes out on Mondays, club time. */
export const DIGEST_WEEKDAY = 1;

export function isDigestDay(now: Date, timeZone: string): boolean {
  return localDate(now, timeZone).weekday === DIGEST_WEEKDAY;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY);
}

// ——— Votes ———

/**
 * The job runs once a day, so "about 24 hours before close" has to be a
 * window: anything closing within 36 hours is reminded now, which guarantees
 * at least 12 hours' notice whenever the run lands. A round opened in the
 * last 12 hours is skipped — the "vote open" email only just went out.
 */
export const VOTE_REMINDER_WINDOW_HOURS = 36;
export const VOTE_REMINDER_QUIET_HOURS = 12;

export function voteNeedsReminder(
  round: { opensAt: Date | null; closesAt: Date | null },
  now: Date
): boolean {
  if (!round.closesAt) return false;
  const remaining = round.closesAt.getTime() - now.getTime();
  if (remaining <= 0 || remaining > VOTE_REMINDER_WINDOW_HOURS * HOUR) return false;
  if (round.opensAt && now.getTime() - round.opensAt.getTime() < VOTE_REMINDER_QUIET_HOURS * HOUR) {
    return false;
  }
  return true;
}

export function voteIsOverdue(round: { closesAt: Date | null }, now: Date): boolean {
  return round.closesAt != null && round.closesAt.getTime() <= now.getTime();
}

// ——— Stage SLAs ———

export type SlaCandidate = {
  applicationId: string;
  enteredStageAt: Date;
  slaDays: number | null;
};

export type SlaBreach<T extends SlaCandidate> = T & {
  daysInStage: number;
  daysOver: number;
  /** One nudge per application per stage entry: moving stages resets it. */
  key: string;
};

export function findSlaBreaches<T extends SlaCandidate>(apps: T[], now: Date): SlaBreach<T>[] {
  const out: SlaBreach<T>[] = [];
  for (const a of apps) {
    if (!a.slaDays || a.slaDays <= 0) continue;
    const daysInStage = daysBetween(a.enteredStageAt, now);
    if (daysInStage <= a.slaDays) continue;
    out.push({
      ...a,
      daysInStage,
      daysOver: daysInStage - a.slaDays,
      key: `${a.applicationId}:${a.enteredStageAt.toISOString()}`,
    });
  }
  return out.sort((a, b) => b.daysOver - a.daysOver);
}

// ——— Grantee check-ins ———

export const CHECKIN_INTERVAL_DAYS = 90;

/**
 * A funded company is due a check-in when nobody has recorded an outcome for
 * 90 days — counted from the last update, or from the day the grant was
 * issued if there has never been one.
 */
export function checkinDue(
  company: { lastOutcomeAt: Date | null; issuedAt: Date | null },
  now: Date
): { due: boolean; daysSince: number | null } {
  const last = company.lastOutcomeAt ?? company.issuedAt;
  if (!last) return { due: false, daysSince: null };
  const daysSince = daysBetween(last, now);
  return { due: daysSince > CHECKIN_INTERVAL_DAYS, daysSince };
}

// ——— Routing ———

/**
 * Who hears about an item: its owner when they are still an active member,
 * otherwise every admin. Returns one list per recipient so the caller can
 * send a single email each.
 */
export function routeToOwnerOrAdmins<T extends { ownerMemberId: string | null }>(
  items: T[],
  activeMemberIds: ReadonlySet<string>,
  adminIds: readonly string[]
): Map<string, T[]> {
  const byRecipient = new Map<string, T[]>();
  const push = (memberId: string, item: T) => {
    const list = byRecipient.get(memberId);
    if (list) list.push(item);
    else byRecipient.set(memberId, [item]);
  };
  for (const item of items) {
    if (item.ownerMemberId && activeMemberIds.has(item.ownerMemberId)) {
      push(item.ownerMemberId, item);
    } else {
      for (const adminId of adminIds) push(adminId, item);
    }
  }
  return byRecipient;
}
