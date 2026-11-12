import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { member, organization, type EmailCategory } from "@/db/schema";

export const EMAIL_CATEGORY_COPY: Record<EmailCategory, { label: string; description: string }> = {
  digest: {
    label: "Weekly digest",
    description: "One email on Monday with your applications, open votes and action items.",
  },
  reminders: {
    label: "Reminders",
    description: "Nudges about a vote closing, an application past its stage deadline, grantee check-ins and your class schedule.",
  },
};

/** Switch one kind of scheduled email on or off for a member. */
export async function setEmailPref(memberId: string, category: EmailCategory, on: boolean): Promise<void> {
  await db
    .update(member)
    .set({
      emailPrefs: sql`${member.emailPrefs} || ${JSON.stringify({ [category]: on })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(member.id, memberId));
}

/** Who an unsubscribe link is about — just enough to word the page. */
export async function unsubscribeSubject(memberId: string) {
  const [row] = await db
    .select({ email: member.email, prefs: member.emailPrefs, orgName: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.orgId, organization.id))
    .where(eq(member.id, memberId))
    .limit(1);
  return row ?? null;
}
