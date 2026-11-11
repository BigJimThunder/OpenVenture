/**
 * Model Context Protocol, the JSON-RPC part — transport-free and pure, so it
 * can be tested without a server. The route handler (src/app/api/mcp) owns
 * HTTP: auth, rate limits, status codes.
 *
 * We serve tools and a few prompts over Streamable HTTP in its stateless form:
 * every POST is answered with one JSON body, no session id, no SSE stream.
 * The spec allows this, and it is what survives serverless.
 */

/** Newest first. A client asking for anything else is offered the newest. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === "string" && (PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : PROTOCOL_VERSIONS[0];
}

export const RPC = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

/** Thrown by a host to answer a request with a JSON-RPC error. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string
  ) {
    super(message);
    this.name = "RpcError";
  }
}

type RpcId = string | number;

export type RpcResponse =
  | { jsonrpc: "2.0"; id: RpcId; result: unknown }
  | { jsonrpc: "2.0"; id: RpcId | null; error: { code: number; message: string } };

export type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type PromptDescriptor = {
  name: string;
  title: string;
  description: string;
  arguments?: { name: string; description: string; required?: boolean }[];
};

export type PromptMessages = {
  description: string;
  messages: { role: "user"; content: { type: "text"; text: string } }[];
};

/** What the protocol layer needs from the application. */
export type McpHost = {
  serverInfo: { name: string; title: string; version: string };
  instructions: string;
  listTools(): unknown[];
  /** Throws RpcError(invalidParams) for a tool that doesn't exist. */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResult>;
  listPrompts(): PromptDescriptor[];
  /** Null for a prompt that doesn't exist. */
  getPrompt(name: string, args: Record<string, string>): PromptMessages | null;
};

export function rpcError(id: RpcId | null, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is RpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

async function dispatch(method: string, params: Record<string, unknown>, host: McpHost): Promise<unknown> {
  switch (method) {
    case "initialize":
      return {
        protocolVersion: negotiateProtocolVersion(params.protocolVersion),
        capabilities: {
          tools: { listChanged: false },
          prompts: { listChanged: false },
          resources: {},
        },
        serverInfo: host.serverInfo,
        instructions: host.instructions,
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: host.listTools() };
    case "tools/call": {
      if (typeof params.name !== "string" || params.name === "") {
        throw new RpcError(RPC.invalidParams, "tools/call needs a tool name");
      }
      const args = params.arguments ?? {};
      if (!isObject(args)) {
        throw new RpcError(RPC.invalidParams, "tools/call arguments must be an object");
      }
      return host.callTool(params.name, args);
    }
    case "prompts/list":
      return { prompts: host.listPrompts() };
    case "prompts/get": {
      if (typeof params.name !== "string") {
        throw new RpcError(RPC.invalidParams, "prompts/get needs a prompt name");
      }
      const raw = isObject(params.arguments) ? params.arguments : {};
      const args: Record<string, string> = {};
      for (const [key, value] of Object.entries(raw)) {
        if (typeof value === "string") args[key] = value;
      }
      const prompt = host.getPrompt(params.name, args);
      if (!prompt) throw new RpcError(RPC.invalidParams, `Unknown prompt: ${params.name}`);
      return prompt;
    }
    case "resources/list":
      return { resources: [] };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    default:
      throw new RpcError(RPC.methodNotFound, `Method not found: ${method}`);
  }
}

/** One message in, one response out — or null for a notification or a stray response. */
async function handleOne(message: unknown, host: McpHost): Promise<RpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return rpcError(null, RPC.invalidRequest, "Not a JSON-RPC 2.0 message");
  }
  const hasId = "id" in message;
  if (typeof message.method !== "string") {
    // A response to something we never asked, or garbage with an id.
    if ("result" in message || "error" in message) return null;
    return rpcError(isId(message.id) ? message.id : null, RPC.invalidRequest, "Missing method");
  }
  // Notifications (initialized, cancelled, progress) get no reply.
  if (!hasId) return null;
  if (!isId(message.id)) return rpcError(null, RPC.invalidRequest, "id must be a string or number");

  const params = message.params ?? {};
  if (!isObject(params)) return rpcError(message.id, RPC.invalidParams, "params must be an object");

  try {
    return { jsonrpc: "2.0", id: message.id, result: await dispatch(message.method, params, host) };
  } catch (e) {
    if (e instanceof RpcError) return rpcError(message.id, e.code, e.message);
    console.error("[mcp]", message.method, e);
    return rpcError(message.id, RPC.internalError, "Internal error");
  }
}

/**
 * Handle a decoded POST body. Returns the response (or responses, for a
 * batch), or null when there is nothing to say — the transport answers 202.
 */
export async function handleRpc(payload: unknown, host: McpHost): Promise<RpcResponse | RpcResponse[] | null> {
  if (Array.isArray(payload)) {
    if (payload.length === 0) return rpcError(null, RPC.invalidRequest, "Empty batch");
    const responses: RpcResponse[] = [];
    // In order, not in parallel: a batch may contain writes that depend on each other.
    for (const message of payload) {
      const response = await handleOne(message, host);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }
  return handleOne(payload, host);
}

export function toolText(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    ...(isObject(data) ? { structuredContent: data } : {}),
  };
}

export function toolFailure(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
