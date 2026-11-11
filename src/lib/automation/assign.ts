/**
 * Round-robin ownership for applications that arrive without an owner.
 * Pure: the caller loads the candidates and their load.
 */

export type AssignCandidate = {
  id: string;
  /** Open applications in an active stage this member already owns. */
  openCount: number;
  /** When intake last auto-assigned them something; null = never. */
  lastAssignedAt: Date | null;
};

/**
 * Fair rotation: whoever is carrying the least, and among equals whoever has
 * waited longest for a new one. The final id comparison only exists to make
 * the result deterministic.
 */
export function pickAssignee<T extends AssignCandidate>(candidates: T[]): T | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) =>
      a.openCount - b.openCount ||
      (a.lastAssignedAt?.getTime() ?? 0) - (b.lastAssignedAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id)
  )[0];
}
