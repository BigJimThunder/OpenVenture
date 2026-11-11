import { describe, expect, it, vi } from "vitest";
import { describeTool, TOOL_NAMES, toolsFor, type ToolName } from "./catalog";
import {
  handleRpc,
  negotiateProtocolVersion,
  PROTOCOL_VERSIONS,
  RPC,
  RpcError,
  toolFailure,
  toolText,
  type McpHost,
  type RpcResponse,
} from "./protocol";

function host(overrides: Partial<McpHost> = {}): McpHost {
  return {
    serverInfo: { name: "openventure", title: "OpenVenture", version: "1.0.0" },
    instructions: "Call whoami first.",
    listTools: () => toolsFor("analyst", "read").map(describeTool),
    callTool: async (name, args) => {
      if (name !== "whoami") throw new RpcError(RPC.invalidParams, `Unknown tool: ${name}`);
      return toolText({ echoed: args });
    },
    listPrompts: () => [{ name: "weekly_review", title: "Weekly", description: "What needs me" }],
    getPrompt: (name) =>
      name === "weekly_review"
        ? { description: "What needs me", messages: [{ role: "user", content: { type: "text", text: "Go" } }] }
        : null,
    ...overrides,
  };
}

const request = (method: string, params?: unknown, id: string | number = 1) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params === undefined ? {} : { params }),
});

async function one(payload: unknown, h = host()): Promise<RpcResponse> {
  const response = await handleRpc(payload, h);
  if (!response || Array.isArray(response)) throw new Error("expected a single response");
  return response;
}

const result = (r: RpcResponse) => ("result" in r ? (r.result as Record<string, unknown>) : null);
const errorCode = (r: RpcResponse) => ("error" in r ? r.error.code : null);

describe("initialize", () => {
  it("echoes a protocol version we speak", async () => {
    const r = await one(request("initialize", { protocolVersion: "2025-03-26", capabilities: {} }));
    expect(result(r)).toMatchObject({
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "openventure" },
      instructions: "Call whoami first.",
    });
  });

  it("offers the newest version when the client asks for one we don't speak", async () => {
    const r = await one(request("initialize", { protocolVersion: "1999-01-01" }));
    expect(result(r)?.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    expect(negotiateProtocolVersion(undefined)).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("keeps the request id, string or number", async () => {
    expect((await one(request("ping", undefined, "abc"))).id).toBe("abc");
    expect((await one(request("ping", undefined, 0))).id).toBe(0);
  });
});

describe("requests", () => {
  it("answers ping with an empty result", async () => {
    expect(result(await one(request("ping")))).toEqual({});
  });

  it("returns method-not-found for a method we don't serve", async () => {
    expect(errorCode(await one(request("sampling/createMessage")))).toBe(RPC.methodNotFound);
  });

  it("rejects messages that are not JSON-RPC 2.0", async () => {
    expect(errorCode(await one({ id: 1, method: "ping" }))).toBe(RPC.invalidRequest);
    expect(errorCode(await one("ping"))).toBe(RPC.invalidRequest);
    expect(errorCode(await one({ jsonrpc: "2.0", id: 1 }))).toBe(RPC.invalidRequest);
    expect(errorCode(await one({ jsonrpc: "2.0", id: { a: 1 }, method: "ping" }))).toBe(RPC.invalidRequest);
  });

  it("rejects params that are not an object", async () => {
    expect(errorCode(await one(request("tools/list", [1, 2])))).toBe(RPC.invalidParams);
  });

  it("lists resources as empty rather than failing", async () => {
    expect(result(await one(request("resources/list")))).toEqual({ resources: [] });
  });

  it("serves prompts and refuses unknown ones", async () => {
    expect(result(await one(request("prompts/list")))?.prompts).toHaveLength(1);
    expect(result(await one(request("prompts/get", { name: "weekly_review" })))?.messages).toHaveLength(1);
    expect(errorCode(await one(request("prompts/get", { name: "nope" })))).toBe(RPC.invalidParams);
  });

  it("turns an unexpected host failure into an internal error without leaking it", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await one(
      request("tools/list"),
      host({
        listTools: () => {
          throw new Error("connection string postgres://secret");
        },
      })
    );
    expect(r).toMatchObject({ error: { code: RPC.internalError, message: "Internal error" } });
    log.mockRestore();
  });
});

describe("notifications and batches", () => {
  it("says nothing to a notification", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, host())).toBeNull();
  });

  it("ignores a stray response from the client", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", id: 4, result: {} }, host())).toBeNull();
  });

  it("answers a batch in order and drops the notifications in it", async () => {
    const responses = await handleRpc(
      [request("ping", undefined, 1), { jsonrpc: "2.0", method: "notifications/initialized" }, request("nope", undefined, 2)],
      host()
    );
    expect(responses).toHaveLength(2);
    expect((responses as RpcResponse[]).map((r) => r.id)).toEqual([1, 2]);
  });

  it("rejects an empty batch and returns null for a batch of notifications", async () => {
    expect(errorCode((await handleRpc([], host())) as RpcResponse)).toBe(RPC.invalidRequest);
    expect(await handleRpc([{ jsonrpc: "2.0", method: "notifications/cancelled" }], host())).toBeNull();
  });
});

describe("tools/call", () => {
  it("passes the arguments through and returns text plus structured content", async () => {
    const r = await one(request("tools/call", { name: "whoami", arguments: { a: 1 } }));
    expect(result(r)).toEqual({
      content: [{ type: "text", text: '{"echoed":{"a":1}}' }],
      structuredContent: { echoed: { a: 1 } },
    });
  });

  it("treats missing arguments as an empty object", async () => {
    const r = await one(request("tools/call", { name: "whoami" }));
    expect(result(r)?.structuredContent).toEqual({ echoed: {} });
  });

  it("rejects a call with no name or with non-object arguments", async () => {
    expect(errorCode(await one(request("tools/call", {})))).toBe(RPC.invalidParams);
    expect(errorCode(await one(request("tools/call", { name: "whoami", arguments: "x" })))).toBe(RPC.invalidParams);
    expect(errorCode(await one(request("tools/call", { name: "whoami", arguments: [1] })))).toBe(RPC.invalidParams);
  });

  it("reports an unknown tool as invalid params", async () => {
    expect(errorCode(await one(request("tools/call", { name: "drop_tables" })))).toBe(RPC.invalidParams);
  });

  it("marks tool failures as errors the model can read", () => {
    expect(toolFailure("No application APP-9")).toEqual({
      content: [{ type: "text", text: "No application APP-9" }],
      isError: true,
    });
  });
});

describe("tools/list", () => {
  it("returns a descriptor with a strict JSON Schema for every tool the token may use", async () => {
    const r = await one(request("tools/list"));
    const tools = result(r)?.tools as ReturnType<typeof describeTool>[];
    expect(tools.map((t) => t.name)).toEqual(toolsFor("analyst", "read"));
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(tool.inputSchema).not.toHaveProperty("$schema");
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it("describes every tool in the catalog without throwing", () => {
    expect(() => TOOL_NAMES.map((name: ToolName) => describeTool(name))).not.toThrow();
  });
});
