"use server";

import { z } from "zod";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  application,
  company,
  pipelineStage,
  stageHistory,
  applicationNote,
  memo,
  voteRound,
  coffeeChat,
  coffeeChatAttendee,
  screeningCriterion,
  screeningScore,
  member,
  DECLINE_REASONS,
  COFFEE_CHAT_VERDICTS,
} from "@/db/schema";
import { withRef } from "@/lib/refs-server";
import { checkStageGates } from "@/lib/pipeline/gates";
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

    const app = await withRef(
      application,
      application.orgId,
      application.ref,
      ctx.org.id,
      async (ref) => {
        const [row] = await db
          .insert(application)
          .values({
            orgId: ctx.org.id,
            ref,
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
        return row;
      }
    );

    await db.insert(stageHistory).values({
      orgId: ctx.org.id,
      applicationId: app.id,
      toStageId: entry.id,
      movedByMemberId: ctx.member.id,
    });

    revalidatePath("/pipeline");
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

    // Stage gates: advancing past a flagged stage requires its artifact.
    // Evidence reads memo/voteRound STATUS only — never `vote` rows, which
    // stay behind getVoteRoundResults() until reveal.
    if (toStage.kind === "active" || toStage.kind === "won") {
      const orgStages = await db
        .select()
        .from(pipelineStage)
        .where(and(eq(pipelineStage.orgId, ctx.org.id), isNull(pipelineStage.archivedAt)));
      const fromStage =
        orgStages.find((s) => s.id === app.stageId) ??
        (
          await db
            .select()
            .from(pipelineStage)
            .where(eq(pipelineStage.id, app.stageId))
            .limit(1)
        )[0];
      if (fromStage && Number(toStage.position) > Number(fromStage.position)) {
        const [memoRows, voteRows, verdictCounts] = await Promise.all([
          db
            .select({ id: memo.id })
            .from(memo)
            .where(
              and(
                eq(memo.applicationId, app.id),
                inArray(memo.status, ["circulated", "decided"])
              )
            )
            .limit(1),
          db
            .select({ id: voteRound.id })
            .from(voteRound)
            .where(and(eq(voteRound.applicationId, app.id), eq(voteRound.status, "revealed")))
            .limit(1),
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(coffeeChatAttendee)
            .innerJoin(coffeeChat, eq(coffeeChatAttendee.coffeeChatId, coffeeChat.id))
            .where(
              and(
                eq(coffeeChat.applicationId, app.id),
                isNotNull(coffeeChatAttendee.verdict)
              )
            )
            .groupBy(coffeeChatAttendee.coffeeChatId),
        ]);
        const gate = checkStageGates(fromStage, toStage, orgStages, {
          hasCirculatedMemo: memoRows.length > 0,
          hasRevealedVote: voteRows.length > 0,
          maxVerdictAttendees: verdictCounts.reduce((max, r) => Math.max(max, r.n), 0),
        });
        if (!gate.ok) throw new ActionError(gate.message);
      }
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

    revalidatePath("/pipeline");
    revalidatePath(`/pipeline/${app.id}`);
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

export const upsertScreeningScores = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    scores: z
      .array(
        z.object({
          criterionId: z.string().uuid(),
          score: z.number().int().min(1).max(5),
          note: z.string().max(500).optional(),
        })
      )
      .min(1),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({ id: application.id, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const criterionIds = input.scores.map((s) => s.criterionId);
    const validCriteria = await db
      .select({ id: screeningCriterion.id })
      .from(screeningCriterion)
      .where(
        and(
          eq(screeningCriterion.orgId, ctx.org.id),
          inArray(screeningCriterion.id, criterionIds),
          isNull(screeningCriterion.archivedAt)
        )
      );
    if (validCriteria.length !== new Set(criterionIds).size) {
      throw new ActionError("Unknown screening criterion");
    }

    await db
      .insert(screeningScore)
      .values(
        input.scores.map((s) => ({
          applicationId: input.applicationId,
          criterionId: s.criterionId,
          scoredByMemberId: ctx.member.id,
          score: s.score,
          note: s.note,
        }))
      )
      .onConflictDoUpdate({
        target: [
          screeningScore.applicationId,
          screeningScore.criterionId,
          screeningScore.scoredByMemberId,
        ],
        set: {
          score: sql`excluded.score`,
          note: sql`excluded.note`,
        },
      });

    revalidatePath(`/pipeline/${input.applicationId}`);
    revalidatePath("/pipeline");
    return {
      data: { ok: true },
      activity: {
        verb: "application.scored",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} scored ${app.companyName} across ${input.scores.length} ${input.scores.length === 1 ? "criterion" : "criteria"}`,
      },
    };
  },
});

export const createCoffeeChat = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    scheduledAt: z.coerce.date().optional(),
    location: z.string().max(200).optional(),
    attendeeMemberIds: z.array(z.string().uuid()).min(1),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({ id: application.id, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const attendeeIds = [...new Set(input.attendeeMemberIds)];
    const validMembers = await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.orgId, ctx.org.id),
          inArray(member.id, attendeeIds),
          eq(member.status, "active")
        )
      );
    if (validMembers.length !== attendeeIds.length) {
      throw new ActionError("Attendees must be active members");
    }

    const [chat] = await db
      .insert(coffeeChat)
      .values({
        orgId: ctx.org.id,
        applicationId: input.applicationId,
        scheduledAt: input.scheduledAt,
        location: input.location,
      })
      .returning();
    await db
      .insert(coffeeChatAttendee)
      .values(attendeeIds.map((memberId) => ({ coffeeChatId: chat.id, memberId })));

    revalidatePath(`/pipeline/${input.applicationId}`);
    return {
      data: { coffeeChatId: chat.id },
      activity: {
        verb: "coffee_chat.scheduled",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} scheduled a coffee chat with ${app.companyName} (${attendeeIds.length} attendee${attendeeIds.length === 1 ? "" : "s"})`,
      },
    };
  },
});

export const recordCoffeeChatDebrief = authedAction({
  minRole: "analyst",
  input: z.object({
    coffeeChatId: z.string().uuid(),
    happenedAt: z.coerce.date().optional(),
    debrief: z.string().max(5000).optional(),
    verdict: z.enum(COFFEE_CHAT_VERDICTS).optional(),
  }),
  handler: async (input, ctx) => {
    const [chat] = await db
      .select({
        id: coffeeChat.id,
        applicationId: coffeeChat.applicationId,
        happenedAt: coffeeChat.happenedAt,
        companyName: company.name,
      })
      .from(coffeeChat)
      .innerJoin(application, eq(coffeeChat.applicationId, application.id))
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(coffeeChat.id, input.coffeeChatId), eq(coffeeChat.orgId, ctx.org.id)))
      .limit(1);
    if (!chat) throw new ActionError("Coffee chat not found");

    await db
      .update(coffeeChat)
      .set({
        happenedAt: input.happenedAt ?? chat.happenedAt ?? new Date(),
        ...(input.debrief !== undefined ? { debrief: input.debrief } : {}),
        ...(input.verdict !== undefined ? { verdict: input.verdict } : {}),
      })
      .where(eq(coffeeChat.id, chat.id));

    revalidatePath(`/pipeline/${chat.applicationId}`);
    return {
      data: { ok: true },
      activity: {
        verb: "coffee_chat.debriefed",
        entityType: "application",
        entityId: chat.applicationId,
        entityLabel: chat.companyName,
        summary: `${ctx.member.displayName} debriefed the ${chat.companyName} coffee chat`,
      },
    };
  },
});

