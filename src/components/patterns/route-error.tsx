"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Full-page error screen for the routes outside the app shell (the public
 * application form, sign-in, the welcome flow). Same promise as the in-app
 * boundary: say what happened in plain words, offer "try again" and one
 * place that works, and show the reference an admin can match to the logs.
 * Each route's `error.tsx` supplies the words.
 */
export function RouteError({
  error,
  retry,
  title,
  description,
  exit = { href: "/", label: "Go to the home page" },
}: {
  error: Error & { digest?: string };
  retry: () => void;
  title: string;
  description: string;
  exit?: { href: Route; label: string };
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-chrome p-6 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-danger-bg text-danger">
        <TriangleAlertIcon className="size-5" aria-hidden />
      </span>
      <div role="alert">
        <h1 className="text-md font-semibold">{title}</h1>
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={() => retry()}>Try again</Button>
        <Button variant="secondary" asChild>
          <Link href={exit.href}>{exit.label}</Link>
        </Button>
      </div>
      {error.digest && (
        <code className="font-mono text-2xs text-fg-subtle">ref {error.digest}</code>
      )}
    </main>
  );
}
