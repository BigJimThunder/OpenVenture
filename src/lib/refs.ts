/**
 * Human-readable entity refs — APP-141, MEM-27, MTG-12, TSK-84.
 *
 * The club talks in these ("did anyone screen APP-141?"), so they have to be
 * short, sequential and stable. They are per-org, not global: two deployments
 * both start at 1. The number lives in a `ref` column with a unique index on
 * (org_id, ref).
 *
 * This module is pure formatting so client components can import it. Allocating
 * the next ref touches the database and lives in `refs-server.ts` — keep them
 * apart or the pg driver ends up in the browser bundle.
 */

export const REF_PREFIX = {
  application: "APP",
  memo: "MEM",
  meeting: "MTG",
  actionItem: "TSK",
} as const;

export type RefKind = keyof typeof REF_PREFIX;

/** `formatRef("application", 141)` → `"APP-141"`. */
export function formatRef(kind: RefKind, ref: number): string {
  return `${REF_PREFIX[kind]}-${ref}`;
}

/**
 * Parse "app-141" / "APP-141" back into a kind + number, so typing a ref into
 * the command palette can jump straight to the record.
 */
export function parseRef(input: string): { kind: RefKind; ref: number } | null {
  const m = /^\s*([a-z]{3})[-\s]?(\d+)\s*$/i.exec(input);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const kind = (Object.keys(REF_PREFIX) as RefKind[]).find((k) => REF_PREFIX[k] === prefix);
  if (!kind) return null;
  return { kind, ref: Number(m[2]) };
}
