import { randomBytes } from "node:crypto";

/**
 * The one place server errors are reported.
 *
 * Every report is a single JSON line on stderr, so a log drain (Vercel, or
 * anything that reads stdout/stderr) can filter on `"level":"error"` and
 * `scope`, and each carries a short reference that is also shown to the
 * person who hit it. If ERROR_WEBHOOK_URL is set, the same payload is POSTed
 * there (Slack-compatible `text` included), so a club can be told about
 * failures without adding an error-tracking service.
 *
 * Never put request bodies, ballots or demographics in `context`.
 */

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export function errorRef(): string {
  return randomBytes(4).toString("hex");
}

export function describeError(error: unknown): { name: string; message: string; stack?: string; cause?: string } {
  if (error instanceof Error) {
    const cause = (error as { cause?: unknown }).cause;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack?.split("\n").slice(0, 12).join("\n"),
      ...(cause ? { cause: cause instanceof Error ? cause.message : String(cause) } : {}),
    };
  }
  return { name: "NonError", message: String(error) };
}

const recentlySent = new Map<string, number>();

/** Log the error and return its reference. Never throws. */
export function reportError(scope: string, error: unknown, context: ErrorContext = {}, ref = errorRef()): string {
  const described = describeError(error);
  const payload = {
    level: "error",
    scope,
    ref,
    at: new Date().toISOString(),
    ...described,
    ...context,
  };
  try {
    console.error(JSON.stringify(payload));
  } catch {
    console.error(`[${scope}] ${ref} ${described.message}`);
  }

  const webhook = process.env.ERROR_WEBHOOK_URL;
  if (webhook) {
    // At most one webhook per distinct error per five minutes per instance —
    // a broken page must not turn into a flood.
    const key = `${scope}:${described.name}:${described.message}`.slice(0, 200);
    const last = recentlySent.get(key) ?? 0;
    if (Date.now() - last > 5 * 60_000) {
      recentlySent.set(key, Date.now());
      if (recentlySent.size > 200) recentlySent.clear();
      void fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: `OpenVenture error [${scope}] ${described.name}: ${described.message} (ref ${ref})`,
          ...payload,
          stack: undefined,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    }
  }
  return ref;
}
