"use server";

import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { db } from "@/db";
import {
  application,
  company,
  companySector,
  sector,
  dealSource,
  pipelineStage,
  stageHistory,
  applicationNote,
  coffeeChat,
  coffeeChatAttendee,
  screeningCriterion,
  screeningScore,
  member,
  notificationLog,
  APPLICATION_PRIORITIES,
  DECLINE_REASONS,
  COFFEE_CHAT_VERDICTS,
} from "@/db/schema";
import { withRef } from "@/lib/refs-server";
import { formatRef } from "@/lib/refs";
import { atomic } from "@/lib/pipeline/atomic";
import {
  assertStageGates,
  findLiveGrant,
  loadStageMove,
  stageMoveWrites,
} from "@/lib/pipeline/moves";
import { findDuplicateCandidates, normalizeDomain } from "@/lib/pipeline/duplicates";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { defaultFounderEmail, sendFounderEmail } from "@/lib/founder-emails";
import { orgSettings } from "@/lib/org-settings";
import { aiConfigured, AI_MODEL } from "@/lib/ai";
import { draftScreeningBrief, type StoredScreeningBrief } from "@/lib/ai/screening";
import { draftDeclineLetter } from "@/lib/ai/decline-letter";
import { authedAction, ActionError } from "./safe-action";

/** Money typed by a member: digits with up to two decimals, as a string. */
const moneyString = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1500 or 1500.50");

