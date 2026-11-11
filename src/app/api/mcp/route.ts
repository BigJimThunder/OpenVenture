import { createHash } from "crypto";
import { getCtx } from "@/lib/actions/context";
import { mcpEnabled } from "@/lib/mcp/config";
import { handleRpc, PROTOCOL_VERSIONS, RPC, rpcError } from "@/lib/mcp/protocol";
import { createRateLimiter, MCP_REQUESTS_PER_MINUTE } from "@/lib/mcp/rate-limit";
import { createHost } from "@/lib/mcp/server";

/**
 * Model Context Protocol endpoint: lets a member's own AI assistant act as
 * them. Streamable HTTP in its stateless form — each POST carries JSON-RPC and
 * gets one JSON answer; there is no session and no SSE stream, so GET is 405.
 *
 * Auth is a personal access token and nothing else. A browser session is
 * deliberately NOT accepted here: the endpoint can write, route handlers have
 * no CSRF check, and refusing cookies is what makes the open CORS policy below
 * safe (another site can't make a signed-in browser act, because being signed
 * in gets it nothing).
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;

const limiter = createRateLimiter(MCP_REQUESTS_PER_MINUTE, 60_000);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...headers } });
}

function methodNotAllowed() {
  return json(rpcError(null, RPC.invalidRequest, "This endpoint answers POST only; it has no event stream."), 405, {
    Allow: "POST, OPTIONS",
  });
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (!mcpEnabled()) {
    return json(rpcError(null, RPC.invalidRequest, "The AI connection is switched off on this deployment."), 404);
  }

  const authorization = req.headers.get("authorization");
  const ctx = authorization ? await getCtx() : null;
  if (!ctx || ctx.via !== "token") {
    return json(
      rpcError(null, RPC.invalidRequest, "Send a personal access token: Authorization: Bearer ov_pat_… Create one at /connect."),
      401,
      { "WWW-Authenticate": 'Bearer realm="OpenVenture MCP"' }
    );
  }

  // Keyed by token, so one runaway assistant can't starve the member's other one.
  const limit = limiter.hit(createHash("sha256").update(authorization ?? "").digest("hex"));
  if (!limit.ok) {
    return json(
      rpcError(null, RPC.invalidRequest, `Too many requests. Try again in ${limit.retryAfterSeconds} seconds.`),
      429,
      { "Retry-After": String(limit.retryAfterSeconds) }
    );
  }

  // The header is optional on the wire; when a client sends one we don't speak, say so.
  const version = req.headers.get("mcp-protocol-version");
  if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return json(
      rpcError(null, RPC.invalidRequest, `Unsupported protocol version ${version}. Supported: ${PROTOCOL_VERSIONS.join(", ")}.`),
      400
    );
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json(rpcError(null, RPC.invalidRequest, "Request body too large."), 413);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json(rpcError(null, RPC.parseError, "Body is not valid JSON."), 400);
  }

  const response = await handleRpc(payload, createHost(ctx));
  // Only notifications: accepted, nothing to say.
  if (response === null) return new Response(null, { status: 202, headers: CORS });
  return json(response);
}
