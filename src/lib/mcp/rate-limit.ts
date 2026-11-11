/**
 * Sliding-window request limiter, kept in process memory.
 *
 * On a long-lived server this is exact. On serverless each warm instance
 * keeps its own window, so the real ceiling is `limit × instances` — good
 * enough to stop a runaway assistant loop, not a security boundary. The limits
 * that matter (how many emails a token may send per day) are counted in the
 * database instead; see src/lib/mcp/actions.ts.
 */

export const MCP_REQUESTS_PER_MINUTE = 120;

export type RateLimiter = {
  /** Records a hit. `retryAfterSeconds` is set when the hit was refused. */
  hit(key: string, now?: number): { ok: true } | { ok: false; retryAfterSeconds: number };
};

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  let lastSweep = 0;

  return {
    hit(key, now = Date.now()) {
      // Forget idle keys now and then so the map can't grow without bound.
      if (now - lastSweep > windowMs) {
        lastSweep = now;
        for (const [k, times] of hits) {
          if (times.every((t) => now - t >= windowMs)) hits.delete(k);
        }
      }
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
