/**
 * Bulk invites: an admin pastes a class list, one person per line. Accepted
 * shapes are `Name <email>`, `Name, email`, `email, Name`, `Name email` and a
 * bare `email` (the name is then guessed from the address). Pure — the action
 * decides what to do with each parsed line.
 */

export type ParsedInvite =
  | { line: number; raw: string; ok: true; email: string; name: string }
  | { line: number; raw: string; ok: false; error: string };

const EMAIL = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']{2,}/;
export const MAX_BULK_INVITES = 60;

/** "jordan.lee27@uni.edu" → "Jordan Lee". Good enough until they confirm it themselves. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/\+.*$/, "")
    .replace(/\d+/g, " ")
    .split(/[._\-\s]+/)
    .filter(Boolean);
  if (words.length === 0) return email;
  return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

export function parseInviteLines(
  text: string,
  opts: { allowedDomains?: string[]; existingEmails?: Iterable<string> } = {}
): ParsedInvite[] {
  const existing = new Set([...(opts.existingEmails ?? [])].map((e) => e.toLowerCase()));
  const domains = (opts.allowedDomains ?? []).map((d) => d.toLowerCase());
  const seen = new Set<string>();
  const out: ParsedInvite[] = [];

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const line = i + 1;
    const match = raw.match(EMAIL);
    if (!match) {
      out.push({ line, raw, ok: false, error: "No email address on this line" });
      return;
    }
    const email = match[0].replace(/[.)\]]+$/, "").toLowerCase();
    const name =
      raw
        .replace(match[0], " ")
        .replace(/[<>(),;"]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 120) || nameFromEmail(email);

    if (seen.has(email)) {
      out.push({ line, raw, ok: false, error: "Listed twice" });
    } else if (existing.has(email)) {
      out.push({ line, raw, ok: false, error: "Already a member" });
    } else if (domains.length > 0 && !domains.some((d) => email.endsWith(`@${d}`))) {
      out.push({ line, raw, ok: false, error: `Must end in ${domains.map((d) => `@${d}`).join(" or ")}` });
    } else {
      out.push({ line, raw, ok: true, email, name });
    }
    seen.add(email);
  });
  return out;
}

/** One row of the per-line report shown after a bulk invite. */
export type BulkInviteResult = {
  line: number;
  raw: string;
  ok: boolean;
  /** Parsed name and email for invited lines; the reason for skipped ones. */
  detail: string;
};
