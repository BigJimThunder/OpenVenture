"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { authedAction } from "./safe-action";

const DOMAIN_RE = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;

export const updateOrgSettings = authedAction({
  minRole: "admin",
  input: z.object({
    name: z.string().min(2).max(80),
    schoolName: z.string().max(120).optional(),
    allowedEmailDomains: z
      .array(
        z
          .string()
          .transform((d) => d.trim().toLowerCase().replace(/^@/, ""))
          .pipe(z.string().regex(DOMAIN_RE, "Enter domains like university.edu"))
      )
      .max(10),
    fiscalYearStartMonth: z.coerce.number().int().min(1).max(12),
    timezone: z
      .string()
      .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown timezone"),
  }),
  handler: async (input, ctx) => {
    const domains = [...new Set(input.allowedEmailDomains)];
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    if (ctx.org.name !== input.name) diff.name = { from: ctx.org.name, to: input.name };
    if ((ctx.org.schoolName ?? "") !== (input.schoolName ?? ""))
      diff.schoolName = { from: ctx.org.schoolName, to: input.schoolName ?? null };
    if (ctx.org.allowedEmailDomains.join(",") !== domains.join(","))
      diff.allowedEmailDomains = { from: ctx.org.allowedEmailDomains, to: domains };
    if (ctx.org.fiscalYearStartMonth !== input.fiscalYearStartMonth)
      diff.fiscalYearStartMonth = {
        from: ctx.org.fiscalYearStartMonth,
        to: input.fiscalYearStartMonth,
      };
    if (ctx.org.timezone !== input.timezone)
      diff.timezone = { from: ctx.org.timezone, to: input.timezone };

    await db
      .update(organization)
      .set({
        name: input.name,
        schoolName: input.schoolName || null,
        allowedEmailDomains: domains,
        fiscalYearStartMonth: input.fiscalYearStartMonth,
        timezone: input.timezone,
        updatedAt: new Date(),
      })
      .where(eq(organization.id, ctx.org.id));

    revalidatePath("/settings");
    return {
      data: { ok: true },
      activity: {
        verb: "settings.org_updated",
        entityType: "organization",
        entityId: ctx.org.id,
        entityLabel: input.name,
        summary: `${ctx.member.displayName} updated club settings`,
        diff,
      },
    };
  },
});

export const updateSlackWebhook = authedAction({
  minRole: "admin",
  input: z.object({
    url: z.string().url().startsWith("https://hooks.slack.com/").or(z.literal("")),
  }),
  handler: async (input, ctx) => {
    await db
      .update(organization)
      .set({ slackWebhookUrl: input.url || null, updatedAt: new Date() })
      .where(eq(organization.id, ctx.org.id));
    revalidatePath("/settings");
    return {
      data: { ok: true },
      activity: {
        verb: "settings.slack_updated",
        entityType: "organization",
        entityId: ctx.org.id,
        summary: `${ctx.member.displayName} ${input.url ? "updated" : "removed"} the Slack webhook`,
      },
    };
  },
});

export const rotateIngestSecret = authedAction({
  minRole: "admin",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const secret = randomBytes(32).toString("hex");
    await db
      .update(organization)
      .set({ ingestSecret: secret, updatedAt: new Date() })
      .where(eq(organization.id, ctx.org.id));
    revalidatePath("/settings");
    return {
      data: { secret },
      activity: {
        verb: "settings.ingest_secret_rotated",
        entityType: "organization",
        entityId: ctx.org.id,
        summary: `${ctx.member.displayName} rotated the ingest secret`,
      },
    };
  },
});
