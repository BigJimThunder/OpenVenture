"use client";

import * as React from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Screen-level error boundary. Keeps the shell (and the member's bearings)
 * intact when one screen's data fails, and offers the two things that
 * actually help: try again, or go somewhere that works.
 */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-bg text-danger">
        <TriangleAlertIcon className="size-5" />
      </span>
      <div>
        <h1 className="text-md font-semibold">This screen didn&apos;t load</h1>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">
          Nothing was lost — your data is safe. Try again, and if it keeps happening send an admin
          the reference below.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="secondary" asChild>
          <Link href="/inbox">Back to inbox</Link>
        </Button>
      </div>
      {error.digest && (
        <code className="font-mono text-2xs text-fg-subtle">ref {error.digest}</code>
      )}
    </div>
  );
}
