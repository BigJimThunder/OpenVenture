"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateApplicationFacts } from "@/lib/actions/applications";
import { formatMoney } from "@/lib/utils";
import { useCan } from "@/components/shell/viewer";
import { InlineField } from "./inline-field";

type Patch = Omit<Parameters<typeof updateApplicationFacts>[0], "applicationId">;

/** The ask — amount, what it pays for, and the pitch — each editable in place. */
export function AskCard({
  applicationId,
  amountRequested,
  useOfFundsNarrative,
  pitchSummary,
}: {
  applicationId: string;
  amountRequested: string | null;
  useOfFundsNarrative: string | null;
  pitchSummary: string | null;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");

  async function save(patch: Patch) {
    const res = await updateApplicationFacts({ applicationId, ...patch });
    if (res.ok) router.refresh();
    return res.ok ? ({ ok: true } as const) : ({ ok: false, error: res.error } as const);
  }

  // Show "1500", not "1500.00", when editing a whole-dollar ask.
  const amountText = amountRequested == null ? null : String(Number(amountRequested));

  return (
    <section className="rounded-lg border border-border bg-panel shadow-xs">
      <div className="flex items-end justify-between gap-4 border-b border-border px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase">The ask</div>
          <div className="tnum mt-0.5 text-xl font-semibold tracking-tight">
            <InlineField
              label="Amount requested"
              type="number"
              value={amountText}
              canEdit={canEdit}
              placeholder="Add an amount"
              display={amountRequested != null ? formatMoney(amountRequested) : undefined}
              inputClassName="tnum h-9 w-40 text-lg font-semibold"
              onSave={(v) => save({ amountRequested: v })}
            />
          </div>
        </div>
        <span className="pb-1 text-xs text-fg-subtle">requested, non-dilutive</span>
      </div>
      <div className="grid gap-x-6 gap-y-4 px-4 py-3.5 md:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium text-fg-muted">What the money is for</div>
          <div className="text-sm leading-relaxed">
            <InlineField
              label="Use of funds"
              multiline
              value={useOfFundsNarrative}
              canEdit={canEdit}
              placeholder="Add what the grant pays for — filing fees, API credits, a prototype run…"
              maxLength={5000}
              onSave={(v) => save({ useOfFundsNarrative: v })}
            />
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-medium text-fg-muted">The pitch</div>
          <div className="text-sm leading-relaxed">
            <InlineField
              label="Pitch summary"
              multiline
              value={pitchSummary}
              canEdit={canEdit}
              placeholder="Add the pitch in the founder's words — what they're building and why now."
              maxLength={5000}
              onSave={(v) => save({ pitchSummary: v })}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