export const recordCoffeeChatVerdict = authedAction({
  minRole: "analyst",
  input: z.object({
    coffeeChatId: z.string().uuid(),
    verdict: z.enum(COFFEE_CHAT_VERDICTS),
    note: z.string().max(1000).optional(),
  }),
  handler: async (input, ctx) => {
    const [chat] = await db
      .select({ id: coffeeChat.id, applicationId: coffeeChat.applicationId })
      .from(coffeeChat)
      .where(and(eq(coffeeChat.id, input.coffeeChatId), eq(coffeeChat.orgId, ctx.org.id)))
      .limit(1);
    if (!chat) throw new ActionError("Coffee chat not found");

    const updated = await db
      .update(coffeeChatAttendee)
      .set({ verdict: input.verdict, ...(input.note !== undefined ? { note: input.note } : {}) })
      .where(
        and(
          eq(coffeeChatAttendee.coffeeChatId, chat.id),
          eq(coffeeChatAttendee.memberId, ctx.member.id)
        )
      )
      .returning({ memberId: coffeeChatAttendee.memberId });
    if (updated.length === 0) {
      throw new ActionError("Only attendees of this chat can record a verdict");
    }

    revalidatePath(`/pipeline/${chat.applicationId}`);
    // Deliberately no activity row: each attendee's verdict is individual
    // judgement; the chat-level debrief carries the audit trail.
    return { data: { ok: true } };
  },
});

