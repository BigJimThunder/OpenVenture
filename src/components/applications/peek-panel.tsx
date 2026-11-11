import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { getApplicationPeek } from "@/lib/queries/applications";
import { effectiveRoundStatus } from "@/lib/votes/status";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { can } from "@/lib/permissions";
import type { MemberRole } from "@/db/schema";
import { formatRef } from "@/lib/refs";
import { formatMoney, initials } from "@/lib/utils";
import { Kbd } from "@/components/patterns/kbd";
import { StageDot } from "@/components/patterns/entity-ref";
import { PeekActions, PeekClose, type PeekPrimary } from "./peek-actions";
import { PriorityPicker } from "./priority-picker";
import { OwnerPicker } from "./owner-picker";
import { StageStepper } from "./stage-stepper";

type Stage = { id: string; name: string; colorToken: string; position: string; kind: string };

const shell =
  "flex w-100 shrink-0 flex-col border-l border-border bg-panel max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full max-md:border-l-0";

/**
 * The peek: enough to make a call without losing the board. Priority, owner
 * and stage change in place; anything that needs typing — notes, memo, ballot —
 * pushes to the full view. On a phone it is a full-height sheet.
 */
export async function PeekPanel({
  orgId,
  applicationId,
  stages,
  members,
  viewerRole,
}: {
  orgId: string;
  applicationId: string;
  stages: Stage[];
  members: { id: string; displayName: string }[];
  viewerRole: MemberRole;
}) {
  const peek = await getApplicationPeek(orgId, applicationId);
  if (!peek) return null;
  const { app, scoring, activities, latestMemo, activeRound, sectors, grant } = peek;

  const currentStage = stages.find((s) => s.id === app.stageId);
  const scored = scoring.filter((s) => s.mean != null);
  const canEdit = can(viewerRole, "contribute");
  const memoId = latestMemo && latestMemo.status !== "archived" ? latestMemo.id : null;

  // The next thing this application needs, from round STATUS only.
  const roundStatus = activeRound ? effectiveRoundStatus(activeRound) : null;
  const voteHref = activeRound?.memoId ? `/memos/${activeRound.memoId}/vote` : null;
  const primary: PeekPrimary =
    voteHref && roundStatus === "open"
      ? { href: voteHref, label: can(viewerRole, "vote") ? "Open ballot" : "View vote", key: "V" }
      : voteHref && roundStatus === "closed"
        ? { href: voteHref, label: "Voting closed — view", key: "V" }
        : voteHref && roundStatus === "revealed" && !activeRound?.outcome
          ? {
              href: voteHref,
              label: can(viewerRole, "runVotes") ? "Record decision" : "See the result",
              key: "V",
            }
          : memoId
            ? { href: `/memos/${memoId}`, label: "Open memo", key: "O" }
            : { href: `/pipeline/${app.id}`, label: "Open application", key: "↵" };

  return (
    <aside className={shell} aria-label={`${app.companyName} peek`}>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5 max-md:h-13">
        <span className="font-mono text-[11.5px] text-fg-subtle max-md:text-xs">
          {formatRef("application", app.ref)}
        </span>
        <span className="text-2xs text-fg-subtle max-md:hidden">peek</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/pipeline/${app.id}`}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-2xs text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg max-md:hidden"
          >
            open full
            <Kbd>↵</Kbd>
          </Link>
          <PeekClose />
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-border px-3.5 pt-4 pb-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-md font-semibold tracking-[-0.011em] max-md:text-lg">
              {app.companyName}
            </span>
            {currentStage && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted max-md:text-sm">
                <StageDot colorToken={currentStage.colorToken} />
                {currentStage.name}
              </span>
            )}
          </div>
          {app.companyOneLiner && (
            <p className="mt-1 text-xs text-fg-muted max-md:text-sm">{app.companyOneLiner}</p>
          )}
          <StageStepper
            size="compact"
            className="mt-3"
            stages={stages}
            currentStageId={app.stageId}
            applicationId={app.id}
            companyName={app.companyName}
          />
        </div>

        <dl className="flex flex-col gap-0.5 border-b border-border px-3.5 py-2.5">
          <Row label="Amount requested">
            <span className="tnum text-xs font-semibold max-md:text-sm">
              {app.amountRequested ? formatMoney(app.amountRequested) : "—"}
            </span>
          </Row>
          <Row label="Owner">
            <span className="-mr-1.5 flex min-w-0 items-center gap-1.5">
              <OwnerPicker
                applicationId={app.id}
                ownerId={app.ownerId}
                ownerName={app.ownerName}
                members={members}
              />
              {canEdit && (
                <span className="flex shrink-0 items-center gap-1 text-2xs text-fg-subtle max-md:hidden">
                  <Kbd>A</Kbd> me
                </span>
              )}
            </span>
          </Row>
          <Row label="Priority">
            <span className="-mr-1.5 flex items-center gap-1.5">
              <PriorityPicker applicationId={app.id} priority={app.priority} showKeys />
              {canEdit && (
                <span className="flex shrink-0 items-center gap-1 max-md:hidden">
                  <Kbd>1</Kbd>
                  <span className="text-2xs text-fg-subtle">–</span>
                  <Kbd>4</Kbd>
                </span>
              )}
            </span>
          </Row>
          {sectors.length > 0 && (
            <Row label="Sector">
              <span className="flex flex-wrap justify-end gap-x-2.5 gap-y-0.5 text-xs max-md:text-sm">
                {sectors.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5">
                    <StageDot colorToken={s.colorToken} />
                    {s.name}
                  </span>
                ))}
              </span>
            </Row>
          )}
          {app.applicantName && (
            <Row label="Founder">
              <span className="truncate text-xs max-md:text-sm">{app.applicantName}</span>
            </Row>
          )}
          {(app.department || app.classYear) && (
            <Row label="Department">
              <span className="text-xs max-md:text-sm">
                {[app.department, app.classYear ? `’${String(app.classYear).slice(2)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Row>
          )}
          {app.campusSource && (
            <Row label="Came via">
              <span className="text-xs max-md:text-sm">{app.campusSource}</span>
            </Row>
          )}
          <Row label="Applied">
            <span className="tnum text-xs max-md:text-sm">{format(app.appliedAt, "MMM d, yyyy")}</span>
          </Row>
          {app.nextStep && (
            <Row label="Next step">
              <span className={app.nextStepOverdue ? "text-xs text-danger max-md:text-sm" : "text-xs max-md:text-sm"}>
                {app.nextStep}
                {app.nextStepDue ? ` · ${format(app.nextStepDue, "MMM d")}` : ""}
              </span>
            </Row>
          )}
          {app.companyDomain && (
            <Row label="Website">
              <a
                href={app.websiteUrl ?? `https://${app.companyDomain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-accent hover:underline max-md:text-sm"
              >
                {app.companyDomain}
              </a>
            </Row>
          )}
          {app.status === "declined" && app.declineReason && (
            <Row label="Declined">
              <span className="text-xs text-danger max-md:text-sm">
                {DECLINE_REASON_LABELS[app.declineReason]}
              </span>
            </Row>
          )}
          {grant && (
            <Row label="Grant">
              <Link href="/grants" className="tnum text-xs text-accent hover:underline max-md:text-sm">
                {formatMoney(grant.amountAwarded)} {grant.status} · {grant.poolName}
              </Link>
            </Row>
          )}
        </dl>

        {app.status === "declined" && app.declineNote && (
          <section className="border-b border-border px-3.5 py-3">
            <SectionLabel>Why we passed</SectionLabel>
            <p className="text-xs leading-[1.55] text-fg-muted max-md:text-sm">{app.declineNote}</p>
          </section>
        )}

        {(app.useOfFundsNarrative || app.pitchSummary) && (
          <section className="border-b border-border px-3.5 py-3">
            <SectionLabel>The ask</SectionLabel>
            <p className="text-xs leading-[1.55] whitespace-pre-wrap text-fg-muted max-md:text-sm">
              {app.useOfFundsNarrative ?? app.pitchSummary}
            </p>
          </section>
        )}

        {scored.length > 0 && (
          <section className="border-b border-border px-3.5 py-3">
            <SectionLabel>Screening scores</SectionLabel>
            <div className="flex flex-col gap-[5px]">
              {scored.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-xs max-md:text-sm">{s.label}</span>
                  <span className="tnum shrink-0 text-[11.5px] text-fg-muted max-md:text-sm">
                    {s.mean!.toFixed(1)} / 5 · {s.count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {activities.length > 0 && (
          <section className="px-3.5 py-3">
            <SectionLabel>Activity</SectionLabel>
            <div className="flex flex-col gap-2.5">
              {activities.map((a) => (
                <div key={a.id} className="flex gap-2">
                  {a.actorName ? (
                    <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[7.5px] font-semibold text-accent">
                      {initials(a.actorName)}
                    </span>
                  ) : (
                    <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-cat-10" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs max-md:text-sm">{a.summary}</div>
                    <div className="text-[10.5px] text-fg-subtle max-md:text-xs">
                      {formatDistanceToNowStrict(a.occurredAt, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <PeekActions
        applicationId={app.id}
        companyName={app.companyName}
        primary={primary}
        status={app.status}
        lostStageId={stages.find((s) => s.kind === "lost")?.id ?? null}
        activeStages={stages
          .filter((s) => s.kind === "active")
          .map((s) => ({ id: s.id, name: s.name, colorToken: s.colorToken }))}
      />
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 max-md:min-h-10">
      <dt className="shrink-0 text-[11.5px] text-fg-subtle max-md:text-sm">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] font-medium tracking-[0.06em] text-fg-subtle uppercase">
      {children}
    </div>
  );
}

/** Skeleton shown while the peek streams in. */
export function PeekPanelSkeleton() {
  return (
    <aside className={shell} aria-busy>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5 max-md:h-13">
        <span className="h-3 w-14 animate-pulse rounded bg-bg-subtle" />
        <span className="ml-auto">
          <PeekClose />
        </span>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <span className="h-4 w-40 animate-pulse rounded bg-bg-subtle" />
        <span className="h-3 w-56 animate-pulse rounded bg-bg-subtle" />
        <span className="mt-2 h-5 w-full animate-pulse rounded bg-bg-subtle" />
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="h-3 w-full animate-pulse rounded bg-bg-subtle" />
        ))}
      </div>
    </aside>
  );
}
