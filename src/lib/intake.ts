import { randomUUID } from "node:crypto";
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
import { appUrl, emailLayout, postSlack, sendEmailSafe, sendOnce, slackEscape, textToHtml } from "@/lib/notify";
import { orgSettings } from "@/lib/org-settings";
import {
  findDuplicateCandidates,
  normalizeDomain,
  type DuplicateCandidate,
} from "@/lib/pipeline/duplicates";
import { formatRef } from "@/lib/refs";
import { atomic, isUniqueViolation, lock } from "@/lib/pipeline/atomic";
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

  const ask = amount ? ` asking ${formatMoney(amount)}` : "";
  const hasDemographics =
    input.demographics != null && Object.values(input.demographics).some((v) => v != null);

  /**
   * Everything an application consists of — company, application, its first
   * stage-history row, demographics, the activity entries — is written as one
   * unit, so a failure can never leave a company with no application or an
   * application with no history.
   *
   * The reference number is allocated inside the unit, under a lock, so two
   * founders submitting in the same instant get consecutive numbers instead
   * of one of them getting an error.
   */
  const write = async () => {
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
    const newCompanyId = companyId ? null : randomUUID();
    const applicationId = randomUUID();
    const useCompanyId = companyId ?? newCompanyId!;

    const results = await atomic((q) => [
      lock(q, "application-ref", org.id),
      ...(newCompanyId
        ? [
            q.insert(company).values({
              id: newCompanyId,
              orgId: org.id,
              name: input.companyName,
              domain,
              websiteUrl: domain ? `https://${domain}` : null,
              oneLiner: input.pitchSummary?.slice(0, 200),
            }),
          ]
        : []),
      q
        .insert(application)
        .values({
          id: applicationId,
          orgId: org.id,
          ref: sql`(select coalesce(max(${application.ref}), 0) + 1 from ${application} where ${application.orgId} = ${org.id})`,
          companyId: useCompanyId,
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
        .returning({ id: application.id, ref: application.ref }),
      q.insert(stageHistory).values({ orgId: org.id, applicationId, toStageId: entry.id }),
      ...(hasDemographics
        ? [
            q.insert(applicationDemographics).values({
              orgId: org.id,
              applicationId,
              gender: input.demographics!.gender,
              raceEthnicity: input.demographics!.raceEthnicity,
              firstGeneration: input.demographics!.firstGeneration,
              international: input.demographics!.international,
            }),
          ]
        : []),
      q.insert(activity).values([
        {
          orgId: org.id,
          actorType: "integration" as const,
          verb: "application.received",
          entityType: "application",
          entityId: applicationId,
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
                entityId: applicationId,
                entityLabel: input.companyName,
                secondaryEntityType: "member",
                secondaryEntityId: owner.id,
                summary: `${input.companyName} was assigned to ${owner.displayName} (next in rotation)`,
              },
            ]
          : []),
      ]),
    ]);
    const inserted = results[newCompanyId ? 2 : 1] as { id: string; ref: number }[];
    return inserted[0];
  };

  // A unique-index collision means another request won a race this unit
  // could not see coming: the same new domain arriving twice, or a member
  // creating an application by hand at the same moment. Nothing was written,
  // so look again and retry.
  let app: { id: string; ref: number } | undefined;
  for (let attempt = 1; !app; attempt++) {
    try {
      app = await write();
    } catch (e) {
      if (attempt >= 4 || !isUniqueViolation(e)) throw e;
    }
  }
  const refLabel = formatRef("application", app.ref);

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
          // Founder-written text is escaped: Slack would otherwise read
          // `<!channel>` or a disguised `<url|label>` link out of it.
          `New application ${refLabel}: *${slackEscape(input.companyName)}*${ask}`,
          input.pitchSummary
            ? `> ${slackEscape(input.pitchSummary.slice(0, 280).replace(/\n+/g, " "))}`
            : "",
          owner ? `Owner: ${slackEscape(owner.displayName)}` : "No owner yet.",
          slackEscape(duplicateLine),
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
