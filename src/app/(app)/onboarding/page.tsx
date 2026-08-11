import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCapIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getOnboardingMatrix } from "@/lib/queries/members";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { OnboardingMatrix } from "@/components/members/onboarding-matrix";

export const metadata: Metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const ctx = await requireCtx();
  const matrix = await getOnboardingMatrix(ctx.org.id);

  return (
    <div className="pb-10">
      <PageHeader
        title="Onboarding"
        description={
          matrix
            ? `${matrix.track.name} — least-complete first. Members check off their own row; admins can check anyone's.`
            : undefined
        }
      />
      <div className="px-6">
        {!matrix || matrix.rows.length === 0 ? (
          <EmptyState
            icon={<GraduationCapIcon />}
            title="No onboarding assignments yet"
            description="Invite a member and they'll get the default track automatically."
            action={
              <Link href="/members" className="text-sm text-accent hover:underline">
                Go to members →
              </Link>
            }
          />
        ) : (
          <OnboardingMatrix
            tasks={matrix.tasks.map((t) => ({ id: t.id, title: t.title }))}
            rows={matrix.rows.map((r) => ({
              assignmentId: r.assignmentId,
              memberId: r.memberId,
              memberName: r.memberName,
              completedAt: r.completedAt?.toISOString() ?? null,
              done: [...r.done],
            }))}
            viewerMemberId={ctx.member.id}
            viewerIsAdmin={ctx.member.role === "admin"}
          />
        )}
      </div>
    </div>
  );
}
