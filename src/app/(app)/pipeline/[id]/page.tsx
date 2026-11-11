import { notFound } from "next/navigation";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { ArrowRightIcon, CopyIcon, FileTextIcon, VoteIcon, WalletIcon } from "lucide-react";
import { requireCtx } from "@/lib/actions/context";
import { getApplicationDetail, getPipelineLookups } from "@/lib/queries/applications";
import { isOverdue } from "@/lib/queries/dashboard";
import { getPools } from "@/lib/queries/grants";
import { findDuplicateCandidates } from "@/lib/pipeline/duplicates";
import { nextAction } from "@/lib/pipeline/next-action";
import { effectiveRoundStatus } from "@/lib/votes/status";
import { readStoredBrief } from "@/lib/ai/screening";
import { aiConfigured } from "@/lib/ai";
import { orgSettings } from "@/lib/org-settings";
import { can } from "@/lib/permissions";
import { formatRef } from "@/lib/refs";
import { formatMoney, initials } from "@/lib/utils";
import { NewGrantDialog } from "@/components/grants/new-grant-dialog";
import { StartMemoButton } from "@/components/memos/start-memo-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApplicationHeader } from "@/components/applications/application-header";
import { StageStepper } from "@/components/applications/stage-stepper";
import { ApplicationFacts } from "@/components/applications/application-facts";
import { AskCard } from "@/components/applications/ask-card";
import { NoteComposer } from "@/components/applications/note-composer";
import { EnrichButton } from "@/components/applications/enrich-button";
import { Scorecard } from "@/components/applications/scorecard";
import { ScreeningBriefCard } from "@/components/applications/screening-brief";
import { CoffeeChatDialog } from "@/components/applications/coffee-chat-dialog";
import { CoffeeChatCard } from "@/components/applications/coffee-chat-card";
import { NextStepEditor } from "@/components/applications/next-step-editor";
import { AdvanceButton } from "@/components/applications/advance-button";
import { DeclineButton } from "@/components/applications/decline-button";
import { ReopenButton } from "@/components/applications/reopen-button";
import { DecisionSummary } from "@/components/applications/decision-summary";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/pipeline/[id]">): Promise<Metadata> {
  const ctx = await requireCtx();
  const { id } = await params;
  const detail = await getApplicationDetail(ctx.org.id, id);
  return { title: detail ? detail.company.name : "Application" };
}

/** Stage moves already have a history row — don't show them twice in the timeline. */
const MOVE_VERBS = new Set([
  "application.created",
  "application.stage_changed",
  "application.declined",
  "application.reopened",
]);

