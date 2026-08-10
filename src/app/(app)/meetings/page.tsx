import { ComingSoon } from "@/components/patterns/coming-soon";

export const metadata = { title: "Meetings" };

export default function MeetingsPage() {
  return (
    <ComingSoon
      title="Meetings"
      description="Agendas that build themselves, two-tap attendance, run mode, and recap emails."
      phase="Phase 4"
    />
  );
}
