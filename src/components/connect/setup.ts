/**
 * The copy-paste setup for each kind of client, built in one place so the
 * page and the "token created" dialog can't show different commands.
 */

export const TOKEN_PLACEHOLDER = "<your token>";

/** Verified against `claude mcp add --help`: -t/--transport http, -H/--header. */
export function claudeCodeCommand(endpoint: string, token: string = TOKEN_PLACEHOLDER): string {
  return `claude mcp add --transport http openventure ${endpoint} \\\n  --header "Authorization: Bearer ${token}"`;
}

/** The shape most MCP clients accept for a remote server in their config file. */
export function genericConfig(endpoint: string, token: string = TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        openventure: {
          type: "http",
          url: endpoint,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2
  );
}

/**
 * For desktop apps that only launch local servers: `mcp-remote` runs locally
 * and forwards to the endpoint with the header attached.
 */
export function bridgeConfig(endpoint: string, token: string = TOKEN_PLACEHOLDER): string {
  return JSON.stringify(
    {
      mcpServers: {
        openventure: {
          command: "npx",
          args: ["-y", "mcp-remote", endpoint, "--header", `Authorization: Bearer ${token}`],
        },
      },
    },
    null,
    2
  );
}