function firstNameOf(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export const createApplication = authedAction({
  minRole: "analyst",
  input: z.object({
    companyName: z.string().trim().min(1, "Company name is required").max(120),
    domain: z.string().max(200).optional(),
    applicantName: z.string().max(120).optional(),
    applicantEmail: z.string().email("Invalid email").optional().or(z.literal("")),
    amountRequested: z.coerce.number().min(0).max(1_000_000).optional(),
    pitchSummary: z.string().max(2000).optional(),
    useOfFundsNarrative: z.string().max(5000).optional(),
    priority: z.enum(APPLICATION_PRIORITIES).optional(),
    sourceId: z.string().uuid().optional(),
    sectorIds: z.array(z.string().uuid()).max(5).optional(),
    /** The member saw the duplicate warning and wants a second application anyway. */
    allowDuplicate: z.boolean().optional(),
  }),
  handler: async (input, ctx) => {
    const domain = normalizeDomain(input.domain);
    if (input.domain?.trim() && !domain) {
      throw new ActionError("That website doesn't look like a domain — try acme.dev");
    }

    // A company is unique per (org, domain): reuse the record, and unless the
    // member insists, send them to its open application instead of forking it.
    let existingCompany: { id: string } | undefined;
    if (domain) {
      [existingCompany] = await db
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.orgId, ctx.org.id), eq(company.domain, domain)))
        .limit(1);
      if (existingCompany && !input.allowDuplicate) {
        const [existingApp] = await db
          .select({ id: application.id })
          .from(application)
          .where(
            and(
              eq(application.companyId, existingCompany.id),
              eq(application.status, "open"),
              isNull(application.archivedAt)
            )
          )
          .limit(1);
        if (existingApp) {
          return { data: { applicationId: existingApp.id, duplicate: true as boolean } };
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

    if (input.sourceId) {
      const [source] = await db
        .select({ id: dealSource.id })
        .from(dealSource)
        .where(and(eq(dealSource.id, input.sourceId), eq(dealSource.orgId, ctx.org.id)))
        .limit(1);
      if (!source) throw new ActionError("Unknown deal source");
    }
    const sectorIds = [...new Set(input.sectorIds ?? [])];
    if (sectorIds.length > 0) {
      const valid = await db
        .select({ id: sector.id })
        .from(sector)
        .where(and(eq(sector.orgId, ctx.org.id), inArray(sector.id, sectorIds)));
      if (valid.length !== sectorIds.length) throw new ActionError("Unknown sector");
    }

    const co =
      existingCompany ??
      (
        await db
          .insert(company)
          .values({
            orgId: ctx.org.id,
            name: input.companyName,
            domain: domain || null,
            websiteUrl: domain ? `https://${domain}` : null,
          })
          .returning({ id: company.id })
      )[0];

    if (sectorIds.length > 0) {
      await db
        .insert(companySector)
        .values(sectorIds.map((sectorId) => ({ companyId: co.id, sectorId })))
        .onConflictDoNothing();
    }

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
            sourceId: input.sourceId ?? null,
            priority: input.priority ?? "none",
            applicantName: input.applicantName?.trim() || null,
            applicantEmail: input.applicantEmail?.trim().toLowerCase() || null,
            amountRequested: input.amountRequested != null ? String(input.amountRequested) : null,
            pitchSummary: input.pitchSummary?.trim() || null,
            useOfFundsNarrative: input.useOfFundsNarrative?.trim() || null,
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
    revalidatePath("/inbox");
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

/**
 * Move an application to a stage. Also the decline path (lost stage: reason
 * required, note and founder email optional) and the reopen path (a closed
 * application moved back to an active stage becomes `open` again).
 */
export const moveApplicationStage = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    toStageId: z.string().uuid(),
    position: z.number().optional(),
    note: z.string().max(1000).optional(),
    declineReason: z.enum(DECLINE_REASONS).optional(),
    declineNote: z.string().max(2000).optional(),
    /**
     * Decline only. Omitted → the club's Founder emails setting decides.
     * Given → the member chose: send (with their edited text) or don't.
     */
    founderEmail: z
      .object({ send: z.boolean(), body: z.string().max(6000).optional() })
      .optional(),
  }),
  handler: async (input, ctx) => {
    const { app, toStage, fromStage, liveStages } = await loadStageMove(
      ctx.org.id,
      input.applicationId,
      input.toStageId
    );
    if (app.stageId === toStage.id && input.position == null) return { data: { ok: true, reopened: false } };

    // Moving to a lost stage requires a recorded decline reason — this is
    // the data that makes the annual retro worth anything.
    if (toStage.kind === "lost" && !input.declineReason) {
      throw new ActionError("A decline reason is required");
    }
    await assertStageGates(app.id, fromStage, toStage, liveStages);

    const reopening =
      (toStage.kind === "active" || toStage.kind === "parked") &&
      (app.status === "funded" || app.status === "declined" || app.status === "withdrawn");
    if (reopening && app.status === "funded") {
      const liveGrant = await findLiveGrant(app.id);
      if (liveGrant) {
        throw new ActionError(
          `This application has a ${liveGrant.status} grant — cancel it on the Grants page before reopening`
        );
      }
    }

    const previousStatus = app.status;
    const now = new Date();
    let reopened = false;
    await atomic((q) => {
      const move = stageMoveWrites(q, {
        orgId: ctx.org.id,
        memberId: ctx.member.id,
        app,
        toStage,
        now,
        position: input.position,
        note: input.note,
        declineReason: input.declineReason,
        declineNote: input.declineNote,
      });
      reopened = move.patch.reopened;
      return move.statements;
    });

    if (toStage.kind === "lost") {
      const choice = input.founderEmail;
      if (!choice) {
        after(() => sendFounderEmail("declined", app.id));
      } else if (choice.send) {
        after(() => sendFounderEmail("declined", app.id, { customBody: choice.body, force: true }));
      }
    }

    revalidatePath("/pipeline");
    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/inbox");
    const who = ctx.member.displayName;
    return {
      data: { ok: true, reopened },
      activity: {
        verb: reopened
          ? "application.reopened"
          : toStage.kind === "lost"
            ? "application.declined"
            : "application.stage_changed",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: reopened
          ? `${who} reopened ${app.companyName} into ${toStage.name}`
          : toStage.kind === "lost" && input.declineReason
            ? `${who} declined ${app.companyName} — ${DECLINE_REASON_LABELS[input.declineReason].toLowerCase()}`
            : `${who} moved ${app.companyName} to ${toStage.name}`,
        ...(reopened
          ? {
              diff: {
                status: { from: previousStatus, to: "open" },
                declineReason: { from: app.declineReason, to: null },
              },
            }
          : {}),
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

    // Upsert: a member who was there but wasn't listed joins the chat by
    // recording their verdict — otherwise a chat logged by one person could
    // never reach the stage's two-verdict rule.
    await db
      .insert(coffeeChatAttendee)
      .values({
        coffeeChatId: chat.id,
        memberId: ctx.member.id,
        verdict: input.verdict,
        note: input.note,
      })
      .onConflictDoUpdate({
        target: [coffeeChatAttendee.coffeeChatId, coffeeChatAttendee.memberId],
        set: { verdict: input.verdict, ...(input.note !== undefined ? { note: input.note } : {}) },
      });

    revalidatePath(`/pipeline/${chat.applicationId}`);
    revalidatePath("/pipeline");
    // Deliberately no activity row: each attendee's verdict is individual
    // judgment; the chat-level debrief carries the audit trail.
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

/**
 * The phone path: the chat already happened, so schedule + debrief + my
 * verdict land in one write instead of three screens.
 */
export const logCoffeeChat = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    attendeeMemberIds: z.array(z.string().uuid()).min(1).max(20),
    happenedAt: z.coerce.date().optional(),
    location: z.string().max(200).optional(),
    debrief: z.string().max(5000).optional(),
    verdict: z.enum(COFFEE_CHAT_VERDICTS).optional(),
  }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({ id: application.id, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    // Whoever logs it was there.
    const attendeeIds = [...new Set([ctx.member.id, ...input.attendeeMemberIds])];
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

    const happenedAt = input.happenedAt ?? new Date();
    const [chat] = await db
      .insert(coffeeChat)
      .values({
        orgId: ctx.org.id,
        applicationId: app.id,
        scheduledAt: happenedAt,
        happenedAt,
        location: input.location?.trim() || null,
        debrief: input.debrief?.trim() || null,
      })
      .returning({ id: coffeeChat.id });
    await db.insert(coffeeChatAttendee).values(
      attendeeIds.map((memberId) => ({
        coffeeChatId: chat.id,
        memberId,
        verdict: memberId === ctx.member.id ? (input.verdict ?? null) : null,
      }))
    );

    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/pipeline");
    const others = attendeeIds.length - 1;
    return {
      data: { coffeeChatId: chat.id },
      activity: {
        verb: "coffee_chat.debriefed",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary: `${ctx.member.displayName} logged a coffee chat with ${app.companyName}${others > 0 ? ` (${attendeeIds.length} attendees)` : ""}`,
      },
    };
  },
});

/** Fields whose values are prose or contact details — the audit log records that they changed, not what to. */
const DIFF_REDACTED = new Set([
  "applicantName",
  "applicantEmail",
  "useOfFundsNarrative",
  "pitchSummary",
]);

/**
 * Partial update of an application's own fields. Send only what changed;
 * `null` clears a field. Every editable fact on the record goes through here.
 */
export const updateApplicationFacts = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    applicantName: z.string().max(120).nullable().optional(),
    applicantEmail: z.string().email("Invalid email").max(200).nullable().optional(),
    department: z.string().max(120).nullable().optional(),
    classYear: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
    campusSource: z.string().max(120).nullable().optional(),
    teamSize: z.coerce.number().int().min(1).max(200).nullable().optional(),
    ownerMemberId: z.string().uuid().nullable().optional(),
    priority: z.enum(APPLICATION_PRIORITIES).optional(),
    sourceId: z.string().uuid().nullable().optional(),
    sourceDetail: z.string().max(200).nullable().optional(),
    amountRequested: moneyString.nullable().optional(),
    useOfFundsNarrative: z.string().max(5000).nullable().optional(),
    pitchSummary: z.string().max(5000).nullable().optional(),
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
        priority: application.priority,
        sourceId: application.sourceId,
        sourceDetail: application.sourceDetail,
        amountRequested: application.amountRequested,
        useOfFundsNarrative: application.useOfFundsNarrative,
        pitchSummary: application.pitchSummary,
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
    if (input.sourceId) {
      const [source] = await db
        .select({ id: dealSource.id })
        .from(dealSource)
        .where(and(eq(dealSource.id, input.sourceId), eq(dealSource.orgId, ctx.org.id)))
        .limit(1);
      if (!source) throw new ActionError("Unknown deal source");
    }

    const text = (v: string | null) => v?.trim() || null;
    const next: Partial<Omit<typeof app, "id" | "companyName">> = {};
    if (input.applicantName !== undefined) next.applicantName = text(input.applicantName);
    if (input.applicantEmail !== undefined) next.applicantEmail = text(input.applicantEmail)?.toLowerCase() ?? null;
    if (input.department !== undefined) next.department = text(input.department);
    if (input.classYear !== undefined) next.classYear = input.classYear;
    if (input.campusSource !== undefined) next.campusSource = text(input.campusSource);
    if (input.teamSize !== undefined) next.teamSize = input.teamSize;
    if (input.ownerMemberId !== undefined) next.ownerMemberId = input.ownerMemberId;
    if (input.priority !== undefined) next.priority = input.priority;
    if (input.sourceId !== undefined) next.sourceId = input.sourceId;
    if (input.sourceDetail !== undefined) next.sourceDetail = text(input.sourceDetail);
    if (input.amountRequested !== undefined) {
      next.amountRequested =
        input.amountRequested == null ? null : Number(input.amountRequested).toFixed(2);
    }
    if (input.useOfFundsNarrative !== undefined) next.useOfFundsNarrative = text(input.useOfFundsNarrative);
    if (input.pitchSummary !== undefined) next.pitchSummary = text(input.pitchSummary);

    const changes: Partial<typeof next> = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      const from = app[key] ?? null;
      const to = next[key] ?? null;
      if (from === to) continue;
      Object.assign(changes, { [key]: to });
      diff[key] = DIFF_REDACTED.has(key)
        ? { from: from == null ? null : "(set)", to: to == null ? null : "(edited)" }
        : { from, to };
    }
    const changed = Object.keys(diff);
    if (changed.length === 0) return { data: { ok: true } };

    await db
      .update(application)
      .set({ ...changes, updatedAt: new Date() })
      .where(eq(application.id, app.id));

    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/pipeline");
    revalidatePath("/inbox");
    const who = ctx.member.displayName;
    const summary =
      changed.length === 1 && changed[0] === "priority"
        ? `${who} set ${app.companyName} to ${next.priority === "none" ? "no" : next.priority} priority`
        : changed.length === 1 && changed[0] === "ownerMemberId"
          ? `${who} ${next.ownerMemberId ? "reassigned" : "unassigned"} ${app.companyName}`
          : `${who} updated ${changed.map((k) => FACT_LABELS[k] ?? k).join(", ")} on ${app.companyName}`;
    return {
      data: { ok: true },
      activity: {
        verb: "application.facts_updated",
        entityType: "application",
        entityId: app.id,
        entityLabel: app.companyName,
        summary,
        diff,
      },
    };
  },
});

