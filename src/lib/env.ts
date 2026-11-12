import { createHmac } from "crypto";

/**
 * Deployment configuration, read in one place.
 *
 * The rule: a deployment must be safe with nothing but a database connected.
 * A missing setting may switch a feature off; it must never fall back to a
 * value that is public knowledge.
 */

// Local development and `next build` only — never a production runtime value.
// Long and mixed so better-auth does not warn about it on every build.
const DEV_SECRET = "ov-dev-only-7Fq2mX9cLr4TzB8nHs6VdK1wYp3JgE5aNu0RiCtM";

/** True while `next build` is collecting page data — no real requests yet. */
const building = () => process.env.NEXT_PHASE === "phase-production-build";

export const isProduction = () => process.env.NODE_ENV === "production";

function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

export type SecretSource = "env" | "derived" | "dev";

/**
 * Where the session-signing secret comes from.
 *
 *   env      BETTER_AUTH_SECRET is set — the club manages it.
 *   derived  Unset in production: derived from the database credentials, which
 *            are already secret, unique to the deployment and stable across
 *            deploys. Whoever holds them can read the session table directly,
 *            so this exposes nothing new. Rotating the database password
 *            signs everyone out.
 *   dev      Local development and `next build` only.
 */
export function secretSource(): SecretSource {
  if (process.env.BETTER_AUTH_SECRET) return "env";
  if (isProduction() && !building()) return "derived";
  return "dev";
}

let derived: string | undefined;

export function authSecret(): string {
  const configured = process.env.BETTER_AUTH_SECRET;
  if (configured) return configured;
  if (secretSource() === "dev") return DEV_SECRET;
  if (derived) return derived;
  const url = databaseUrl();
  if (!url) {
    // Nothing secret to derive from, and nothing works without a database
    // anyway. Refuse rather than sign sessions with a guessable key.
    throw new Error(
      "BETTER_AUTH_SECRET is not set and no database is connected. Set BETTER_AUTH_SECRET (any long random string) and redeploy."
    );
  }
  derived = createHmac("sha256", url).update("openventure:auth-secret:v1").digest("base64url");
  return derived;
}

/** A purpose-bound key, so one leaked signature never unlocks another feature. */
export function deriveKey(purpose: string): string {
  return createHmac("sha256", authSecret()).update(`openventure:${purpose}`).digest("hex");
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const cronConfigured = () => Boolean(process.env.CRON_SECRET);
export const breakGlassEmail = () =>
  process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || null;
