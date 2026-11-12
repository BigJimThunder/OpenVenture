"use server";

import { z } from "zod";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  activity,
  application,
  applicationDemographics,
  applicationNote,
  coffeeChat,
  coffeeChatAttendee,
  company,
  contact,
  file,
  notificationLog,
  screeningScore,
} from "@/db/schema";
import { atomic } from "@/lib/pipeline/atomic";
import { formatRef } from "@/lib/refs";
import { ActionError, authedAction } from "./safe-action";

const ERASED = "Erased applicant";

/**
 * Erase a founder's personal data, for when they ask the club to.
 *
 * Removed, in one unit: the applicant's name and email, everything they wrote
 * (pitch, use of funds, how they heard), their academic details, the optional
 * demographic answers, attached files, the company's contacts, and the notes,
 * debriefs and score comments members wrote about them. If the company has no other
 * application, its name and profile go too, and the club's activity log
 * stops naming it.
 *
 * Kept, because they no longer identify anyone and the club's books depend
 * on them: the amounts, dates, stage history, decision and any grant. Memos
 * and vote rationales are the club's own documents and are not rewritten
 * here — the confirmation says so.
 *
 * Admin-only, never available to an access token, and not reversible.
 */
export const eraseApplicantData = authedAction({
  minRole: "admin",
  input: z.object({ applicationId: z.string().uuid() }),
  handler: async (input, ctx) => {
    const [row] = await db
      .select({ app: application, companyName: company.name })
      .from(application)
      .innerJoin(company, eq(application.companyId, company.id))
      .where(and(eq(application.id, input.applicationId), eq(application.orgId, ctx.org.id)))
      .limit(1);
    if (!row) throw new ActionError("Application not found");
    const { app, companyName } = row;
    if (app.erasedAt) throw new ActionError("This applicant's personal data has already been erased");

    const [others, chats] = await Promise.all([
      db
        .select({ id: application.id })
        .from(application)
        .where(and(eq(application.companyId, app.companyId), ne(application.id, app.id)))
        .limit(1),
      db.select({ id: coffeeChat.id }).from(coffeeChat).where(eq(coffeeChat.applicationId, app.id)),
    ]);
    const soleApplication = others.length === 0;
    const chatIds = chats.map((c) => c.id);
    const label = `${ERASED} (${formatRef("application", app.ref)})`;
    const now = new Date();

    await atomic((q) => [
      q
        .update(application)
        .set({
          applicantName: null,
          applicantEmail: null,
          pitchSummary: null,
          useOfFundsNarrative: null,
          department: null,
          major: null,
          school: null,
          classYear: null,
          campusSource: null,
          howHeard: null,
          sourceDetail: null,
          declineNote: null,
          nextStep: null,
          nextStepDue: null,
          // Drops duplicate hints and any AI brief: both quote the application.
          custom: { erased: true },
          erasedAt: now,
          updatedAt: now,
        })
        .where(and(eq(application.id, app.id), eq(application.orgId, ctx.org.id))),
      q.delete(applicationDemographics).where(eq(applicationDemographics.applicationId, app.id)),
      // Decks and receipts carry names and addresses; their bytes go with the rows.
      q.delete(file).where(and(eq(file.applicationId, app.id), eq(file.orgId, ctx.org.id))),
      q.delete(applicationNote).where(eq(applicationNote.applicationId, app.id)),
      q.update(screeningScore).set({ note: null }).where(eq(screeningScore.applicationId, app.id)),
      q.update(coffeeChat).set({ debrief: null, location: null }).where(eq(coffeeChat.applicationId, app.id)),
      ...(chatIds.length > 0
        ? [q.update(coffeeChatAttendee).set({ note: null }).where(inArray(coffeeChatAttendee.coffeeChatId, chatIds))]
        : []),
      ...(app.applicantEmail
        ? [
            q
              .update(notificationLog)
              .set({ recipient: null, summary: null })
              .where(and(eq(notificationLog.orgId, ctx.org.id), eq(notificationLog.recipient, app.applicantEmail))),
          ]
        : []),
      ...(soleApplication
        ? [
            q.delete(contact).where(and(eq(contact.companyId, app.companyId), eq(contact.orgId, ctx.org.id))),
            q
              .update(company)
              .set({
                name: label,
                legalName: null,
                domain: null,
                websiteUrl: null,
                logoUrl: null,
                linkedinUrl: null,
                oneLiner: null,
                description: null,
                fieldSources: {},
                updatedAt: now,
              })
              .where(and(eq(company.id, app.companyId), eq(company.orgId, ctx.org.id))),
            // The log keeps what happened and when, without the name.
            q
              .update(activity)
              .set({
                entityLabel: label,
                summary: sql`replace(${activity.summary}, ${companyName}, ${ERASED})`,
                diff: null,
              })
              .where(
                and(
                  eq(activity.orgId, ctx.org.id),
                  sql`(${activity.entityId} = ${app.id} or ${activity.entityId} = ${app.companyId} or ${activity.entityLabel} = ${companyName})`
                )
              ),
          ]
        : []),
    ]);

    revalidatePath(`/pipeline/${app.id}`);
    revalidatePath("/pipeline");
    return {
      data: { ok: true, companyAnonymized: soleApplication },
      activity: {
        verb: "application.personal_data_erased",
        entityType: "application",
        entityId: app.id,
        entityLabel: soleApplication ? label : companyName,
        summary: `${ctx.member.displayName} erased the applicant's personal data from ${formatRef("application", app.ref)} at their request`,
      },
    };
  },
});