const FACT_LABELS: Record<string, string> = {
  applicantName: "founder",
  applicantEmail: "email",
  department: "department",
  classYear: "class year",
  campusSource: "campus source",
  teamSize: "team size",
  ownerMemberId: "owner",
  priority: "priority",
  sourceId: "deal source",
  sourceDetail: "source detail",
  amountRequested: "the ask",
  useOfFundsNarrative: "use of funds",
  pitchSummary: "the pitch",
};

/**
 * Edit the company behind an application: name, website, one-liner, sectors.
 * A member's edit locks the field so "Enrich from website" never overwrites it.
 */
export const updateCompanyProfile = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    name: z.string().trim().min(1, "Company name is required").max(120).optional(),
    website: z.string().max(200).nullable().optional(),
    oneLiner: z.string().max(240).nullable().optional(),
    sectorIds: z.array(z.string().uuid()).max(5).optional(),
  }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select({ applicationId: application.id, co: company })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new ActionError("Application not found");
    const co = row.co;

    const updates: Partial<typeof company.$inferInsert> = {};
    const locked = new Set(co.lockedFields);
    const changed: string[] = [];

    if (input.name !== undefined && input.name !== co.name) {
      updates.name = input.name;
      changed.push("name");
    }
    if (input.oneLiner !== undefined) {
      const oneLiner = input.oneLiner?.trim() || null;
      if (oneLiner !== co.oneLiner) {
        updates.oneLiner = oneLiner;
        if (oneLiner) locked.add("oneLiner");
        else locked.delete("oneLiner");
        changed.push("one-liner");
      }
    }
    if (input.website !== undefined) {
      const raw = input.website?.trim() ?? "";
      const domain = normalizeDomain(raw);
      if (raw && !domain) throw new ActionError("That website doesn't look like a domain — try acme.dev");
      if ((domain || null) !== co.domain) {
        if (domain) {
          const [clash] = await db
            .select({ name: company.name })
            .from(company)
            .where(
              and(eq(company.orgId, ctx.org.id), eq(company.domain, domain), ne(company.id, co.id))
            )
            .limit(1);
          if (clash) throw new ActionError(`${domain} already belongs to ${clash.name}`);
        }
        updates.domain = domain || null;
        updates.websiteUrl = domain ? `https://${domain}` : null;
        changed.push("website");
      }
    }

    let sectorIds: string[] | null = null;
    if (input.sectorIds !== undefined) {
      sectorIds = [...new Set(input.sectorIds)];
      const [valid, current] = await Promise.all([
        sectorIds.length
          ? db
              .select({ id: sector.id })
              .from(sector)
              .where(and(eq(sector.orgId, ctx.org.id), inArray(sector.id, sectorIds)))
          : Promise.resolve([]),
        db
          .select({ sectorId: companySector.sectorId })
          .from(companySector)
          .where(eq(companySector.companyId, co.id)),
      ]);
      if (valid.length !== sectorIds.length) throw new ActionError("Unknown sector");
      const before = current.map((c) => c.sectorId).sort().join(",");
      if (before === [...sectorIds].sort().join(",")) sectorIds = null;
      else changed.push("sector");
    }

    if (changed.length === 0) return { data: { ok: true } };

    const nextSectors = sectorIds;
    await atomic((q) => [
      ...(Object.keys(updates).length > 0
        ? [
            q
              .update(company)
              .set({ ...updates, lockedFields: [...locked], updatedAt: new Date() })
              .where(eq(company.id, co.id)),
          ]
        : []),
      ...(nextSectors
        ? [
            q.delete(companySector).where(eq(companySector.companyId, co.id)),
            ...(nextSectors.length > 0
              ? [
                  q
                    .insert(companySector)
                    .values(nextSectors.map((sectorId) => ({ companyId: co.id, sectorId }))),
                ]
              : []),
          ]
        : []),
    ]);

    revalidatePath(`/pipeline/${row.applicationId}`);
    revalidatePath("/pipeline");
    revalidatePath("/inbox");
    const label = updates.name ?? co.name;
    return {
      data: { ok: true },
      activity: {
        verb: "company.updated",
        entityType: "application",
        entityId: row.applicationId,
        entityLabel: label,
        summary: `${ctx.member.displayName} updated ${changed.join(", ")} on ${label}`,
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

/** Likely duplicates for a company a member is about to add. Read-only. */
export const checkDuplicates = authedAction({
  minRole: "analyst",
  input: z.object({
    companyName: z.string().max(120).optional(),
    domain: z.string().max(200).optional(),
    applicantEmail: z.string().max(200).optional(),
  }),
  handler: async (input, ctx) => {
    const candidates = await findDuplicateCandidates(ctx.org.id, input);
    if (candidates.length === 0) return { data: { candidates: [] } };
    const rows = await db
      .select({
        id: application.id,
        status: application.status,
        stageName: pipelineStage.name,
      })
      .from(application)
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, ctx.org.id),
          inArray(
            application.id,
            candidates.map((c) => c.applicationId)
          )
        )
      );
    const byId = new Map(rows.map((r) => [r.id, r]));
    return {
      data: {
        candidates: candidates.map((c) => ({
          ...c,
          refLabel: formatRef("application", c.ref),
          status: byId.get(c.applicationId)?.status ?? "open",
          stageName: byId.get(c.applicationId)?.stageName ?? "",
        })),
      },
    };
  },
});

