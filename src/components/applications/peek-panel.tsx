import Link from "next/link";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CheckIcon } from "lucide-react";
import { getApplicationPeek } from "@/lib/queries/applications";
import { formatRef } from "@/lib/refs";
import { cn, formatMoney, initials } from "@/lib/utils";
import { Kbd } from "@/components/patterns/kbd";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph, PRIORITY_LABELS } from "@/components/patterns/priority-glyph";
import { REASON_LABELS } from "./board";
import { PeekActions, PeekClose } from "./peek-actions";

type Stage = { id: string; name: string; colorToken: string; position: string };

/**
 * The peek: enough to make a call without losing the board. Anything that
 * needs typing — notes, memo, ballot — pushes to the full view instead.
 */
export async function PeekPanel({
  orgId,
  applicationId,
  stages,
}: {
  orgId: string;
  applicationId: string;
  stages: Stage[];
}) {
  const peek = await getApplicationPeek(orgId, applicationId);
  if (!peek) return null;
  const { app, scoring, activities } = peek;

  const currentIdx = stages.findIndex((s) => s.id === app.stageId);
  const scored = scoring.filter((s) => s.mean != null);

  return (
    <aside className="flex w-100 shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <span className="font-mono text-[11.5px] text-fg-subtle">
          {formatRef("application", app.ref)}
        </span>
        <span className="text-2xs text-fg-subtle">peek</span>
        <span className="ml-auto flex items-center gap-1.5">
          <Link
            href={`/pipeline/${app.id}`}
            className="flex items-center gap-1.5 rounded px-1 py-0.5 text-2xs text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
          >
            open full
            <Kbd>↵</Kbd>
          </Link>
          <PeekClose />
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-border px-3.5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-md font-semibold tracking-[-0.011em]">{app.companyName}</span>
            {currentIdx >= 0 && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted">
                <StageDot colorToken={stages[currentIdx].colorToken} />
                {stages[currentIdx].name}
              </span>
            )}
          </div>
          {app.companyOneLiner && (
            <p className="mt-1 text-xs text-fg-muted">{app.companyOneLiner}</p>
          )}

          {/* Stage stepper — where it's been, where it is, what's next. */}
          <div className="mt-3 flex items-center gap-1 overflow-x-auto">
            {stages.map((s, i) => {
              const done = currentIdx >= 0 && i < currentIdx;
              const active = i === currentIdx;
              return (
                <span
                  key={s.id}
                  className={cn(
                    "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-[5px] px-[7px] text-[10.5px] whitespace-nowrap",
                    active
                      ? "bg-accent-subtle font-semibold text-accent"
                      : done
                        ? "bg-bg-subtle text-fg-muted"
                        : "text-fg-subtle"
                  )}
                >
                  {done && <CheckIcon className="size-2.5" strokeWidth={3} />}
                  {!done && !active && <StageDot colorToken={s.colorToken} className="size-[5px]" />}
                  {s.name}
                </span>
              );
            })}
          </div>
        </div>

        <dl className="flex flex-col gap-[7px] border-b border-border px-3.5 py-3">
          <Row label="Amount requested">
            <span className="tnum text-xs font-semibold">
              {app.amountRequested ? formatMoney(app.amountRequested) : "—"}
            </span>
          </Row>
          <Row label="Owner">
            {app.ownerName ? (
              <span className="inline-flex items-center gap-1.5 text-xs">
                <span className="flex size-4 items-center justify-center rounded-full bg-accent-subtle text-[7.5px] font-semibold text-accent">
                  {initials(app.ownerName)}
                </span>
                {app.ownerName}
                <Kbd>A</Kbd>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                Unassigned <Kbd>A</Kbd>
              </span>
            )}
          </Row>
          <Row label="Priority">
            <span className="inline-flex items-center gap-1.5 text-xs">
              <PriorityGlyph priority={app.priority} />
              {PRIORITY_LABELS[app.priority]}
              <Kbd>P</Kbd>
            </span>
          </Row>
          {app.applicantName && (
            <Row label="Founder">
              <span className="text-xs">
                {app.applicantName}
                {app.applicantEmail ? ` · ${app.applicantEmail}` : ""}
              </span>
            </Row>
          )}
          {(app.department || app.classYear) && (
            <Row label="Department">
              <span className="text-xs">
                {[app.department, app.classYear ? `’${String(app.classYear).slice(2)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Row>
          )}
          {app.campusSource && (
            <Row label="Campus source">
              <span className="text-xs">{app.campusSource}</span>
            </Row>
          )}
          <Row label="Applied">
            <span className="tnum text-xs">{format(app.appliedAt, "MMM d, yyyy")}</span>
          </Row>
          {app.companyDomain && (
            <Row label="Website">
              <a
                href={app.websiteUrl ?? `https://${app.companyDomain}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-accent hover:underline"
              >
                {app.companyDomain}
              </a>
            </Row>
          )}
          {app.status === "declined" && app.declineReason && (
            <Row label="Declined">
              <span className="text-xs text-danger">{REASON_LABELS[app.declineReason]}</span>
            </Row>
          )}
        </dl>

        {(app.useOfFundsNarrative || app.pitchSummary) && (
          <section className="border-b border-border px-3.5 py-3">
            <SectionLabel>The ask</SectionLabel>
            <p className="text-xs leading-[1.55] text-fg-muted">
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
                  <span className="min-w-0 truncate text-xs">{s.label}</span>
                  <span className="tnum shrink-0 text-[11.5px] text-fg-muted">
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
                    <div className="text-xs">{a.summary}</div>
                    <div className="text-[10.5px] text-fg-subtle">
                      {formatDistanceToNowStrict(a.occurredAt, { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <PeekActions applicationId={app.id} />
    </aside>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-[10.5px] font-medium tracking-[0.06em] uppercase text-fg-subtle">
      {children}
    </div>
  );
}

/** Skeleton shown while the peek streams in. */
export function PeekPanelSkeleton() {
  return (
    <aside className="flex w-100 shrink-0 flex-col border-l border-border bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3.5">
        <span className="h-3 w-14 animate-pulse rounded bg-bg-subtle" />
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
