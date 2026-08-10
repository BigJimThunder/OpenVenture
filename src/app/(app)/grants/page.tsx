import { ComingSoon } from "@/components/patterns/coming-soon";

export const metadata = { title: "Grants" };

export default function GrantsPage() {
  return (
    <ComingSoon
      title="Grants"
      description="The pool, requests, approve → issue → reconcile, receipts, and budget burn-down."
      phase="Phase 2"
    />
  );
}
