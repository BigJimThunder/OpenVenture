import type { Instrumentation } from "next";

/**
 * Every server error Next.js catches — a page that failed to render, a route
 * handler or server action that threw — goes through the app's one error
 * reporter: a structured log line with a reference, and the optional
 * ERROR_WEBHOOK_URL. Without this, a failing page is a silent 500 that only
 * shows up if someone happens to read the logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // Imported here so the reporter is only loaded in the Node.js runtime.
  const { reportError } = await import("@/lib/report-error");
  const digest =
    typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined;
  reportError("request", error, {
    method: request.method,
    // The path without its query string: links can carry signed tokens.
    path: request.path.split("?")[0],
    route: context.routePath,
    kind: context.routeType,
    digest,
  });
};
