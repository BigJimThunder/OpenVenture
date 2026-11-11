"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { updateCompanyProfile } from "@/lib/actions/applications";
import type { ApplicationPriority, ApplicationStatus } from "@/db/schema";
import { STATUS_LABELS } from "@/lib/pipeline/labels";
import { useCan } from "@/components/shell/viewer";
import { Badge } from "@/components/ui/badge";
import { InlineField } from "./inline-field";
import { PriorityPicker } from "./priority-picker";
import { OwnerPicker } from "./owner-picker";

/**
 * The record header: ref, name, one-liner, and the two properties people
 * change most — priority and owner — as one-tap controls. Name and one-liner
 * edit in place.
 */
export function ApplicationHeader({
  applicationId,
  refLabel,
  companyName,
  oneLiner,
  status,
  priority,
  ownerId,
  ownerName,
  members,
  actions,
}: {
  applicationId: string;
  refLabel: string;
  companyName: string;
  oneLiner: string | null;
  status: ApplicationStatus;
  priority: ApplicationPriority;
  ownerId: string | null;
  ownerName: string | null;
  members: { id: string; displayName: string }[];
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");

  async function save(patch: { name?: string; oneLiner?: string | null }) {
    const res = await updateCompanyProfile({ applicationId, ...patch });
    if (res.ok) router.refresh();
    return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error } as const);
  }

  return (
    <header className="px-4 pt-4 pb-3 md:px-6 md:pt-5">
      <nav className="mb-1.5 flex items-center gap-1 text-xs text-fg-subtle" aria-label="Breadcrumb">
        <Link href="/pipeline" className="rounded transition-colors hover:text-fg max-md:py-2">
          Pipeline
        </Link>
        <ChevronRightIcon className="size-3" />
        <span className="font-mono">{refLabel}</span>
        {status !== "open" && (
          <Badge variant={status === "funded" ? "success" : status === "declined" ? "danger" : "neutral"} className="ml-1.5">
            {STATUS_LABELS[status]}
          </Badge>
        )}
      </nav>

      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight">
            <InlineField
              label="Company name"
              value={companyName}
              canEdit={canEdit}
              maxLength={120}
              inputClassName="h-9 text-lg font-semibold"
              onSave={(v) =>
                v ? save({ name: v }) : Promise.resolve({ ok: false, error: "A company needs a name" } as const)
              }
            />
          </h1>
          <div className="mt-0.5 max-w-2xl text-sm text-fg-muted">
            <InlineField
              label="One-liner"
              value={oneLiner}
              canEdit={canEdit}
              placeholder="Add a one-line description"
              maxLength={240}
              onSave={(v) => save({ oneLiner: v })}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 max-md:-ml-2">
          <PriorityPicker applicationId={applicationId} priority={priority} />
          <OwnerPicker
            applicationId={applicationId}
            ownerId={ownerId}
            ownerName={ownerName}
            members={members}
          />
          {actions}
        </div>
      </div>
    </header>
  );
}
