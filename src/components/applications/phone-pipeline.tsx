"use client";

import * as React from "react";
import { parseAsString, useQueryState } from "nuqs";
import { formatDistanceStrict } from "date-fns";
import { ArrowRightLeftIcon } from "lucide-react";
import { DECLINE_REASON_LABELS } from "@/lib/pipeline/labels";
import { cn, formatMoney } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph } from "@/components/patterns/priority-glyph";
import { OwnerAvatar } from "./owner-picker";
import { staleness } from "./board";
import { usePipeline } from "./pipeline-view";

/**
 * The pipeline on a phone: a row of stage chips with counts over one column
 * of cards. Tap a card to peek; tap the move button for a stage sheet —
 * dragging across seven columns on a 390px screen was never going to work.
 */
export function PhonePipeline() {
  const { stages, byStage, peekId, apps, openPeek, openMoveSheet, canEdit, now } = usePipeline();
  const [stageParam, setStageParam] = useQueryState("stage", parseAsString);

  const fallback =
    apps.find((a) => a.id === peekId)?.stageId ??
    stages.find((s) => (byStage.get(s.id)?.length ?? 0) > 0)?.id ??
    stages[0]?.id;
  const stage = stages.find((s) => s.id === stageParam) ?? stages.find((s) => s.id === fallback);
  if (!stage) return null;

  const cards = byStage.get(stage.id) ?? [];
  const total = cards.reduce((n, a) => n + Number(a.amountRequested ?? 0), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]"
        role="tablist"
        aria-label="Pipeline stage"
      >
        {stages.map((s) => {
          const active = s.id === stage.id;
          return (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={(e) => {
                void setStageParam(s.id);
                e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
              }}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                active
                  ? "border-accent bg-accent-subtle font-medium text-accent"
                  : "border-border bg-panel text-fg-muted active:bg-bg-subtle"
              )}
            >
              <StageDot colorToken={s.colorToken} />
              {s.name}
              <span className={cn("tnum text-xs", active ? "text-accent" : "text-fg-subtle")}>
                {byStage.get(s.id)?.length ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-2.5 pb-6">
        <div className="tnum mb-2 flex items-center justify-between px-0.5 text-xs text-fg-subtle">
          <span>
            {cards.length} {cards.length === 1 ? "application" : "applications"}
          </span>
          {total > 0 && <span>{formatMoney(total)} requested</span>}
        </div>

        {cards.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong/70 px-4 py-10 text-center text-sm text-fg-muted">
            Nothing in {stage.name} right now.
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {cards.map((app) => {
            const stale = staleness(app.enteredStageAt, stage.slaDays, now);
            return (
              <li
                key={app.id}
                className={cn(
                  "flex items-stretch rounded-lg border border-border bg-panel shadow-xs",
                  app.status === "declined" && "opacity-70"
                )}
              >
                <button
                  type="button"
                  onClick={() => openPeek(app.id)}
                  className="min-w-0 flex-1 rounded-l-lg px-3.5 py-3 text-left outline-none active:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-2xs text-fg-subtle">
                      {formatRef("application", app.ref)}
                    </span>
                    {app.priority !== "none" && <PriorityGlyph priority={app.priority} />}
                    <OwnerAvatar name={app.ownerName} className="ml-auto size-5 text-[9px]" />
                  </span>
                  <span className="mt-0.5 block truncate text-base font-medium">{app.companyName}</span>
                  {app.companyOneLiner && (
                    <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-fg-muted">
                      {app.companyOneLiner}
                    </span>
                  )}
                  <span className="tnum mt-2 flex items-center justify-between gap-2 text-xs text-fg-subtle">
                    <span className="font-medium text-fg-muted">
                      {app.amountRequested ? formatMoney(app.amountRequested) : "No ask yet"}
                    </span>
                    {app.status === "declined" && app.declineReason ? (
                      <span className="text-danger">
                        {DECLINE_REASON_LABELS[app.declineReason].toLowerCase()}
                      </span>
                    ) : app.status === "funded" ? (
                      <span className="text-success">funded</span>
                    ) : (
                      <span
                        className={cn(
                          stale === "late" && "text-warning",
                          stale === "very-late" && "text-danger"
                        )}
                      >
                        {formatDistanceStrict(new Date(app.enteredStageAt), now)} here
                      </span>
                    )}
                  </span>
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => openMoveSheet(app)}
                    aria-label={`Move ${app.companyName} to another stage`}
                    className="flex w-12 shrink-0 items-center justify-center rounded-r-lg border-l border-border text-fg-subtle outline-none active:bg-bg-subtle focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <ArrowRightLeftIcon className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
