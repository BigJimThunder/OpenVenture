"use client";

import { RouteError } from "@/components/patterns/route-error";

/** A founder mid-application: never claim the form was or wasn't sent — we can't know here. */
export default function ApplyError({
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
      title="Something went wrong with the form"
      description="Try again in a moment. If you had already pressed Submit, check your inbox for a confirmation before sending it twice. If this keeps happening, tell the club and mention the reference below."
    />
  );
}
