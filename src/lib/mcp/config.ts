/**
 * The off switch. Set MCP_DISABLED=1 in the deployment environment to refuse
 * every token request at /api/mcp and hide token creation on /connect.
 * Existing tokens are kept, and work again when the variable is removed.
 */
export function mcpEnabled(): boolean {
  const flag = process.env.MCP_DISABLED?.trim().toLowerCase();
  return !(flag === "1" || flag === "true" || flag === "yes");
}
