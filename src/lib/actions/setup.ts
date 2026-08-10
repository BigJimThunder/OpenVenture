"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
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
} from "@/lib/defaults";

const SetupInput = z.object({
  clubName: z.string().min(2).max(80),
  schoolName: z.string().max(120).optional(),
  emailDomain: z.string().max(120).optional(),
  poolBudget: z.coerce.number().min(0).max(10_000_000).default(10000),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
});

/**
 * First-run bootstrap: creates the org, seeds defaults, and makes the
 * current signed-in user the admin. Only runs while the org table is empty —
 * afterwards new people join by invitation only.
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

  const [org] = await db
    .insert(organization)
    .values({
      name: input.clubName,
      slug: slug || "club",
      schoolName: input.schoolName,
      allowedEmailDomains: input.emailDomain ? [input.emailDomain.replace(/^@/, "")] : [],
      ingestSecret: randomBytes(32).toString("hex"),
    })
    .returning();

  await db.insert(member).values({
    orgId: org.id,
    userId: session.user.id,
    email: session.user.email.toLowerCase(),
    displayName: session.user.name || session.user.email.split("@")[0],
    role: "admin",
    status: "active",
  });

  await db
    .insert(pipelineStage)
    .values(DEFAULT_STAGES.map((s) => ({ ...s, orgId: org.id, slaDays: "slaDays" in s ? s.slaDays : null, minAttendees: "minAttendees" in s ? s.minAttendees : null })));
  await db.insert(sector).values(DEFAULT_SECTORS.map((s, i) => ({ ...s, orgId: org.id, position: i })));
  await db.insert(dealSource).values(DEFAULT_SOURCES.map((s) => ({ ...s, orgId: org.id })));
  await db
    .insert(screeningCriterion)
    .values(DEFAULT_SCREENING_CRITERIA.map((c) => ({ ...c, orgId: org.id })));

  const [template] = await db
    .insert(memoTemplate)
    .values({ orgId: org.id, name: "Grant memo", isDefault: true })
    .returning();
  await db
    .insert(memoTemplateSection)
    .values(DEFAULT_MEMO_SECTIONS.map((s) => ({ ...s, templateId: template.id })));

  const [track] = await db
    .insert(onboardingTrack)
    .values({ orgId: org.id, name: "New analyst", isDefault: true })
    .returning();
  await db
    .insert(onboardingTask)
    .values(DEFAULT_ONBOARDING_TASKS.map((t) => ({ ...t, trackId: track.id })));

  await db.insert(grantPool).values({
    orgId: org.id,
    name: `FY${input.fiscalYear} Pool`,
    fiscalYear: input.fiscalYear,
    totalBudget: String(input.poolBudget),
  });

  await db.insert(activity).values({
    orgId: org.id,
    actorType: "system",
    verb: "org.created",
    entityType: "organization",
    entityId: org.id,
    summary: `${input.clubName} was set up on OpenVenture`,
  });

  return { ok: true as const };
}
