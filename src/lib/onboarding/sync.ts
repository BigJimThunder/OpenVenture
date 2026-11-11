import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, onboardingAssignment } from "@/db/schema";
import { getJourney, type Journey } from "./load";
import { entry } from "./progress";

/**
 * Bring the stored markers back in line with what a member has actually done:
 * each assignment's `completedAt`, and the member's `onboardedAt` once their
 * details are confirmed and nothing required is left. Call it after anything
 * that changes a tick, a profile or a track.
 *
 * `onboardedAt` is only ever set here, never cleared: a required item added to
 * a track later re-opens the assignment on the admin board, but it does not
 * throw an established member back out of the app.
 */
export async function syncOnboarding(
  orgId: string,
  memberId: string
): Promise<{ journey: Journey; justCompleted: boolean } | null> {
  const journey = await getJourney(orgId, memberId);
  if (!journey) return null;
  const now = new Date();
  let justCompleted = false;

  for (const a of journey.assignments) {
    const required = journey.items.filter((i) => i.assignmentId === a.id && i.required);
    const complete = journey.profileConfirmed && required.every((i) => i.completedAt);
    if (complete === Boolean(a.completedAt)) continue;
    await db
      .update(onboardingAssignment)
      .set({ completedAt: complete ? now : null })
      .where(eq(onboardingAssignment.id, a.id));
    a.completedAt = complete ? now : null;
    if (complete) justCompleted = true;
  }

  const { ready } = entry(journey.member, journey.items);
  if (ready && !journey.member.onboardedAt && journey.member.status === "active") {
    await db.update(member).set({ onboardedAt: now, updatedAt: now }).where(eq(member.id, memberId));
    journey.member.onboardedAt = now;
    justCompleted = true;
  }
  if (journey.stage !== "complete") justCompleted = false;
  return { journey, justCompleted };
}