export default async function ApplicationDetailPage({ params }: PageProps<"/pipeline/[id]">) {
  const ctx = await requireCtx();
  const { id } = await params;
  const [detail, lookups] = await Promise.all([
    getApplicationDetail(ctx.org.id, id),
    getPipelineLookups(ctx.org.id),
  ]);
  if (!detail) notFound();

  const { app, company, stages, history, notes, chats, attendees, criteria, scores, activities, memos, grants, rounds, sectors, owner } = detail;
  const role = ctx.member.role;
  const canContribute = can(role, "contribute");
  const canRunVotes = can(role, "runVotes");

  const currentStage = stages.find((s) => s.id === app.stageId) ?? null;
  const activeStages = stages.filter((s) => s.kind === "active");
  const lostStage = stages.find((s) => s.kind === "lost") ?? null;
  const nextStage =
    currentStage?.kind === "active"
      ? (activeStages.find((s) => Number(s.position) > Number(currentStage.position)) ?? null)
      : null;

  const memo = memos.find((m) => m.status !== "archived") ?? null;
  const round = rounds[0] ?? null;
  const roundStatus = round ? effectiveRoundStatus(round) : null;
  const liveGrant = grants.find((g) => g.status !== "cancelled") ?? null;
  const voteHref = round?.memoId ? (`/memos/${round.memoId}/vote` as Route) : null;

  const verdictsByChat = new Map<string, number>();
  for (const a of attendees) {
    if (a.verdict) verdictsByChat.set(a.coffeeChatId, (verdictsByChat.get(a.coffeeChatId) ?? 0) + 1);
  }
  const maxVerdicts = Math.max(0, ...verdictsByChat.values());
  const scorerCount = new Set(scores.map((s) => s.scoredByMemberId)).size;

  const action = nextAction({
    status: app.status,
    stage: currentStage,
    nextStageName: nextStage?.name ?? null,
    memoStatus: memo?.status ?? null,
    round: round && roundStatus ? { status: roundStatus, outcome: round.outcome } : null,
    maxVerdicts,
    hasCriteria: criteria.length > 0,
    viewerHasScored: scores.some((s) => s.scoredByMemberId === ctx.member.id),
    grantStatus: liveGrant?.status ?? null,
  });

  // Someone who can't contribute gets the state of play, not an instruction.
  const directive = ["score", "advance", "coffee_chat", "start_memo"].includes(action.kind);
  const banner =
    !canContribute && directive
      ? {
          label: "Where it stands",
          title: `In ${currentStage?.name ?? "the pipeline"}`,
          detail:
            action.kind === "coffee_chat"
              ? "Members are meeting the founder and recording their verdicts."
              : action.kind === "start_memo"
                ? "A member writes the memo next; the club votes on it."
                : "Members are screening this application.",
        }
      : { label: action.kind === "closed" ? "Status" : "Next", title: action.title, detail: action.detail };

  const aiOn = aiConfigured() && orgSettings(ctx.org).ai.enabled;
  const brief = readStoredBrief(app.custom);

  const [pools, duplicates] = await Promise.all([
    action.kind === "propose_grant" && canContribute ? getPools(ctx.org.id) : Promise.resolve([]),
    app.status === "open"
      ? findDuplicateCandidates(
          ctx.org.id,
          { companyName: company.name, domain: company.domain, applicantEmail: app.applicantEmail },
          { excludeApplicationId: app.id }
        )
      : Promise.resolve([]),
  ]);

  const coffeeChatButton = (variant: "default" | "secondary") => (
    <CoffeeChatDialog
      applicationId={app.id}
      members={lookups.members}
      viewerMemberId={ctx.member.id}
      minAttendees={currentStage?.minAttendees}
      variant={variant}
    />
  );

  // The single control that goes with the next action, for this viewer's role.
  let actionControl: React.ReactNode = null;
  let actionWaiting: string | null = null;
  switch (action.kind) {
    case "score":
      if (canContribute) {
        actionControl = (
          <Button size="sm" asChild className="max-md:h-10">
            <a href="#screening">Score it</a>
          </Button>
        );
      }
      break;
    case "coffee_chat":
      if (canContribute) {
        // A chat exists and is short a verdict: point at it, don't log another.
        actionControl =
          maxVerdicts > 0 ? (
            <Button size="sm" asChild className="max-md:h-10">
              <a href="#coffee-chats">Go to the chat</a>
            </Button>
          ) : (
            coffeeChatButton("default")
          );
      }
      break;
    case "start_memo":
      if (canContribute) actionControl = <StartMemoButton applicationId={app.id} />;
      break;
    case "finish_memo":
      if (memo) {
        actionControl = (
          <Button size="sm" asChild className="max-md:h-10">
            <Link href={`/memos/${memo.id}`}>
              <FileTextIcon />
              Open the memo
            </Link>
          </Button>
        );
      }
      break;
    case "open_vote":
      if (memo && canRunVotes) {
        actionControl = (
          <Button size="sm" asChild className="max-md:h-10">
            <Link href={`/memos/${memo.id}`}>
              <VoteIcon />
              Open the vote from the memo
            </Link>
          </Button>
        );
      } else {
        actionWaiting = "Waiting for a partner to open the vote.";
      }
      break;
    case "vote":
      if (voteHref) {
        actionControl = (
          <Button size="sm" asChild className="max-md:h-10">
            <Link href={voteHref}>
              <VoteIcon />
              {can(role, "vote") ? "Go to your ballot" : "View the vote"}
            </Link>
          </Button>
        );
      }
      break;
    case "reveal":
    case "decide":
      if (voteHref && canRunVotes) {
        actionControl = (
          <Button size="sm" asChild className="max-md:h-10">
            <Link href={voteHref}>
              {action.kind === "reveal" ? "Reveal the ballots" : "Record the decision"}
              <ArrowRightIcon />
            </Link>
          </Button>
        );
      } else {
        actionWaiting =
          action.kind === "reveal"
            ? "Waiting for a partner to reveal the vote."
            : "Waiting for a partner to record the decision.";
        if (voteHref && action.kind === "decide") {
          actionControl = (
            <Button size="sm" variant="secondary" asChild className="max-md:h-10">
              <Link href={voteHref}>See the result</Link>
            </Button>
          );
        }
      }
      break;
    case "advance":
      if (canContribute && nextStage) {
        actionControl = (
          <AdvanceButton applicationId={app.id} toStageId={nextStage.id} toStageName={nextStage.name} />
        );
      }
      break;
    case "propose_grant":
      if (pools.length > 0) {
        actionControl = (
          <NewGrantDialog
            pools={pools}
            defaultPoolId={pools[0].id}
            prefillApplicationId={app.id}
            triggerLabel="Propose grant"
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
        );
      } else if (canContribute) {
        actionWaiting = "Create a grant pool on the Grants page first.";
      }
      break;
    default:
      break;
  }

  const showDecision = app.status === "funded" || app.status === "declined";
  const inconclusive = round?.outcome === "revisit" || round?.outcome === "no_quorum";

  // One timeline: stage moves (with time-in-stage) and everything else that happened.
  const timeline = [
    ...history.map((h) => ({
      id: `h-${h.id}`,
      at: h.movedAt,
      actor: h.movedByName,
      text: `Moved to ${h.toStageName}`,
      note: h.note,
    })),
    ...activities
      .filter((a) => !MOVE_VERBS.has(a.verb))
      .map((a) => ({ id: `a-${a.id}`, at: a.occurredAt, actor: a.actorName, text: a.summary, note: null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="pb-12">
      <ApplicationHeader
        applicationId={app.id}
        refLabel={formatRef("application", app.ref)}
        companyName={company.name}
        oneLiner={company.oneLiner}
        status={app.status}
        priority={app.priority}
        ownerId={app.ownerMemberId}
        ownerName={owner?.displayName ?? null}
        members={lookups.members}
        actions={
          app.status === "open" && lostStage ? (
            <DeclineButton applicationId={app.id} companyName={company.name} lostStageId={lostStage.id} />
          ) : null
        }
      />

      <div className="px-4 md:px-6">
        <StageStepper
          stages={stages.filter((s) => s.kind === "active" || s.id === app.stageId)}
          currentStageId={app.stageId}
          applicationId={app.id}
          companyName={company.name}
        />
      </div>

      <div className="grid gap-4 px-4 pt-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {showDecision ? (
            <DecisionSummary
              outcome={app.status === "funded" ? "funded" : "declined"}
              decidedAt={app.decidedAt}
              declineReason={app.declineReason}
              declineNote={app.declineNote}
              outcomeNote={round?.outcomeNote}
              grant={liveGrant}
              links={[
                ...(liveGrant ? [{ href: "/grants" as Route, label: "View grant" }] : []),
                ...(voteHref && round?.status === "revealed" ? [{ href: voteHref, label: "See the vote" }] : []),
              ]}
            >
              {actionControl}
              {app.status === "declined" && (
                <ReopenButton applicationId={app.id} companyName={company.name} stages={activeStages} />
              )}
            </DecisionSummary>
          ) : (
            <section
              className="flex flex-col gap-3 rounded-lg border border-accent/30 bg-accent-subtle/50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              aria-label="Next step"
            >
              <div className="min-w-0">
                <div className="text-2xs font-medium tracking-[0.06em] text-accent uppercase">
                  {banner.label}
                </div>
                <div className="mt-0.5 text-base font-semibold">{banner.title}</div>
                <p className="mt-0.5 max-w-prose text-sm text-fg-muted">{actionWaiting ?? banner.detail}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {actionControl}
                {action.kind === "closed" && (
                  <ReopenButton applicationId={app.id} companyName={company.name} stages={activeStages} />
                )}
              </div>
            </section>
          )}

          {!showDecision && inconclusive && round && (
            <DecisionSummary
              outcome={round.outcome!}
              outcomeNote={round.outcomeNote}
              nextStep={app.nextStep}
              links={voteHref ? [{ href: voteHref, label: "See the vote" }] : []}
            />
          )}

          {duplicates.length > 0 && (
            <section className="rounded-lg border border-warning-border bg-warning-bg px-4 py-3" aria-label="Possible duplicates">
              <div className="flex items-center gap-1.5 text-sm font-medium text-warning">
                <CopyIcon className="size-3.5" />
                {duplicates.length === 1 ? "Possible duplicate" : "Possible duplicates"}
              </div>
              <ul className="mt-1.5 flex flex-col gap-1">
                {duplicates.map((d) => (
                  <li key={d.applicationId} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <Link
                      href={`/pipeline/${d.applicationId}`}
                      className="font-medium underline-offset-2 hover:underline max-md:py-1.5"
                    >
                      <span className="font-mono text-xs text-fg-muted">{formatRef("application", d.ref)}</span>{" "}
                      {d.companyName}
                    </Link>
                    <span className="text-xs text-fg-muted">{d.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-fg-muted">
                If it&apos;s the same company applying twice, decline one with the reason
                &ldquo;Duplicate&rdquo;.
              </p>
            </section>
          )}

          <AskCard
            applicationId={app.id}
            amountRequested={app.amountRequested}
            useOfFundsNarrative={app.useOfFundsNarrative}
            pitchSummary={app.pitchSummary}
          />

          {aiOn || brief ? (
            <ScreeningBriefCard applicationId={app.id} brief={brief} canGenerate={aiOn} />
          ) : (
            canContribute &&
            !aiConfigured() && (
              <p className="px-1 text-xs text-fg-subtle">
                AI screening briefs are off. Add an ANTHROPIC_API_KEY to enable drafts.
              </p>
            )
          )}

          {criteria.length > 0 && (
            <Scorecard
              applicationId={app.id}
              scorerCount={scorerCount}
              locked={app.status !== "open"}
              criteria={criteria.map((c) => {
                const rows = scores.filter((s) => s.criterionId === c.id);
                return {
                  id: c.id,
                  label: c.label,
                  description: c.description,
                  mean: rows.length > 0 ? rows.reduce((n, s) => n + s.score, 0) / rows.length : null,
                  count: rows.length,
                  myScore: rows.find((s) => s.scoredByMemberId === ctx.member.id)?.score ?? null,
                };
              })}
            />
          )}

          <section id="coffee-chats" className="scroll-mt-4 rounded-lg border border-border bg-panel shadow-xs">
            <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2.5">
              <div>
                <h2 className="text-sm font-semibold">Coffee chats</h2>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {currentStage?.minAttendees
                    ? `${currentStage.minAttendees} members' verdicts on one chat are needed to advance past ${currentStage.name}.`
                    : "Members meet the founder, then each records a verdict."}
                </p>
              </div>
              {canContribute && app.status === "open" && (action.kind !== "coffee_chat" || maxVerdicts > 0) &&
                coffeeChatButton("secondary")}
            </div>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {chats.length === 0 && (
                <p className="rounded-md border border-dashed border-border-strong/70 px-3 py-5 text-center text-sm text-fg-muted">
                  {canContribute
                    ? "No coffee chats yet. Log one as soon as you've met the founder — it takes under a minute."
                    : "No coffee chats yet."}
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
            </div>
          </section>

          <section className="rounded-lg border border-border bg-panel shadow-xs">
            <h2 className="px-4 pt-3.5 pb-2.5 text-sm font-semibold">Notes</h2>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {canContribute && <NoteComposer applicationId={app.id} />}
              {notes.length === 0 && !canContribute && (
                <p className="text-sm text-fg-muted">No notes yet.</p>
              )}
              {notes.map((n) => (
                <div key={n.id} className="flex gap-2.5">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[9px] font-semibold text-accent">
                    {initials(n.authorName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 text-xs">
                      <span className="font-medium">{n.authorName}</span>
                      <span className="text-fg-subtle">
                        {formatDistanceToNowStrict(n.createdAt, { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-border bg-panel p-4 shadow-xs">
            <ApplicationFacts
              applicationId={app.id}
              facts={{
                applicantName: app.applicantName,
                applicantEmail: app.applicantEmail,
                department: app.department,
                classYear: app.classYear,
                teamSize: app.teamSize,
                campusSource: app.campusSource,
                sourceId: app.sourceId,
                sourceDetail: app.sourceDetail,
              }}
              company={{ domain: company.domain, websiteUrl: company.websiteUrl }}
              sectors={sectors}
              allSectors={lookups.sectors}
              sources={lookups.sources}
              appliedAt={app.appliedAt}
            />
            <div className="mt-3 border-t border-border pt-3">
              <NextStepEditor
                applicationId={app.id}
                nextStep={app.nextStep}
                nextStepDue={app.nextStepDue}
                overdue={isOverdue(app.nextStepDue)}
              />
            </div>
            {canContribute && (company.websiteUrl || company.domain) && (
              <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
                <EnrichButton companyId={company.id} applicationId={app.id} />
                <p className="text-2xs text-fg-subtle">
                  Fills empty fields from the company&apos;s own site. Anything you&apos;ve edited is left alone.
                </p>
              </div>
            )}
          </section>

          {(memos.length > 0 || rounds.length > 0 || grants.length > 0) && (
            <section className="rounded-lg border border-border bg-panel p-4 shadow-xs">
              <h2 className="mb-2 text-sm font-semibold">Decision trail</h2>
              <ul className="-mx-2 flex flex-col">
                {memos.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={`/memos/${m.id}`}
                      className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-bg-subtle max-md:min-h-11"
                    >
                      <FileTextIcon className="size-3.5 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1 truncate">{m.title}</span>
                      <Badge variant="neutral">{m.status.replace("_", " ")}</Badge>
                    </Link>
                  </li>
                ))}
                {rounds.map((r) => {
                  const status = effectiveRoundStatus(r);
                  const label = r.outcome ? r.outcome.replace("_", " ") : status === "revealed" ? "revealed" : status;
                  const row = (
                    <>
                      <VoteIcon className="size-3.5 shrink-0 text-fg-subtle" />
                      <span className="min-w-0 flex-1 truncate">
                        IC vote
                        {r.revealedAt ? ` · ${format(r.revealedAt, "MMM d")}` : ""}
                      </span>
                      <Badge
                        variant={
                          r.outcome === "fund"
                            ? "success"
                            : r.outcome === "decline"
                              ? "danger"
                              : status === "open"
                                ? "warning"
                                : "neutral"
                        }
                      >
                        {label}
                      </Badge>
                    </>
                  );
                  return (
                    <li key={r.id}>
                      {r.memoId ? (
                        <Link
                          href={`/memos/${r.memoId}/vote`}
                          className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-bg-subtle max-md:min-h-11"
                        >
                          {row}
                        </Link>
                      ) : (
                        <div className="flex min-h-9 items-center gap-2 px-2 text-sm">{row}</div>
                      )}
                    </li>
                  );
                })}
                {grants.map((g) => (
                  <li key={g.id}>
                    <Link
                      href="/grants"
                      className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-bg-subtle max-md:min-h-11"
                    >
                      <WalletIcon className="size-3.5 shrink-0 text-fg-subtle" />
                      <span className="tnum min-w-0 flex-1 truncate">
                        {formatMoney(g.amountAwarded)} · {g.poolName}
                      </span>
                      <Badge
                        variant={
                          g.status === "cancelled" ? "neutral" : g.status === "reconciled" ? "success" : "info"
                        }
                      >
                        {g.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-border bg-panel p-4 shadow-xs">
            <h2 className="mb-3 text-sm font-semibold">Activity</h2>
            <ol className="relative flex flex-col gap-3.5 before:absolute before:top-1 before:bottom-1 before:left-[7px] before:w-px before:bg-border">
              {timeline.map((t) => (
                <li key={t.id} className="relative flex gap-2.5">
                  {t.actor ? (
                    <span className="z-[1] flex size-[15px] shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[7px] font-semibold text-accent ring-2 ring-panel">
                      {initials(t.actor)}
                    </span>
                  ) : (
                    <span className="z-[1] m-[4px] size-[7px] shrink-0 rounded-full bg-border-strong ring-2 ring-panel" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs leading-snug">{t.text}</div>
                    {t.note && <p className="mt-0.5 text-xs text-fg-muted">{t.note}</p>}
                    <div className="tnum mt-0.5 text-2xs text-fg-subtle">
                      {t.actor && !t.text.startsWith(t.actor) ? `${t.actor} · ` : ""}
                      {format(t.at, "MMM d, yyyy")}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}
