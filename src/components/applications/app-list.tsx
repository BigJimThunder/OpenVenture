"use client";

import * as React from "react";
import { formatDistanceStrict } from "date-fns";
import type { PipelineData, PipelineApp } from "@/lib/queries/applications";
import { STATUS_LABELS } from "@/lib/pipeline/labels";
import { formatMoney, cn } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { StageDot } from "@/components/patterns/entity-ref";
import { PriorityGlyph } from "@/components/patterns/priority-glyph";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OwnerAvatar } from "./owner-picker";
import { usePipeline } from "./pipeline-view";

/** Stage order first (the funnel), newest applications first within a stage. */
export function sortForList(apps: PipelineApp[], stages: PipelineData["stages"]): PipelineApp[] {
  const stageOrder = new Map(stages.map((s, i) => [s.id, i]));
  return [...apps].sort((a, b) => {
    const so = (stageOrder.get(a.stageId) ?? 99) - (stageOrder.get(b.stageId) ?? 99);
    if (so !== 0) return so;
    return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
  });
}

export function AppList() {
  const { apps, stages, selectedId, peekId, openPeek, now } = usePipeline();
  const stageById = React.useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);
  const rows = React.useMemo(() => sortForList(apps, stages), [apps, stages]);

  return (
    <div
      // Scrolls, so it has to be reachable from the keyboard to be read to the end.
      tabIndex={0}
      role="group"
      aria-label="Applications"
      className="h-full overflow-y-auto px-4 pt-3 pb-6 outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Ref</TableHead>
            <TableHead className="w-8">
              <span className="sr-only">Priority</span>
            </TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Requested</TableHead>
            <TableHead className="text-right">In stage</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => {
            const stage = stageById.get(a.stageId);
            const active = peekId === a.id || selectedId === a.id;
            return (
              <TableRow
                key={a.id}
                data-app-id={a.id}
                onClick={() => openPeek(a.id)}
                className={cn("cursor-pointer", active && "bg-accent-subtle/50")}
              >
                <TableCell className="font-mono text-[10.5px] text-fg-subtle">
                  {formatRef("application", a.ref)}
                </TableCell>
                <TableCell>
                  <PriorityGlyph priority={a.priority} />
                </TableCell>
                <TableCell>
                  <span className="block max-w-64 truncate text-sm font-medium">{a.companyName}</span>
                  {a.companyOneLiner && (
                    <span className="block max-w-64 truncate text-2xs text-fg-muted">
                      {a.companyOneLiner}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {stage && (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <StageDot colorToken={stage.colorToken} />
                      {stage.name}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs text-fg-muted">
                    <OwnerAvatar name={a.ownerName} />
                    {a.ownerName ?? "Unassigned"}
                  </span>
                </TableCell>
                <TableCell className="tnum text-right text-xs">
                  {a.amountRequested ? formatMoney(a.amountRequested) : "—"}
                </TableCell>
                <TableCell className="tnum text-right text-xs text-fg-muted">
                  {formatDistanceStrict(new Date(a.enteredStageAt), now)}
                </TableCell>
                <TableCell>
                  {a.status !== "open" ? (
                    <Badge variant={a.status === "funded" ? "success" : "neutral"}>
                      {STATUS_LABELS[a.status]}
                    </Badge>
                  ) : (
                    <span className="text-2xs text-fg-subtle">Open</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
