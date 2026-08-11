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
 * The peek's action bar. Every action here has a single-key equivalent handled
 * by the board, so the buttons double as the shortcut legend.
 */
export function PeekActions({ applicationId }: { applicationId: string }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border px-3.5 py-2.5">
      <Link
        href={`/pipeline/${applicationId}`}
        className="flex h-6.5 items-center gap-1.5 rounded-[5px] bg-accent px-2.5 text-xs font-medium text-accent-fg transition-colors hover:bg-accent-hover"
      >
        Start blind vote
        <Kbd tone="on-accent">V</Kbd>
      </Link>
      <Link
        href={`/pipeline/${applicationId}`}
        className="flex h-6.5 items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg"
      >
        Open memo
        <Kbd>O</Kbd>
      </Link>
      <span className="ml-auto flex h-6.5 items-center gap-1.5 rounded-[5px] border border-border px-2.5 text-xs text-danger">
        Decline…
        <Kbd>D</Kbd>
      </span>
    </div>
  );
}
