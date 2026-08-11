"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Kbd } from "@/components/patterns/kbd";

/** Closes the peek by clearing `?peek` — the board's Esc handler does the same. */
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
      className="cursor-pointer rounded px-1 py-0.5 text-fg-subtle transition-colors hover:bg-bg-subtle hover:text-fg"
    >
      <Kbd>Esc</Kbd>
    </button>
  );
}

/**
 * The peek's action bar. The primary button reflects where the application
 * actually is in the decision flow: vote if a round is live, memo if one
 * exists, otherwise start on the full view.
 */
export function PeekActions({
  applicationId,
  memoId,
  voteMemoId,
  canDecline,
}: {
  applicationId: string;
  memoId: string | null;
  voteMemoId: string | null;
  canDecline: boolean;
}) {
  const primary = voteMemoId
    ? { href: `/memos/${voteMemoId}/vote`, label: "Open ballot", key: "V" }
    : memoId
      ? { href: `/memos/${memoId}`, label: "Open memo", key: "O" }
      : { href: `/pipeline/${applicationId}`, label: "Open application", key: "↵" };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border px-3.5 py-2.5">
      <Link
        href={primary.href}
        className="flex h-6.5 items-center gap-1.5 rounded-[5px] bg-accent px-2.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        {primary.label}
        <Kbd tone="on-accent">{primary.key}</Kbd>
      </Link>
      {primary.href !== `/pipeline/${applicationId}` && (
        <Link
          href={`/pipeline/${applicationId}`}
          className="flex h-6.5 items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
        >
          Open application
          <Kbd>↵</Kbd>
        </Link>
      )}
      {canDecline && (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent("peek-decline", { detail: { applicationId } })
            )
          }
          className="ml-auto flex h-6.5 cursor-pointer items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-xs text-danger transition-colors hover:border-danger/50"
        >
          Decline…
          <Kbd>D</Kbd>
        </button>
      )}
    </div>
  );
}
