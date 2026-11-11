"use server";

import { z } from "zod";
import { randomBytes, randomUUID } from "crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  organization,
  member,
  pipelineStage,
  sector,
  dealSource,
  screeningCriterion,
  memoTemplate,
  memoTemplateSection,
  onboardingTrack,
  onboardingTask,
  grantPool,
  activity,
} from "@/db/schema";
import {
  DEFAULT_STAGES,
  DEFAULT_SECTORS,
  DEFAULT_SCREENING_CRITERIA,
  DEFAULT_MEMO_SECTIONS,
  DEFAULT_ONBOARDING_TASKS,
  DEFAULT_SOURCES,
  DEFAULT_TIMEZONE,
} from "@/lib/defaults";
import { atomic } from "@/lib/pipeline/atomic";

const emailDomain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .max(120)
      .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/, "Enter a domain like university.edu")
  );

const SetupInput = z.object({
  clubName: z.string().trim().min(2, "Give the club a name").max(80),
  schoolName: z.string().trim().max(120).optional(),
  yourName: z.string().trim().max(80).optional(),
  emailDomain: emailDomain.optional(),
  poolBudget: z.coerce.number().min(0).max(10_000_000).default(10000),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  /** IANA name from the admin's browser; digests and deadlines use it. */
  timezone: z.string().max(64).optional(),
  /** Open the hosted application form at /apply straight away. */
  openApplications: z.boolean().default(true),
});

function validTimezone(tz: string | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * First-run bootstrap: creates the org, seeds defaults, and makes the
 * current signed-in user the admin. Only runs while the org table is empty —
 * afterwards new people join by invitation only.
 *
 * Everything is written as one unit, so a failure half-way can't leave a club
 * with an org row but no stages and nobody able to finish the job.
 */
export async function bootstrapOrg(raw: z.input<typeof SetupInput>) {
  const parsed = SetupInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false as const, error: "Please sign in first." };

  const existing = await db.select({ id: organization.id }).from(organization).limit(1);
  if (existing.length > 0) {
    return { ok: false as const, error: "This deployment is already set up. Ask an admin to invite you." };
  }

  const input = parsed.data;
  const slug = input.clubName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const email = session.user.email.toLowerCase();
  const orgId = randomUUID();
  const memberId = randomUUID();
  const templateId = randomUUID();
  const trackId = randomUUID();

  try {
    await atomic((q) => [
      q.insert(organization).values({
        id: orgId,
        name: input.clubName,
        slug: slug || "club",
        schoolName: input.schoolName || null,
        allowedEmailDomains: input.emailDomain ? [input.emailDomain] : [],
        timezone: validTimezone(input.timezone),
        ingestSecret: randomBytes(32).toString("hex"),
        settings: { apply: { enabled: input.openApplications } },
      }),
      q.insert(member).values({
        id: memberId,
        orgId,
        userId: session.user.id,
        email,
        displayName: input.yourName || session.user.name || email.split("@")[0],
        role: "admin",
        status: "active",
      }),
      q.insert(pipelineStage).values(
        DEFAULT_STAGES.map((s) => ({
          ...s,
          orgId,
          slaDays: "slaDays" in s ? s.slaDays : null,
          minAttendees: "minAttendees" in s ? s.minAttendees : null,
        }))
      ),
      q.insert(sector).values(DEFAULT_SECTORS.map((s, i) => ({ ...s, orgId, position: i }))),
      q.insert(dealSource).values(DEFAULT_SOURCES.map((s) => ({ ...s, orgId }))),
      q.insert(screeningCriterion).values(DEFAULT_SCREENING_CRITERIA.map((c) => ({ ...c, orgId }))),
      q.insert(memoTemplate).values({ id: templateId, orgId, name: "Grant memo", isDefault: true }),
      q.insert(memoTemplateSection).values(DEFAULT_MEMO_SECTIONS.map((s) => ({ ...s, templateId }))),
      q.insert(onboardingTrack).values({
        id: trackId,
        orgId,
        name: "New analyst",
        description: "What every new member does in their first two weeks.",
        isDefault: true,
      }),
      q.insert(onboardingTask).values(DEFAULT_ONBOARDING_TASKS.map((t) => ({ ...t, trackId }))),
      q.insert(grantPool).values({
        orgId,
        name: `FY${input.fiscalYear} Pool`,
        fiscalYear: input.fiscalYear,
        totalBudget: input.poolBudget.toFixed(2),
      }),
      q.insert(activity).values({
        orgId,
        actorMemberId: memberId,
        actorType: "system",
        verb: "org.created",
        entityType: "organization",
        entityId: orgId,
        summary: `${input.clubName} was set up on OpenVenture`,
      }),
    ]);
  } catch (e) {
    console.error("[setup] bootstrap failed", e);
    return { ok: false as const, error: "Setup didn't complete and nothing was saved. Try again." };
  }

  return { ok: true as const };
}
