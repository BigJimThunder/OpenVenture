import { z } from "zod";

/**
 * Typed view over `organization.settings` (jsonb). Everything a club can
 * switch on or off without a schema change lives here, with defaults chosen
 * so a brand-new club gets sensible behaviour before anyone opens Settings.
 *
 * Read with `orgSettings(org)`; write with the `updateClubPreferences` action
 * (src/lib/actions/settings.ts), which deep-merges a partial patch.
 */
export const orgSettingsSchema = z.object({
  setup: z
    .object({
      /** Admin confirmed the default pipeline stages fit their process. */
      stagesReviewed: z.boolean().default(false),
      /** Admin hid the getting-started checklist. */
      dismissed: z.boolean().default(false),
    })
    .prefault({}),
  /** The hosted application form at /apply. */
  apply: z
    .object({
      enabled: z.boolean().default(false),
      /** Short welcome shown above the form. */
      intro: z.string().max(1200).default(""),
      /** Ask the optional, aggregate-only demographic questions. */
      askDemographics: z.boolean().default(true),
      /** Shown instead of the form when applications are closed. */
      closedMessage: z.string().max(600).default(""),
    })
    .prefault({}),
  /** Emails the app sends to founders on the club's behalf. */
  founderEmails: z
    .object({
      received: z.boolean().default(true),
      declined: z.boolean().default(false),
      funded: z.boolean().default(false),
      /** Replies go here (defaults to the application owner's email). */
      replyTo: z.string().max(200).default(""),
    })
    .prefault({}),
  automation: z
    .object({
      /** Monday-morning digest to every active member. */
      weeklyDigest: z.boolean().default(true),
      /** Nudge the owner when an application breaches its stage SLA. */
      slaNudges: z.boolean().default(true),
      /** Close vote rounds when their deadline passes. */
      autoCloseVotes: z.boolean().default(true),
      /** Remind voters who are eligible ~24h before a vote closes. */
      voteReminders: z.boolean().default(true),
      /** Quarterly "how is the grantee doing?" reminder to the owner. */
      checkinReminders: z.boolean().default(true),
      /** Who owns an application that arrives without one. */
      autoAssign: z.enum(["off", "round_robin"]).default("round_robin"),
    })
    .prefault({}),
  ai: z
    .object({
      /** Master switch; AI also needs ANTHROPIC_API_KEY in the environment. */
      enabled: z.boolean().default(true),
    })
    .prefault({}),
});

export type OrgSettings = z.infer<typeof orgSettingsSchema>;

/** Never throws: unknown or malformed stored values fall back to defaults. */
export function orgSettings(org: { settings: unknown }): OrgSettings {
  const parsed = orgSettingsSchema.safeParse(org.settings ?? {});
  return parsed.success ? parsed.data : orgSettingsSchema.parse({});
}

/** Deep-partial patch accepted by the updateOrgSettings action. */
export const orgSettingsPatchSchema = z.object({
  setup: orgSettingsSchema.shape.setup.unwrap().partial().optional(),
  apply: orgSettingsSchema.shape.apply.unwrap().partial().optional(),
  founderEmails: orgSettingsSchema.shape.founderEmails.unwrap().partial().optional(),
  automation: orgSettingsSchema.shape.automation.unwrap().partial().optional(),
  ai: orgSettingsSchema.shape.ai.unwrap().partial().optional(),
});
export type OrgSettingsPatch = z.infer<typeof orgSettingsPatchSchema>;

export function mergeOrgSettings(current: unknown, patch: OrgSettingsPatch): Record<string, unknown> {
  const base = (current && typeof current === "object" ? current : {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...base };
  for (const [section, values] of Object.entries(patch)) {
    if (!values) continue;
    const prev = (base[section] && typeof base[section] === "object" ? base[section] : {}) as object;
    next[section] = { ...prev, ...values };
  }
  return next;
}
