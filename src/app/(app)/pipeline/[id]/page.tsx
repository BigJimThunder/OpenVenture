import { notFound } from "next/navigation";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { requireCtx, roleAtLeast } from "@/lib/actions/context";
import { getApplicationDetail } from "@/lib/queries/applications";
import { isOverdue } from "@/lib/queries/dashboard";
import { getPools } from "@/lib/queries/grants";
import { NewGrantDialog } from "@/components/grants/new-grant-dialog";
import { StartMemoButton } from "@/components/memos/start-memo-button";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { StageBadge } from "@/components/patterns/stage-badge";
import { Money } from "@/components/patterns/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StageStepper } from "@/components/applications/stage-stepper";
import { FactsEditor } from "@/components/applications/facts-editor";
import { NoteComposer } from "@/components/applications/note-composer";
import { EnrichButton } from "@/components/applications/enrich-button";
import { Scorecard } from "@/components/applications/scorecard";
import { CoffeeChatDialog } from "@/components/applications/coffee-chat-dialog";
import { CoffeeChatCard } from "@/components/applications/coffee-chat-card";
import { NextStepEditor } from "@/components/applications/next-step-editor";

export const dynamic = "force-dynamic";

export default async function ApplicationDetailPage({
  params,
}: PageProps<"/pipeline/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getApplicationDetail(ctx.org.id, id);
  if (!detail) notFound();

  const { app, company, stages, history, notes, chats, attendees, activeMembers, criteria, scores, memos, grants, owner } = detail;
  const currentStage = stages.find((s) => s.id === app.stageId);

  // Grant CTA: late-stage or funded, and no live grant yet.
  const hasLiveGrant = grants.some((g) => g.status !== "cancelled");
  const lateStage =
    currentStage?.requiresVote || currentStage?.kind === "won" || app.status === "funded";
  const pools = !hasLiveGrant && lateStage ? await getPools(ctx.org.id) : [];

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {company.name}
            {currentStage && (
              <StageBadge name={currentStage.name} colorToken={currentStage.colorToken} />
            )}
            {app.status !== "open" && (
              <Badge variant={app.status === "funded" ? "success" : "neutral"}>
                {app.status}
              </Badge>
            )}
          </span>
        }
        description={company.oneLiner ?? app.pitchSummary ?? undefined}
        actions={
          <>
          {!memos.some((mm) => mm.status !== "archived") && app.status === "open" && (
            <StartMemoButton applicationId={app.id} />
          )}
          {pools.length > 0 ? (
            <NewGrantDialog
              pools={pools}
              defaultPoolId={pools[0].id}
              prefillApplicationId={app.id}
              triggerLabel="Create grant"
              applications={[
                {
                  id: app.id,
                  companyId: company.id,
                  companyName: company.name,
                  amountRequested: app.amountRequested,
                  useOfFundsNarrative: app.useOfFundsNarrative,
                  stageName: currentStage?.name ?? "",
                },
              ]}
            />
          ) : null}
          </>
        }
      />

      <div className="px-6">
        <StageStepper
          stages={stages.filter((s) => s.kind === "active" || s.id === app.stageId)}
          currentStageId={app.stageId}
          applicationId={app.id}
        />
      </div>

      <div className="grid gap-3 px-6 pt-4 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle>The ask</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-fg-muted">Amount requested</span>
                <Money value={app.amountRequested} className="text-md font-semibold" />
              </div>
              {app.useOfFundsNarrative && (
                <>
                  <Separator />
                  <p className="text-sm leading-relaxed">{app.useOfFundsNarrative}</p>
                </>
              )}
              {app.pitchSummary && !company.oneLiner && (
                <p className="text-sm leading-relaxed text-fg-muted">{app.pitchSummary}</p>
              )}
            </CardContent>
          </Card>

          {criteria.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Screening</CardTitle>
              </CardHeader>
              <CardContent>
                <Scorecard
                  applicationId={app.id}
                  criteria={criteria.map((c) => {
                    const rows = scores.filter((s) => s.criterionId === c.id);
                    return {
                      id: c.id,
                      label: c.label,
                      description: c.description,
                      mean:
                        rows.length > 0
                          ? rows.reduce((n, s) => n + s.score, 0) / rows.length
                          : null,
                      count: rows.length,
                      myScore:
                        rows.find((s) => s.scoredByMemberId === ctx.member.id)?.score ?? null,
                    };
                  })}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Coffee chats</CardTitle>
              {app.status === "open" && (
                <CoffeeChatDialog
                  applicationId={app.id}
                  members={activeMembers}
                  viewerMemberId={ctx.member.id}
                />
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {chats.length === 0 && (
                <p className="text-sm text-fg-muted">
                  No coffee chats yet
                  {currentStage?.minAttendees
                    ? ` — ${currentStage.minAttendees} recorded verdicts are needed to advance past ${currentStage.name}.`
                    : "."}
                </p>
              )}
              {chats.map((c) => (
                <CoffeeChatCard
                  key={c.id}
                  chat={c}
                  attendees={attendees.filter((a) => a.coffeeChatId === c.id)}
                  viewerMemberId={ctx.member.id}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <NoteComposer applicationId={app.id} />
              {notes.map((n) => (
                <div key={n.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center justify-between text-2xs text-fg-subtle">
                    <span className="font-medium text-fg-muted">{n.authorName}</span>
                    <span>{formatDistanceToNow(n.createdAt, { addSuffix: true })}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">{n.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <FactsEditor
            applicationId={app.id}
            canEdit={roleAtLeast(ctx.member.role, "analyst")}
            facts={{
              applicantName: app.applicantName,
              applicantEmail: app.applicantEmail,
              department: app.department,
              classYear: app.classYear,
              campusSource: app.campusSource,
              teamSize: app.teamSize,
              ownerMemberId: app.ownerMemberId,
            }}
            website={{ url: company.websiteUrl, domain: company.domain }}
            ownerName={owner?.displayName ?? null}
            appliedAt={app.appliedAt}
            members={activeMembers}
          >
            <Separator />
            <NextStepEditor
              applicationId={app.id}
              nextStep={app.nextStep}
              nextStepDue={app.nextStepDue}
              overdue={isOverdue(app.nextStepDue)}
            />
            {(company.websiteUrl || company.domain) && (
              <>
                <Separator />
                <EnrichButton companyId={company.id} applicationId={app.id} />
              </>
            )}
          </FactsEditor>

          {(memos.length > 0 || grants.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Decision trail</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {memos.map((m) => (
                  <Link
                    key={m.id}
                    href={`/memos/${m.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-bg-subtle"
                  >
                    <span className="truncate">{m.title}</span>
                    <Badge variant="neutral">{m.status}</Badge>
                  </Link>
                ))}
                {grants.map((g) => (
                  <div key={g.id} className="flex items-center justify-between px-2 py-1">
                    <span>Grant · {formatMoney(g.amountAwarded)}</span>
                    <Badge variant={g.status === "reconciled" ? "success" : "info"}>
                      {g.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col">
              {history.map((h) => (
                <div key={h.id} className="border-b border-border py-2 text-xs last:border-0">
                  <div className="flex items-center justify-between">
                    <span>
                      → <span className="font-medium">{h.toStageName}</span>
                    </span>
                    <span className="text-2xs text-fg-subtle">
                      {format(h.movedAt, "MMM d")}
                    </span>
                  </div>
                  {h.movedByName && (
                    <div className="mt-0.5 text-2xs text-fg-subtle">by {h.movedByName}</div>
                  )}
                  {h.note && <p className="mt-1 text-fg-muted">{h.note}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
