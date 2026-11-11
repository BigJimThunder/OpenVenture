import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { getRoster } from "@/lib/queries/members";
import { cn, initials } from "@/lib/utils";
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
import { PendingInvites } from "@/components/members/pending-invites";
import { ROLE_BADGE, classOf } from "@/components/members/member-labels";

export const metadata: Metadata = { title: "Members" };
export const dynamic = "force-dynamic";

type Row = Awaited<ReturnType<typeof getRoster>>[number];

const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : null);

function lastActive(m: Row): { label: string; stale: boolean } {
  if (m.status === "invited") return { label: "Hasn't signed in", stale: false };
  if (!m.lastActiveAt) return { label: "No activity yet", stale: true };
  const days = (Date.now() - m.lastActiveAt.getTime()) / 86_400_000;
  return {
    label: days < 1 ? "Today" : `${formatDistanceToNowStrict(m.lastActiveAt)} ago`,
    stale: days > 21,
  };
}

export default async function MembersPage() {
  const ctx = await requireCtx();
  const roster = await getRoster(ctx.org.id);
  const isAdmin = can(ctx.member.role, "manageMembers");

  const current = roster.filter((m) => m.status === "active" || m.status === "invited");
  const pending = current.filter((m) => m.status === "invited");
  const alumni = roster.filter((m) => m.status === "alumni");
  const active = current.length - pending.length;
  const alone = current.length <= 1;

  return (
    <div className="pb-10">
      <PageHeader
        title="Members"
        description={
          <span className="tnum">
            {active} active
            {pending.length > 0 && ` · ${pending.length} invited`}
            {alumni.length > 0 && ` · ${alumni.length} alumni`}
          </span>
        }
        actions={<InviteMemberDialog allowedDomains={ctx.org.allowedEmailDomains} />}
      />
      <div className="flex flex-col gap-6 px-4 md:px-6">
        {alone && (
          <div className="rounded-xl border border-dashed border-border-strong/70 bg-bg-subtle/40 px-5 py-5">
            <p className="text-base font-semibold">It&apos;s just you so far</p>
            <p className="mt-1 max-w-xl text-sm text-fg-muted">
              {isAdmin
                ? "The club's work — screening, coffee chats, votes — needs more than one person. Invite the other officers first; any admin can invite the rest."
                : "An admin can invite the rest of the club from this page."}
            </p>
            {isAdmin && (
              <ol className="mt-3 flex max-w-xl flex-col gap-1.5 text-sm text-fg-muted">
                <li>1. Invite someone with their school email and pick a role.</li>
                <li>2. They get a sign-in link by email. There are no passwords to set.</li>
                <li>3. They land on the default onboarding track, and show up here once they sign in.</li>
              </ol>
            )}
          </div>
        )}

        {isAdmin && pending.length > 0 && (
          <PendingInvites
            emailConfigured={Boolean(process.env.RESEND_API_KEY)}
            invites={pending.map((m) => ({
              id: m.id,
              displayName: m.displayName,
              email: m.email,
              role: m.role,
              invitedAt: m.joinedAt,
            }))}
          />
        )}

        <section aria-labelledby="roster-heading">
          <h2 id="roster-heading" className="sr-only">
            Roster
          </h2>

          {/* Desktop: the full table. */}
          <div className="hidden overflow-hidden rounded-lg border border-border bg-panel shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Cohort</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead className="text-right">Applications</TableHead>
                  <TableHead className="text-right">Memos</TableHead>
                  <TableHead className="text-right">Attendance</TableHead>
                  <TableHead className="w-32">Onboarding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {current.map((m) => {
                  const attendance = pct(m.meetingsAttended, m.meetingsRecorded);
                  const onboarding = pct(m.onboardingDone, m.onboardingTotal);
                  const seen = lastActive(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/members/${m.id}`} className="group flex items-center gap-2.5">
                          <Avatar className="size-7">
                            <AvatarFallback className="text-[10px]">{initials(m.displayName)}</AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-medium group-hover:underline">
                              {m.displayName}
                              {m.id === ctx.member.id && <span className="font-normal text-fg-subtle"> (you)</span>}
                            </span>
                            {m.title && <span className="block truncate text-xs text-fg-muted">{m.title}</span>}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ROLE_BADGE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                      </TableCell>
                      <TableCell className="text-fg-muted">
                        {[m.cohort, classOf(m.classYear)].filter(Boolean).join(" · ") || (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </TableCell>
                      <TableCell className={cn("tnum", seen.stale ? "text-fg-subtle" : "text-fg")}>
                        {seen.label}
                      </TableCell>
                      <TableCell className="tnum text-right">{m.applicationsOwned}</TableCell>
                      <TableCell className="tnum text-right">{m.memosWritten}</TableCell>
                      <TableCell className="tnum text-right">
                        {attendance == null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : (
                          <span className={attendance < 60 ? "text-warning" : undefined}>{attendance}%</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {onboarding == null ? (
                          <span className="text-fg-subtle">—</span>
                        ) : onboarding === 100 ? (
                          <span className="text-xs text-success">Complete</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Progress value={onboarding} className="w-16" />
                            <span className="tnum text-xs text-fg-muted">{onboarding}%</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Phones: one card per member, the same facts in two lines. */}
          <ul className="overflow-hidden rounded-lg border border-border bg-panel shadow-xs md:hidden">
            {current.map((m) => {
              const attendance = pct(m.meetingsAttended, m.meetingsRecorded);
              const onboarding = pct(m.onboardingDone, m.onboardingTotal);
              const seen = lastActive(m);
              return (
                <li key={m.id}>
                  <Link
                    href={`/members/${m.id}`}
                    className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0 active:bg-bg-subtle"
                  >
                    <Avatar className="size-9">
                      <AvatarFallback className="text-xs">{initials(m.displayName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{m.displayName}</span>
                        <Badge variant={ROLE_BADGE[m.role]}>{ROLE_LABEL[m.role]}</Badge>
                      </div>
                      <div className="tnum mt-0.5 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                        <span className={seen.stale ? "text-fg-subtle" : "text-fg"}>{seen.label}</span>
                        {attendance != null && (
                          <span className={attendance < 60 ? "text-warning" : undefined}>{attendance}% attendance</span>
                        )}
                        {onboarding != null && onboarding < 100 && <span>{onboarding}% onboarded</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {alumni.length > 0 && (
          <section aria-labelledby="alumni-heading">
            <h2 id="alumni-heading" className="mb-2 text-xs font-medium text-fg-muted">
              Alumni <span className="tnum text-fg-subtle">· {alumni.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {alumni.map((m) => (
                <Link
                  key={m.id}
                  href={`/members/${m.id}`}
                  className="flex min-h-8 items-center rounded-full border border-border bg-panel px-3 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg max-md:min-h-10"
                >
                  {m.displayName}
                  {classOf(m.classYear) && <span className="tnum ml-1 text-fg-subtle">{classOf(m.classYear)}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
