import { orgSettings } from "@/lib/org-settings";

/**
 * Demo mode: a public, read-only showcase of the app with fictional data.
 *
 * It takes two things, and neither alone does anything:
 *   - DEMO_MODE=1 in the environment, and
 *   - a club created by `pnpm seed:demo`, which marks it as demo data.
 * So setting the variable on a real club's deployment exposes nothing: its
 * data does not carry the mark, and no screen can add it.
 *
 * While it is on, anyone may enter as the demo admin without an email, and
 * every change is refused — in the action wrapper and at each of the few
 * entry points that are not actions.
 */
export const DEMO_EMAIL = "demo@example.com";

export const DEMO_REFUSAL =
  "This is a read-only demo with fictional data, so nothing can be changed here. Deploy your own copy to use it for real.";

export function demoRequested(): boolean {
  return process.env.DEMO_MODE === "1";
}

export function demoMode(org: { settings: unknown } | null | undefined): boolean {
  return demoRequested() && Boolean(org) && orgSettings(org!).demo.seeded;
}
