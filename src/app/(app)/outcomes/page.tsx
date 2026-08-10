import { ComingSoon } from "@/components/patterns/coming-soon";

export const metadata = { title: "Outcomes" };

export default function OutcomesPage() {
  return (
    <ComingSoon
      title="Outcomes"
      description="Grantee outcome tiers — Dormant → Incorporated → Launched → Revenue → Raised → Accelerator → Acquired — with quarterly check-ins."
      phase="Phase 5"
    />
  );
}