/**
 * What the founder would receive if we decline now — shown in the decline
 * dialog so a member always reads the email before choosing to send it.
 */
export const getDeclineEmailPreview = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [app] = await db
      .select({
        id: application.id,
        applicantName: application.applicantName,
        applicantEmail: application.applicantEmail,
        companyName: company.name,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const [sent] = await db
      .select({ sentAt: notificationLog.sentAt })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.orgId, ctx.org.id),
          eq(notificationLog.kind, "founder_declined"),
          eq(notificationLog.key, app.id)
        )
      )
      .limit(1);

    const settings = orgSettings(ctx.org);
    const email = defaultFounderEmail("declined", {
      orgName: ctx.org.name,
      companyName: app.companyName,
      firstName: firstNameOf(app.applicantName),
    });
    return {
      data: {
        applicantEmail: app.applicantEmail,
        subject: email.subject,
        body: email.body,
        /** The club has switched on automatic decline emails. */
        clubSendsByDefault: settings.founderEmails.declined,
        alreadySentAt: sent?.sentAt.toISOString() ?? null,
        aiAvailable: aiConfigured() && settings.ai.enabled,
      },
    };
  },
});

/** Draft (never send) a decline letter from the reason and the member's note. */
export const draftDeclineLetterAction = authedAction({
  minRole: "analyst",
  input: z.object({
    applicationId: z.string().uuid(),
    declineReason: z.enum(DECLINE_REASONS),
    note: z.string().max(2000).optional(),
  }),
  handler: async (input, ctx) => {
    if (!aiConfigured() || !orgSettings(ctx.org).ai.enabled) {
      throw new ActionError("AI drafts are off — add an ANTHROPIC_API_KEY to enable them");
    }
    const [app] = await db
      .select({
        applicantName: application.applicantName,
        amountRequested: application.amountRequested,
        companyName: company.name,
        oneLiner: company.oneLiner,
      })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!app) throw new ActionError("Application not found");

    const letter = await draftDeclineLetter({
      orgName: ctx.org.name,
      companyName: app.companyName,
      founderFirstName: firstNameOf(app.applicantName),
      reasonLabel: DECLINE_REASON_LABELS[input.declineReason],
      note: input.note?.trim() || null,
      oneLiner: app.oneLiner,
      amountRequested: app.amountRequested,
    });
    if (!letter) throw new ActionError("Couldn't draft a letter just now — the default text is still there");
    return { data: { body: letter } };
  },
});

