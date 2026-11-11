"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { XIcon } from "lucide-react";
import { isTypingTarget, overlayOpen } from "@/components/shell/app-shell";
import { useCan } from "@/components/shell/viewer";
import { Kbd } from "@/components/patterns/kbd";
import { DeclineDialog } from "./decline-dialog";
import { ReopenButton } from "./reopen-button";

/** Closes the peek by clearing `?peek` — the pipeline's Esc handler does the same. */
export function PeekClose() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function close() {
    const next = new URLSearchParams(searchParams);
    next.delete("peek");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <button
      onClick={close}
      aria-label="Close peek"
      className="flex cursor-pointer items-center justify-center rounded-md text-fg-subtle transition-colors outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/40 max-md:size-10 md:px-1 md:py-0.5"
    >
      <XIcon className="size-5 md:hidden" />
      <Kbd className="hidden md:inline">Esc</Kbd>
    </button>
  );
}

export type PeekPrimary = { href: string; label: string; key: "V" | "O" | "↵" };

/**
 * The peek's action bar. The primary button is the next thing this
 * application needs (ballot, decision, memo, or just the full record); its
 * letter key works while the peek is open. Decline and Reopen sit on the right
 * for members who can contribute.
 */
export function PeekActions({
  applicationId,
  companyName,
  primary,
  status,
  lostStageId,
  activeStages,
}: {
  applicationId: string;
  companyName: string;
  primary: PeekPrimary;
  status: string;
  lostStageId: string | null;
  activeStages: { id: string; name: string; colorToken: string }[];
}) {
  const router = useRouter();
  const canEdit = useCan("contribute");
  const [declining, setDeclining] = React.useState(false);
  const fullHref = `/pipeline/${applicationId}`;

  // ↵ (open application) is handled by the pipeline view for the selection;
  // V and O only mean something for the application being peeked.
  React.useEffect(() => {
    if (primary.key === "↵") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target) || overlayOpen()) return;
      if (e.key.toUpperCase() === primary.key) {
        e.preventDefault();
        router.push(primary.href);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [primary.key, primary.href, router]);

  return (
    <div className="pb-safe flex shrink-0 items-center gap-2 border-t border-border px-3.5 py-2.5 max-md:py-3">
      <Link
        href={primary.href}
        className="flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover max-md:h-11 max-md:flex-1 max-md:justify-center max-md:text-base"
      >
        {primary.label}
        <Kbd tone="on-accent" className="max-md:hidden">
          {primary.key}
        </Kbd>
      </Link>
      {primary.href !== fullHref && (
        <Link
          href={fullHref}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg max-md:h-11 max-md:px-3.5 max-md:text-sm"
        >
          <span className="max-md:hidden">Open application</span>
          <span className="md:hidden">Details</span>
          <Kbd className="max-md:hidden">↵</Kbd>
        </Link>
      )}
      {canEdit && status === "open" && lostStageId && (
        <>
          <button
            type="button"
            onClick={() => setDeclining(true)}
            className="ml-auto flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-danger transition-colors outline-none hover:border-danger/50 focus-visible:ring-2 focus-visible:ring-danger/40 max-md:h-11 max-md:px-3.5 max-md:text-sm"
          >
            Decline…
            <Kbd className="max-md:hidden">D</Kbd>
          </button>
          <DeclineDialog
            target={declining ? { id: applicationId, companyName } : null}
            lostStageId={lostStageId}
            onClose={() => setDeclining(false)}
          />
        </>
      )}
      {status !== "open" && (
        <span className="ml-auto">
          <ReopenButton applicationId={applicationId} companyName={companyName} stages={activeStages} />
        </span>
      )}
    </div>
  );
}
