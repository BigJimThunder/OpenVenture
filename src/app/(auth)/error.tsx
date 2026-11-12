"use client";

import { RouteError } from "@/components/patterns/route-error";

/** Sign-in and first-run setup. */
export default function AuthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={retry}
      title="This page didn't load"
      description="Nothing was changed. Try again, and if it keeps happening send an admin the reference below."
    />
  );
}
