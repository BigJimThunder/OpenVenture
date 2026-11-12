"use client";

import { RouteError } from "@/components/patterns/route-error";

/** The new-member welcome flow. */
export default function StartError({
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
      title="This step didn't load"
      description="Nothing was lost. Try again, and if it keeps happening send an admin the reference below."
    />
  );
}
