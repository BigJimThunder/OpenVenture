import { after } from "next/server";
import { z } from "zod";
import Decimal from "decimal.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activity,
  application,
  applicationDemographics,
  company,
  member,
  organization,
  pipelineStage,
  stageHistory,
  TEAM_COMPOSITIONS,
  TEAM_STUDENT_MIX,
} from "@/db/schema";
import { pickAssignee } from "@/lib/automation/assign";
import { sendFounderEmail } from "@/lib/founder-emails";
import { appUrl, emailLayout, postSlack, sendEmailSafe, sendOnce, textToHtml } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import {
  findDuplicateCandidates,
  normalizeDomain,
  type DuplicateCandidate,
} from "@/lib/pipeline/duplicates";
import { formatRef } from "@/lib/refs";
import { withRef } from "@/lib/refs-server";
import { formatMoney } from "@/lib/utils";

/**
 * Application intake — the one way an application enters the pipeline from
 * outside the club, shared by the hosted form (/apply) and the signed webhook
 * (/api/ingest/application). Both are public surfaces: everything here is
 * validated, and nothing a founder sends decides who owns it or how it is
 * judged.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const intakeSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  website: optionalText(200),
  pitchSummary: optionalText(5000),
  amountRequested: z.coerce.number().min(0).max(1_000_000).optional(),
  useOfFunds: optionalText(5000),

  applicantName: optionalText(120),
  applicantEmail: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(200))
    .optional(),

  // Academic / team analytics fields (low-sensitivity, displayable)
  department: optionalText(120),
  major: optionalText(120),
  school: optionalText(120),
  classYear: z.coerce.number().int().min(2000).max(2100).optional(),
  teamSize: z.coerce.number().int().min(1).max(50).optional(),
  teamComposition: z.enum(TEAM_COMPOSITIONS).optional(),
  teamStudentMix: z.enum(TEAM_STUDENT_MIX).optional(),
  campusSource: optionalText(200),
  howHeard: optionalText(500),

  // Optional self-reported demographics — write-once, aggregate-read only.
  demographics: z
    .object({
      gender: optionalText(60),
      raceEthnicity: optionalText(120),
      firstGeneration: z.boolean().optional(),
      international: z.boolean().optional(),
    })
    .optional(),
});

export type IntakeInput = z.output<typeof intakeSchema>;
export type IntakeSource = "form" | "webhook";

export type IntakeResult =
  | { ok: true; applicationId: string; ref: number; duplicates: DuplicateCandidate[] }
  | { ok: false; reason: "no_entry_stage" };

type Org = typeof organization.$inferSelect;

/** Roles that can carry an application through the pipeline. */
const OWNER_ROLES = ["analyst", "partner", "admin"] as const;

async function chooseOwner(orgId: string) {
  const [candidates, loads, turns] = await Promise.all([
    db
      .select({ id: member.id, email: member.email, displayName: member.displayName })
      .from(member)
      .where(
        and(
          eq(member.orgId, orgId),
          eq(member.status, "active"),
          isNull(member.offboardedAt),
          inArray(member.role, [...OWNER_ROLES])
        )
      ),
    db
      .select({ memberId: application.ownerMemberId, n: sql<number>`count(*)::int` })
      .from(application)
      .innerJoin(pipelineStage, eq(application.stageId, pipelineStage.id))
      .where(
        and(
          eq(application.orgId, orgId),
          eq(application.status, "open"),
          eq(pipelineStage.kind, "active"),
          isNull(application.archivedAt)
        )
      )
      .groupBy(application.ownerMemberId),
    db
      .select({ memberId: activity.secondaryEntityId, at: sql<string>`max(${activity.occurredAt})` })
      .from(activity)
      .where(and(eq(activity.orgId, orgId), eq(activity.verb, "application.auto_assigned")))
      .groupBy(activity.secondaryEntityId),
  ]);
  const openBy = new Map(loads.map((l) => [l.memberId, l.n]));
  const lastBy = new Map(turns.map((t) => [t.memberId, new Date(t.at)]));
  return pickAssignee(
    candidates.map((c) => ({
      ...c,
      openCount: openBy.get(c.id) ?? 0,
      lastAssignedAt: lastBy.get(c.id) ?? null,
    }))
  );
}

/**
 * Create the company and application in the entry stage, assign an owner,
 * flag likely duplicates, and tell everyone who should know.
 *
 * The writes are awaited. The notifications run in `after()`, which keeps a
 * serverless function alive until they settle — so the founder gets a fast
 * response and nothing is dropped when the response returns.
 */
