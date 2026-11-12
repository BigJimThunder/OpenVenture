"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { RefreshCwIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { generateScreeningBrief } from "@/lib/actions/applications";
import type { StoredScreeningBrief } from "@/lib/ai/screening";
import { useCan } from "@/components/shell/viewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * AI screening brief. Generating needs AI configured (the page decides);
 * the result is always labeled as a draft and only regenerated on request.
 */
export function ScreeningBriefCard({
  applicationId,
  brief,
  canGenerate,
}: {
  applicationId: string;
  brief: StoredScreeningBrief | null;
  /** AI is configured and switched on for this club. A stored brief still shows when it isn't. */
  canGenerate: boolean;
}) {
  const router = useRouter();
  const canEdit = useCan("contribute") && canGenerate;
  const [busy, setBusy] = React.useState(false);

  async function generate() {
    setBusy(true);
    const res = await generateScreeningBrief({ applicationId });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  if (!brief && !canEdit) return null;

  return (
    <section className="rounded-lg border border-border bg-panel shadow-xs">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <SparklesIcon className="size-4 text-fg-subtle" />
        <h2 className="text-sm font-semibold">Screening brief</h2>
        <Badge variant="neutral">AI draft</Badge>
        {brief && canEdit && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={generate} disabled={busy}>
            <RefreshCwIcon className={busy ? "animate-spin" : undefined} />
            {busy ? "Reading…" : "Regenerate"}
          </Button>
        )}
      </div>

      {!brief ? (
        <div className="flex flex-col items-start gap-2.5 px-4 pb-4">
          <p className="max-w-prose text-sm text-fg-muted">
            A one-screen read of this application before you screen it or meet the founder: what it
            is, the ask, strengths, risks, and questions worth asking. Built from the application
            and your notes only.
          </p>
          <Button size="sm" variant="secondary" onClick={generate} disabled={busy} className="max-md:h-10">
            <SparklesIcon />
            {busy ? "Reading the application…" : "Generate brief"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5 px-4 pb-4 text-sm">
          <div className="grid gap-3 md:grid-cols-2">
            <Block title="What it is">{brief.whatItIs}</Block>
            <Block title="The ask">{brief.theAsk}</Block>
          </div>
          <List title="Questions for the coffee chat" items={brief.openQuestions} emphasis />
          <div className="grid gap-3 md:grid-cols-2">
            <List title="Strengths" items={brief.strengths} />
            <List title="Risks" items={brief.risks} />
          </div>
          <p className="text-2xs text-fg-subtle">
            Generated {formatDistanceToNowStrict(new Date(brief.generatedAt), { addSuffix: true })} from
            the application and notes. It can be wrong — check it against the source before you rely
            on it.
          </p>
        </div>
      )}
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs font-medium text-fg-muted">{title}</div>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

function List({ title, items, emphasis }: { title: string; items: string[]; emphasis?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className={emphasis ? "rounded-md bg-bg-subtle px-3 py-2.5" : undefined}>
      <div className="mb-1 text-xs font-medium text-fg-muted">{title}</div>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 leading-relaxed">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-subtle" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
