/**
 * The demographic suppression guard. With a small applicant pool, a chart
 * bucket of 1–4 people can re-identify an individual — so no demographic
 * aggregation may reach a chart, export, or page without passing through
 * this function. Enforced in code, not policy (see CLAUDE.md).
 *
 * Rules:
 * - Buckets below `minCell` are collapsed into one "Not shown (small group)"
 *   bucket.
 * - If the collapsed bucket is itself below `minCell`, it is dropped
 *   entirely (its existence would still leak "1–4 people picked something").
 * - Cross-tabs of two demographic dimensions are not suppressed here —
 *   they must never be computed in the first place.
 */

export const SUPPRESSED_LABEL = "Not shown (small group)";
export const DEFAULT_MIN_CELL = 5;

export type Bucket = { label: string; count: number };

export function kAnonymize(buckets: Bucket[], minCell: number = DEFAULT_MIN_CELL): Bucket[] {
  const kept: Bucket[] = [];
  let suppressed = 0;

  for (const b of buckets) {
    if (b.count >= minCell) kept.push({ ...b });
    else if (b.count > 0) suppressed += b.count;
  }

  kept.sort((a, b) => b.count - a.count);

  if (suppressed >= minCell) {
    kept.push({ label: SUPPRESSED_LABEL, count: suppressed });
  }
  // If 0 < suppressed < minCell the remainder is silently dropped — showing
  // even the aggregate would reveal that a tiny group exists.

  return kept;
}