export const setNextStep = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    nextStep: z.string().max(200).nullable(),
    nextStepDue: z.coerce.date().nullable().optional(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({
        id: application.id,
        nextStep: application.nextStep,
        companyName: company.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const nextStep = input.nextStep?.trim() || null;
    await db
      .update(application)
      .set({
        nextStep,
        nextStepDue: nextStep ? (input.nextStepDue ?? null) : null,
        updatedAt: new Date(),
      })
      .where(eq(application.id, app.id));

    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/pipeline");
    revalidatePath("/inbox");
    return {
      data: { ok: true },
      activity: {
        verb: "application.next_step_set",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: nextStep
          ? `${ctx.member.displayName} set the next step on ${app.companyName}: ${nextStep}`
          : `${ctx.member.displayName} cleared the next step on ${app.companyName}`,
        diff: { nextStep: { from: app.nextStep, to: nextStep } },
      },
    };
  },
});

export const updateApplicationFacts = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    applicantName: z.string().max(120).nullable(),
    applicantEmail: z.string().email("Invalid email").max(200).nullable(),
    department: z.string().max(120).nullable(),
    classYear: z.coerce.number().int().min(1950).max(2100).nullable(),
    campusSource: z.string().max(120).nullable(),
    teamSize: z.coerce.number().int().min(1).max(200).nullable(),
    ownerMemberId: z.string().uuid().nullable(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({
        id: application.id,
        companyName: company.name,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        department: application.department,
        classYear: application.classYear,
        campusSource: application.campusSource,
        teamSize: application.teamSize,
        ownerMemberId: application.ownerMemberId,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    if (input.ownerMemberId) {
      const [owner] = await db
        .select({ id: member.id })
        .from(member)
        .where(and(eq(member.id, input.ownerMemberId), eq(member.orgId, ctx.org.id)))
        .limit(1);
      if (!owner) throw new ActionError("Owner is not a member of this club");
    }

    const next = {
      applicantName: input.applicantName?.trim() || null,
      applicantEmail: input.applicantEmail?.trim() || null,
      department: input.department?.trim() || null,
      classYear: input.classYear,
      campusSource: input.campusSource?.trim() || null,
      teamSize: input.teamSize,
      ownerMemberId: input.ownerMemberId,
    };

    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if ((app[key] ?? null) !== next[key]) diff[key] = { from: app[key] ?? null, to: next[key] };
    }
    if (Object.keys(diff).length === 0) return { data: { ok: true } };

    await db
      .update(application)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(application.id, app.id));

    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/pipeline");
    return {
      data: { ok: true },
      activity: {
        verb: "application.facts_updated",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} updated ${Object.keys(diff).join(", ")} on ${app.companyName}`,
        diff,
      },
    };
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

    revalidatePath(`/pipeline/${input.applicationId}`);
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
