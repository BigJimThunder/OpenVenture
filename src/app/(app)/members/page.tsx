import type { Metadata } from "next";
import Link from "next/link";
import { requireCtx } from "@/lib/actions/context";
import { getRoster } from "@/lib/queries/members";
import { initials } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InviteMemberDialog } from "@/components/members/invite-member-dialog";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

const ROLE_BADGE: Record<string, "default" | "info" | "neutral" | "outline"> = {
  admin: "default",
  partner: "info",
  analyst: "neutral",
  read_only: "outline",
};

export default async function MembersPage() {
  const ctx = await requireCtx();
  const roster = await getRoster(ctx.org.id);
  const active = roster.filter((m) => m.status === "active" || m.status === "invited");
  const alumni = roster.filter((m) => m.status === "alumni");

  return (
    <div className="pb-10">
      <PageHeader
        title="Members"
        description={`${active.length} current · ${alumni.length} alumni`}
        actions={ctx.member.role === "admin" ? <InviteMemberDialog /> : undefined}
      />
      <div className="flex flex-col gap-6 px-6">
        <div className="overflow-hidden rounded-lg border border-border bg-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Cohort</TableHead>
                <TableHead className="text-right">Apps owned</TableHead>
                <TableHead className="text-right">Memos</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="w-32">Onboarding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((m) => {
                const attendancePct =
                  m.meetingsRecorded > 0
                    ? Math.round((m.meetingsAttended / m.meetingsRecorded) * 100)
                    : null;
                const onboardingPct =
                  m.onboardingTotal > 0
                    ? Math.round((m.onboardingDone / m.onboardingTotal) * 100)
                    : null;
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/members/${m.id}`} className="flex items-center gap-2.5 hover:text-accent">
                        <Avatar className="size-6">
                          <AvatarFallback className="text-[9px]">
                            {initials(m.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{m.displayName}</span>
                        {m.status === "invited" && <Badge variant="warning">invited</Badge>}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_BADGE[m.role]}>{m.role.replace("_", " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-fg-muted">
                      {m.cohort ?? "—"}
                      {m.classYear ? ` · ’${String(m.classYear).slice(2)}` : ""}
                    </TableCell>
                    <TableCell className="tnum text-right">{m.applicationsOwned}</TableCell>
                    <TableCell className="tnum text-right">{m.memosWritten}</TableCell>
                    <TableCell className="tnum text-right">
                      {attendancePct == null ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <span className={attendancePct < 60 ? "text-warning" : undefined}>
                          {attendancePct}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {onboardingPct == null ? (
                        <span className="text-xs text-fg-subtle">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress value={onboardingPct} className="w-16" />
                          <span className="tnum text-2xs text-fg-muted">{onboardingPct}%</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {alumni.length > 0 && (
          <div>
            <h2 className="mb-2 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
              Alumni
            </h2>
            <div className="flex flex-wrap gap-2">
              {alumni.map((m) => (
                <Link
                  key={m.id}
                  href={`/members/${m.id}`}
                  className="flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1 text-xs text-fg-muted transition-colors hover:text-fg"
                >
                  {m.displayName}
                  {m.classYear ? ` ’${String(m.classYear).slice(2)}` : ""}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
