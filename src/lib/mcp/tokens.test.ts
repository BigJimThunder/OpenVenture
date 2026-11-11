import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { mcpEnabled } from "./config";
import { createRateLimiter } from "./rate-limit";
import { generateToken, isTokenFormat, tokenExpiry, tokenState, TOKEN_PREFIX } from "./tokens";

describe("generateToken", () => {
  it("makes a prefixed base64url token carrying 256 bits", () => {
    const { token } = generateToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    const secret = token.slice(TOKEN_PREFIX.length);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(isTokenFormat(token)).toBe(true);
  });

  it("stores a SHA-256 hex digest, never the token", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).not.toContain(token.slice(TOKEN_PREFIX.length, TOKEN_PREFIX.length + 8));
  });

  it("keeps a short recognisable prefix that reveals almost nothing", () => {
    const { token, prefix } = generateToken();
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix).toHaveLength(TOKEN_PREFIX.length + 6);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateToken().token));
    expect(tokens.size).toBe(200);
  });

  it("rejects things that are not tokens", () => {
    expect(isTokenFormat("ov_pat_short")).toBe(false);
    expect(isTokenFormat(`sk_${"a".repeat(43)}`)).toBe(false);
    expect(isTokenFormat(`ov_pat_${"a".repeat(42)}!`)).toBe(false);
  });
});

describe("expiry", () => {
  const now = new Date("2026-11-11T12:00:00Z");

  it("adds whole days, or never expires", () => {
    expect(tokenExpiry(90, now)?.toISOString()).toBe("2027-02-09T12:00:00.000Z");
    expect(tokenExpiry(null, now)).toBeNull();
  });

  it("classifies a token", () => {
    expect(tokenState({ revokedAt: null, expiresAt: null }, now)).toBe("active");
    expect(tokenState({ revokedAt: null, expiresAt: new Date("2026-11-12T00:00:00Z") }, now)).toBe("active");
    expect(tokenState({ revokedAt: null, expiresAt: now }, now)).toBe("expired");
    expect(tokenState({ revokedAt: new Date("2026-11-01T00:00:00Z"), expiresAt: null }, now)).toBe("revoked");
  });
});

describe("rate limiter", () => {
  it("allows up to the limit inside the window, then says when to retry", () => {
    const limiter = createRateLimiter(3, 60_000);
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("a", 10_000).ok).toBe(true);
    expect(limiter.hit("a", 20_000).ok).toBe(true);
    expect(limiter.hit("a", 30_000)).toEqual({ ok: false, retryAfterSeconds: 30 });
  });

  it("slides: the oldest hit ageing out frees a slot", () => {
    const limiter = createRateLimiter(2, 60_000);
    limiter.hit("a", 0);
    limiter.hit("a", 30_000);
    expect(limiter.hit("a", 59_999).ok).toBe(false);
    expect(limiter.hit("a", 60_000).ok).toBe(true);
  });

  it("counts each key on its own, and refused hits don't extend the wait", () => {
    const limiter = createRateLimiter(1, 60_000);
    expect(limiter.hit("a", 0).ok).toBe(true);
    expect(limiter.hit("b", 0).ok).toBe(true);
    expect(limiter.hit("a", 1_000).ok).toBe(false);
    expect(limiter.hit("a", 59_000).ok).toBe(false);
    expect(limiter.hit("a", 60_000).ok).toBe(true);
  });
});

describe("the off switch", () => {
  it("is on unless MCP_DISABLED is set to a truthy value", () => {
    const before = process.env.MCP_DISABLED;
    try {
      delete process.env.MCP_DISABLED;
      expect(mcpEnabled()).toBe(true);
      for (const value of ["", "0", "false", "no"]) {
        process.env.MCP_DISABLED = value;
        expect(mcpEnabled()).toBe(true);
      }
      for (const value of ["1", "true", "TRUE", " yes "]) {
        process.env.MCP_DISABLED = value;
        expect(mcpEnabled()).toBe(false);
      }
    } finally {
      if (before === undefined) delete process.env.MCP_DISABLED;
      else process.env.MCP_DISABLED = before;
    }
  });
});
