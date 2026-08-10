import { ComingSoon } from "@/components/patterns/coming-soon";

export const metadata = { title: "Docs" };

export default function DocsPage() {
  return (
    <ComingSoon
      title="Docs"
      description="The internal wiki — club thesis, criteria, how-tos. Kills the Notion dependency."
      phase="Phase 4"
    />
  );
}