export async function receiveApplication(
  org: Org,
  input: IntakeInput,
  source: IntakeSource,
  /** How the notifications are scheduled; scripts outside a request pass their own. */
  defer: (task: () => Promise<void>) => void = after
): Promise<IntakeResult> {
  const [entry] = await db
    .select({ id: pipelineStage.id })
    .from(pipelineStage)
    .where(
      and(
        eq(pipelineStage.orgId, org.id),
        eq(pipelineStage.isEntryStage, true),
        isNull(pipelineStage.archivedAt)
      )
    )
    .limit(1);
  if (!entry) return { ok: false, reason: "no_entry_stage" };

  const settings = orgSettings(org);
  const domain = normalizeDomain(input.website) || null;
  const amount = input.amountRequested != null ? new Decimal(input.amountRequested).toFixed(2) : null;

  // Looked up before the insert so the new application can't match itself.
  // Candidates are a hint for a human: nothing is merged or declined here.
  const duplicates = await findDuplicateCandidates(
    org.id,
    { companyName: input.companyName, domain, applicantEmail: input.applicantEmail },
    { limit: 5 }
  );

  const owner = settings.automation.autoAssign === "round_robin" ? await chooseOwner(org.id) : null;

  // Reuse an existing company on domain match; otherwise create.
  let companyId: string | null = null;
  if (domain) {
    const [existing] = await db
      .select({ id: company.id })
      .from(company)
      .where(and(eq(company.orgId, org.id), eq(company.domain, domain)))
      .limit(1);
    companyId = existing?.id ?? null;
  }
  if (!companyId) {
    const [created] = await db
      .insert(company)
      .values({
        orgId: org.id,
        name: input.companyName,
        domain,
        websiteUrl: domain ? `https://${domain}` : null,
        oneLiner: input.pitchSummary?.slice(0, 200),
      })
      .returning({ id: company.id });
    companyId = created.id;
  }

  const app = await withRef(application, application.orgId, application.ref, org.id, async (ref) => {
    const [inserted] = await db
      .insert(application)
      .values({
        orgId: org.id,
        ref,
        companyId,
        stageId: entry.id,
        ownerMemberId: owner?.id,
        pitchSummary: input.pitchSummary,
        amountRequested: amount,
        useOfFundsNarrative: input.useOfFunds,
        applicantName: input.applicantName,
        applicantEmail: input.applicantEmail,
        department: input.department,
        major: input.major,
        school: input.school,
        classYear: input.classYear,
        teamSize: input.teamSize,
        teamComposition: input.teamComposition,
        teamStudentMix: input.teamStudentMix,
        campusSource: input.campusSource,
        howHeard: input.howHeard,
        custom: {
          intakeSource: source,
          ...(duplicates.length ? { duplicateCandidates: duplicates } : {}),
        },
      })
      .returning({ id: application.id, ref: application.ref });
    return inserted;
  });

  await db.insert(stageHistory).values({ orgId: org.id, applicationId: app.id, toStageId: entry.id });

  if (input.demographics && Object.values(input.demographics).some((v) => v != null)) {
    await db.insert(applicationDemographics).values({
      orgId: org.id,
      applicationId: app.id,
      gender: input.demographics.gender,
      raceEthnicity: input.demographics.raceEthnicity,
      firstGeneration: input.demographics.firstGeneration,
      international: input.demographics.international,
    });
  }

  const ask = amount ? ` asking ${formatMoney(amount)}` : "";
  const refLabel = formatRef("application", app.ref);
  await db.insert(activity).values([
    {
      orgId: org.id,
      actorType: "integration" as const,
      verb: "application.received",
      entityType: "application",
      entityId: app.id,
      entityLabel: input.companyName,
      summary: `New application: ${input.companyName}${ask}${
        source === "form" ? " (application form)" : ""
      }${duplicates.length ? ` — possible duplicate of ${formatRef("application", duplicates[0].ref)}` : ""}`,
    },
    ...(owner
      ? [
          {
            orgId: org.id,
            actorType: "system" as const,
            verb: "application.auto_assigned",
            entityType: "application",
            entityId: app.id,
            entityLabel: input.companyName,
            secondaryEntityType: "member",
            secondaryEntityId: owner.id,
            summary: `${input.companyName} was assigned to ${owner.displayName} (next in rotation)`,
          },
        ]
      : []),
  ]);

  const link = appUrl(`/pipeline/${app.id}`);
  const duplicateLine = duplicates.length
    ? `Possible duplicate of ${duplicates
        .map((d) => `${formatRef("application", d.ref)} ${d.companyName} (${d.reason})`)
        .join(", ")}.`
    : "";

  defer(async () => {
    await Promise.all([
      sendFounderEmail("received", app.id),
      postSlack(
        org,
        [
          `New application ${refLabel}: *${input.companyName}*${ask}`,
          input.pitchSummary ? `> ${input.pitchSummary.slice(0, 280).replace(/\n+/g, " ")}` : "",
          owner ? `Owner: ${owner.displayName}` : "No owner yet.",
          duplicateLine,
          `<${link}|Open in OpenVenture>`,
        ]
          .filter(Boolean)
          .join("\n")
      ),
      owner
        ? sendOnce(
            {
              orgId: org.id,
              kind: "intake_assigned",
              key: app.id,
              recipient: owner.email,
              summary: `${refLabel} ${input.companyName} → ${owner.displayName}`,
            },
            () =>
              sendEmailSafe({
                to: owner.email,
                subject: `New application for you: ${input.companyName}`,
                html: emailLayout({
                  orgName: org.name,
                  heading: `${refLabel} is yours to screen`,
                  bodyHtml: textToHtml(
                    [
                      `${input.companyName} just applied${ask ? `,${ask}` : ""}. You're next in the rotation, so it has been assigned to you.`,
                      input.pitchSummary ? `"${input.pitchSummary.slice(0, 400)}"` : "",
                      duplicateLine ? `${duplicateLine} Worth a look before you start.` : "",
                      "Screening takes about ten minutes: read the application, score it, then move it forward or decline with a reason. If you can't take it, reassign it from the application page.",
                    ]
                      .filter(Boolean)
                      .join("\n\n")
                  ),
                  cta: { label: "Open the application", url: link },
                  footer: `You're getting this because new applications at ${org.name} are assigned in rotation. An admin can change that in Settings.`,
                }),
              })
          )
        : null,
    ]);
  });

  return { ok: true, applicationId: app.id, ref: app.ref, duplicates };
}

/** The single org this deployment serves, or null before first-run setup. */
export async function loadSoleOrg(): Promise<Org | null> {
  const [org] = await db.select().from(organization).limit(1);
  return org ?? null;
}
