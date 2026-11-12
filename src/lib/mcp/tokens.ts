import { createHash, randomBytes } from "crypto";

/**
 * Personal access tokens, the pure part: format, generation and the limits
 * the create form offers. Lookup and auth live in src/lib/actions/context.ts.
 */

export const TOKEN_PREFIX = "ov_pat_";
/** 32 random bytes → 43 base64url characters → 256 bits. */
const TOKEN_BYTES = 32;
/** Characters of the token kept in clear so a member can recognize it in a list. */
const DISPLAY_PREFIX_LENGTH = TOKEN_PREFIX.length + 6;

export const MAX_TOKENS_PER_MEMBER = 10;

export const TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export const DEFAULT_TOKEN_EXPIRY_DAYS = 90;

export type NewToken = {
  /** Shown to the member exactly once; never stored. */
  token: string;
  /** SHA-256 hex — what the database keeps. Same digest as `hashApiToken`. */
  tokenHash: string;
  prefix: string;
};

export function generateToken(): NewToken {
  const token = `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return {
    token,
    tokenHash: createHash("sha256").update(token).digest("hex"),
    prefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
  };
}

export function isTokenFormat(value: string): boolean {
  return /^ov_pat_[A-Za-z0-9_-]{43,}$/.test(value);
}

/** `null` days means the token never expires. */
export function tokenExpiry(days: number | null, now: Date = new Date()): Date | null {
  return days == null ? null : new Date(now.getTime() + days * 86_400_000);
}

export type TokenState = "active" | "expired" | "revoked";

export function tokenState(
  token: { revokedAt: Date | null; expiresAt: Date | null },
  now: Date = new Date()
): TokenState {
  if (token.revokedAt) return "revoked";
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}
