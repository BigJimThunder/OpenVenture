"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import type { PipelineData, PipelineApp } from "@/lib/queries/applications";
import { formatMoney, cn } from "@/lib/utils";
import { formatRef } from "@/lib/refs";
import { StageDot } from "@/components/patterns/entity-ref";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AppList({ data }: { data: PipelineData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const peekId = searchParams.get("peek");

  const stageById = React.useMemo(
    () => new Map(data.stages.map((s) => [s.id, s])),
    [data.stages]
  );

  function openPeek(id: string) {
    const next = new URLSearchParams(searchParams);
    if (peekId === id) next.delete("peek");
    else next.set("peek", id);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Stage order first (the funnel), newest applications first within a stage.
  const rows = React.useMemo(() => {
    const stageOrder = new Map(data.stages.map((s, i) => [s.id, i]));
    return [...data.apps].sort((a, b) => {
      const so = (stageOrder.get(a.stageId) ?? 99) - (stageOrder.get(b.stageId) ?? 99);
      if (so !== 0) return so;
      return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
    });
  }, [data]);

  return (
    <div className="px-4 pt-3 pb-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Ref</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Requested</TableHead>
            <TableHead className="text-right">Age</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((a) => (
            <ListRow
              key={a.id}
              app={a}
              stage={stageById.get(a.stageId)}
              active={peekId === a.id}
              onClick={() => openPeek(a.id)}
            />
          ))}
        </TableBody>
      </Table>
      {rows.length === 0 && (
        <p className="py-8 text-center text-sm text-fg-muted">No applications match these filters.</p>
      )}
    </div>
  );
}

function ListRow({
  app,
  stage,
  active,
  onClick,
}: {
  app: PipelineApp;
  stage: PipelineData["stages"][number] | undefined;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <TableRow
      onClick={onClick}
      className={cn("cursor-pointer", active && "bg-accent-subtle/40")}
    >
      <TableCell className="font-mono text-[10.5px] text-fg-subtle">
        {formatRef("application", app.ref)}
      </TableCell>
      <TableCell>
        <span className="block max-w-64 truncate text-sm font-medium">{app.companyName}</span>
        {app.companyOneLiner && (
          <span className="block max-w-64 truncate text-2xs text-fg-muted">
            {app.companyOneLiner}
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
      <TableCell className="text-xs text-fg-muted">{app.ownerName ?? "—"}</TableCell>
      <TableCell className="tnum text-right text-xs">
        {app.amountRequested ? formatMoney(app.amountRequested) : "—"}
      </TableCell>
      <TableCell className="tnum text-right text-xs text-fg-muted">
        {formatDistanceToNowStrict(app.appliedAt)}
      </TableCell>
      <TableCell>
        {app.status !== "open" ? (
          <Badge variant={app.status === "funded" ? "success" : "neutral"}>{app.status}</Badge>
        ) : (
          <span className="text-2xs text-fg-subtle">open</span>
        )}
      </TableCell>
    </TableRow>
  );
}
