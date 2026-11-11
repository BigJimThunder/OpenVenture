import Link from "next/link";
import type { organization } from "@/db/schema";
import { orgSettings } from "@/lib/org-settings";
import { getScheduleStatus } from "@/lib/queries/availability";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberScheduleDialog } from "./member-schedule-dialog";

/**
 * A member's schedule status on their profile. Shown to the member (with a
 * link to edit) and to admins (with a look at the week); the page decides who
 * sees it, and the dialog's server read enforces it again.
 */
export async function MemberScheduleCard({
  org,
  memberId,
  memberName,
  isSelf,
}: {
  org: typeof organization.$inferSelect;
  memberId: string;
  memberName: string;
  isSelf: boolean;
}) {
  const status = await getScheduleStatus(org, memberId);
  if (!status.term) return null;
  const { scheduling } = orgSettings(org);
  const first = memberName.trim().split(/\s+/)[0];
  const line = status.confirmedAt
    ? `Confirmed ${status.confirmedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: org.timezone })}${
        status.blockCount === 0 ? ", with an open week" : ""
      }.`
    : status.blockCount > 0
      ? `${status.blockCount} blocks entered, not confirmed yet.`
      : isSelf
        ? "Not entered yet. It takes about two minutes, and then nobody has to ask when you are free."
        : `${first} hasn't entered one, so the scheduler leaves them out rather than guess.`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>Class schedule</span>
          <span className="text-xs font-normal text-fg-muted">{status.term.name}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3 text-sm">
        <p className={status.confirmedAt ? "tnum text-fg-muted" : "tnum"}>{line}</p>
        {isSelf ? (
          <Button variant={status.confirmedAt ? "secondary" : "default"} size="sm" className="max-md:h-10" asChild>
            <Link href="/schedule">{status.confirmedAt ? "Edit my schedule" : "Enter my schedule"}</Link>
          </Button>
        ) : (
          (status.blockCount > 0 || status.confirmedAt) && (
            <MemberScheduleDialog
              memberId={memberId}
              memberName={first}
              window={{
                dayStartMinute: scheduling.dayStartMinute,
                dayEndMinute: scheduling.dayEndMinute,
                weekends: scheduling.weekends,
              }}
            />
          )
        )}
      </CardContent>
    </Card>
  );
}
