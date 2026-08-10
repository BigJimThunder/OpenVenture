import { ComingSoon } from "@/components/patterns/coming-soon";

export const metadata = { title: "Cap Table Lab" };

export default function LabPage() {
  return (
    <ComingSoon
      title="Cap Table Lab"
      description="Dilution scenarios for grantees: pitch-comp SAFEs, accelerator deals, priced rounds — with 'show your work' on every number. The engine is built and fully tested; the UI ships in Phase 6."
      phase="Phase 6"
    />
  );
}
