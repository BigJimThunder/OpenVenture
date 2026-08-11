"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { organization } from "@/db/schema";
import { authedAction } from "./safe-action";

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
