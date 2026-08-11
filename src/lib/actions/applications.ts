"use server";

import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  application,
  company,
  pipelineStage,
  stageHistory,
  applicationNote,
  DECLINE_REASONS,
} from "@/db/schema";
import { authedAction, ActionError } from "./safe-action";

export const createApplication = authedAction({
  minRole: "analyst",
  input: z.object({
    companyName: z.string().min(1, "Company name is required").max(120),
    domain: z.string().max(120).optional(),
    applicantName: z.string().max(120).optional(),
    applicantEmail: z.string().email().optional().or(z.literal("")),
    amountRequested: z.coerce.number().min(0).max(1_000_000).optional(),
    pitchSummary: z.string().max(2000).optional(),
  }),
  handler: async (input, ctx) => {
    const domain = input.domain
      ?.trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];

    // Dedupe on domain
    if (domain) {
      const dupe = await db
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.orgId, ctx.org.id), eq(company.domain, domain)))
        .limit(1);
      if (dupe[0]) {
        const existingApp = await db
          .select({ id: application.id })
          .from(application)
          .where(and(eq(application.companyId, dupe[0].id), eq(application.status, "open")))
          .limit(1);
        if (existingApp[0]) {
          return { data: { applicationId: existingApp[0].id, duplicate: true as boolean } };
        }
      }
    }

    const [entry] = await db
      .select()
      .from(pipelineStage)
      .where(
        and(
          eq(pipelineStage.orgId, ctx.org.id),
          eq(pipelineStage.isEntryStage, true),
          isNull(pipelineStage.archivedAt)
        )
      )
      .limit(1);
    if (!entry) throw new ActionError("No entry stage configured");

    const [co] = await db
      .insert(company)
      .values({
        orgId: ctx.org.id,
        name: input.companyName,
        domain: domain || null,
        websiteUrl: domain ? `https://${domain}` : null,
      })
      .returning();

    const [app] = await db
      .insert(application)
      .values({
        orgId: ctx.org.id,
        companyId: co.id,
        stageId: entry.id,
        ownerMemberId: ctx.member.id,
        sourcedByMemberId: ctx.member.id,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail || null,
        amountRequested: input.amountRequested != null ? String(input.amountRequested) : null,
        pitchSummary: input.pitchSummary,
      })
      .returning();

    await db.insert(stageHistory).values({
      orgId: ctx.org.id,
      applicationId: app.id,
      toStageId: entry.id,
      movedByMemberId: ctx.member.id,
    });

    revalidatePath("/applications");
    return {
      data: { applicationId: app.id, duplicate: false as boolean },
      activity: {
        verb: "application.created",
        entityType: "application",
        entityId: app.id,
        entityLabel: input.companyName,
        summary: `${ctx.member.displayName} added ${input.companyName} to the pipeline`,
      },
    };
  },
});

export const moveApplicationStage = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    toStageId: z.string().uuid(),
    position: z.number().optional(),
    note: z.string().max(1000).optional(),
    declineReason: z.enum(DECLINE_REASONS).optional(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({
        id: application.id,
        stageId: application.stageId,
        enteredStageAt: application.enteredStageAt,
        companyId: application.companyId,
        companyName: company.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const [toStage] = await db
      .select()
      .from(pipelineStage)
      .where(and(eq(pipelineStage.id, input.toStageId), eq(pipelineStage.orgId, ctx.org.id)))
      .limit(1);
    if (!toStage) throw new ActionError("Stage not found");

    // Moving to a lost stage requires a recorded decline reason — this is
    // the data that makes the annual retro worth anything.
    if (toStage.kind === "lost" && !input.declineReason) {
      throw new ActionError("A decline reason is required");
    }

    const now = new Date();
    const secondsInPrev = Math.floor((now.getTime() - app.enteredStageAt.getTime()) / 1000);

    await db
      .update(application)
      .set({
        stageId: toStage.id,
        position: input.position != null ? String(input.position) : sql`${application.position}`,
        enteredStageAt: now,
        updatedAt: now,
        ...(toStage.kind === "lost"
          ? { status: "declined" as const, declineReason: input.declineReason, decidedAt: now }
          : {}),
        ...(toStage.kind === "won" ? { status: "funded" as const, decidedAt: now } : {}),
      })
      .where(eq(application.id, app.id));

    await db.insert(stageHistory).values({
      orgId: ctx.org.id,
      applicationId: app.id,
      fromStageId: app.stageId,
      toStageId: toStage.id,
      movedByMemberId: ctx.member.id,
      secondsInPrevStage: secondsInPrev,
      note: input.note,
    });

    revalidatePath("/applications");
    revalidatePath(`/applications/${app.id}`);
    return {
      data: { ok: true },
      activity: {
        verb: "application.stage_changed",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} moved ${app.companyName} to ${toStage.name}`,
      },
    };
  },
});

export const reorderApplication = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    position: z.number(),
  }),
  handler: async (input, ctx) => {
    await db
      .update(application)
      .set({ position: String(input.position) })
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)));
    return { data: { ok: true } };
  },
});

export const addApplicationNote = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    body: z.string().min(1).max(5000),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({ id: application.id, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const [note] = await db
      .insert(applicationNote)
      .values({
        applicationId: input.applicationId,
        authorMemberId: ctx.member.id,
        body: input.body,
      })
      .returning();

    revalidatePath(`/applications/${input.applicationId}`);
    return {
      data: { noteId: note.id },
      activity: {
        verb: "application.note_added",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} added a note on ${app.companyName}`,
      },
    };
  },
});