/**
 * Generate (or regenerate) the AI screening brief and store it on
 * application.custom.aiBrief. It is a labeled draft for the reader, never an
 * input to a decision — and it is built from application fields and notes
 * only: no demographics, no votes.
 */
export const generateScreeningBrief = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId: z.string().uuid() }),
  handler: async (input, ctx) => {
    if (!aiConfigured() || !orgSettings(ctx.org).ai.enabled) {
      throw new ActionError("AI drafts are off — add an ANTHROPIC_API_KEY to enable them");
    }
    const [row] = await db
      .select({ app: application, co: company, stageName: pipelineStage.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new ActionError("Application not found");
    const { app, co } = row;

    const [notes, chats] = await Promise.all([
      db
        .select({ body: applicationNote.body, author: member.displayName })
        .from(applicationNote)
        .innerJoin(member, eq(applicationNote.authorMemberId, member.id))
        .where(eq(applicationNote.applicationId, app.id))
        .orderBy(desc(applicationNote.createdAt))
        .limit(12),
      db
        .select({ debrief: coffeeChat.debrief })
        .from(coffeeChat)
        .where(eq(coffeeChat.applicationId, app.id))
        .orderBy(asc(coffeeChat.createdAt)),
    ]);

    const brief = await draftScreeningBrief({
      companyName: co.name,
      oneLiner: co.oneLiner,
      description: co.description,
      website: co.websiteUrl ?? co.domain,
      amountRequested: app.amountRequested,
      useOfFundsNarrative: app.useOfFundsNarrative,
      pitchSummary: app.pitchSummary,
      department: app.department,
      classYear: app.classYear,
      teamSize: app.teamSize,
      campusSource: app.campusSource,
      stageName: row.stageName,
      notes,
      coffeeChatDebriefs: chats.map((c) => c.debrief).filter((d): d is string => Boolean(d)),
    });
    if (!brief) throw new ActionError("Couldn't generate a brief just now — try again in a minute");

    const stored: StoredScreeningBrief = {
      ...brief,
      generatedAt: new Date().toISOString(),
      model: AI_MODEL,
    };
    // jsonb merge in SQL so a concurrent write to another custom key survives.
    await db
      .update(application)
      .set({
        custom: sql`${application.custom} || ${JSON.stringify({ aiBrief: stored })}::jsonb`,
      })
      .where(eq(application.id, app.id));

    revalidatePath(`/pipeline/${app.id}`);
    return {
      data: { ok: true },
      activity: {
        verb: "application.brief_generated",
        entityType: "application",
        entityId: app.id,
        entityLabel: co.name,
        summary: `${ctx.member.displayName} generated an AI screening brief for ${co.name}`,
      },
    };
  },
});

/** Sectors and deal sources for the new-application dialog, fetched when it opens. */
export const getNewApplicationOptions = authedAction({
  minRole: "analyst",
  input: z.object({}),
  handler: async (_input, ctx) => {
    const [sectors, sources] = await Promise.all([
      db
        .select({ id: sector.id, name: sector.name })
        .from(sector)
        .where(and(eq(sector.orgId, ctx.org.id), isNull(sector.archivedAt)))
        .orderBy(asc(sector.position), asc(sector.name)),
      db
        .select({ id: dealSource.id, name: dealSource.name })
        .from(dealSource)
        .where(and(eq(dealSource.orgId, ctx.org.id), isNull(dealSource.archivedAt)))
        .orderBy(asc(dealSource.name)),
    ]);
    return { data: { sectors, sources } };
  },
});
