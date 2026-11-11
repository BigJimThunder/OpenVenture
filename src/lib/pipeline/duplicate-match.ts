/**
 * Pure matching for likely-duplicate applications. No model call and no DB:
 * the same founder often applies twice (once by form, once through a member),
 * and a normalized domain, a shared email, or a near-identical company name
 * catches almost all of it.
 */

export type DuplicateReason = "same domain" | "same applicant email" | "similar name";

export type DuplicateQuery = {
  companyName?: string | null;
  domain?: string | null;
  applicantEmail?: string | null;
};

export type DuplicateRow = {
  applicationId: string;
  ref: number;
  companyName: string;
  domain: string | null;
  applicantEmail: string | null;
};

export type DuplicateCandidate = {
  applicationId: string;
  ref: number;
  companyName: string;
  reason: DuplicateReason;
};

/** "https://www.Acme.dev/about?x=1" → "acme.dev". Empty string when unusable. */
export function normalizeDomain(input: string | null | undefined): string {
  const host = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : "";
}

export function normalizeEmail(input: string | null | undefined): string {
  return (input ?? "").trim().toLowerCase();
}

/** Legal suffixes and filler that make two spellings of one company differ. */
const NOISE = new Set([
  "inc", "llc", "ltd", "co", "corp", "corporation", "company", "labs", "lab",
  "technologies", "technology", "tech", "the", "app", "io", "ai", "hq",
]);

/** "Lecture Loop, Inc." → "lecture loop". */
export function normalizeCompanyName(name: string | null | undefined): string {
  const words = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const kept = words.filter((w) => !NOISE.has(w));
  // A company literally called "Labs" keeps its name.
  return (kept.length > 0 ? kept : words).join(" ");
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/**
 * Sørensen–Dice coefficient over character bigrams of the normalized names,
 * ignoring spaces so "LectureLoop" and "Lecture Loop" are identical. 0–1.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const x = normalizeCompanyName(a).replace(/ /g, "");
  const y = normalizeCompanyName(b).replace(/ /g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + (y.length - 1));
}

/** Above this two names are "probably the same company". Tuned on the tests. */
export const NAME_MATCH_THRESHOLD = 0.82;

/**
 * Rank rows against a query. Strongest evidence wins when a row matches more
 * than one way; order is domain, then email, then name similarity.
 */
export function matchDuplicates(
  query: DuplicateQuery,
  rows: DuplicateRow[],
  opts: { excludeApplicationId?: string; limit?: number } = {}
): DuplicateCandidate[] {
  const domain = normalizeDomain(query.domain);
  const email = normalizeEmail(query.applicantEmail);
  const hasName = normalizeCompanyName(query.companyName).length >= 3;

  const scored: (DuplicateCandidate & { rank: number })[] = [];
  for (const row of rows) {
    if (row.applicationId === opts.excludeApplicationId) continue;
    let reason: DuplicateReason | null = null;
    let rank = 0;
    if (domain && normalizeDomain(row.domain) === domain) {
      reason = "same domain";
      rank = 3;
    } else if (email && normalizeEmail(row.applicantEmail) === email) {
      reason = "same applicant email";
      rank = 2;
    } else if (hasName) {
      const sim = nameSimilarity(query.companyName, row.companyName);
      if (sim >= NAME_MATCH_THRESHOLD) {
        reason = "similar name";
        rank = sim;
      }
    }
    if (reason) {
      scored.push({
        applicationId: row.applicationId,
        ref: row.ref,
        companyName: row.companyName,
        reason,
        rank,
      });
    }
  }
  return scored
    .sort((a, b) => b.rank - a.rank || b.ref - a.ref)
    .slice(0, opts.limit ?? 5)
    .map((c) => ({
      applicationId: c.applicationId,
      ref: c.ref,
      companyName: c.companyName,
      reason: c.reason,
    }));
}
