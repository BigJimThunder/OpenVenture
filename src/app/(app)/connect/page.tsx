import type { Metadata } from "next";
import { format, formatDistanceToNow } from "date-fns";
import { requireCtx } from "@/lib/actions/context";
import { EMAIL_LIMITS } from "@/lib/mcp/actions";
import { TOOL_GROUPS, TOOLS, toolsFor, TOOL_NAMES, type ToolSpec } from "@/lib/mcp/catalog";
import { mcpEnabled } from "@/lib/mcp/config";
import { MCP_REQUESTS_PER_MINUTE } from "@/lib/mcp/rate-limit";
import { MAX_TOKENS_PER_MEMBER, tokenState } from "@/lib/mcp/tokens";
import { appUrl } from "@/lib/notify";
import { can, ROLE_LABEL } from "@/lib/permissions";
import { getClubTokens, getMyTokens, type MyToken } from "@/lib/queries/tokens";
import { PageHeader } from "@/components/patterns/page-header";
import { Badge } from "@/components/ui/badge";
import { CodeSnippet } from "@/components/connect/code-snippet";
import { bridgeConfig, claudeCodeCommand, genericConfig } from "@/components/connect/setup";
import { ClubTokens, MyTokens, type TokenRow } from "@/components/connect/token-manager";
import { SettingsCard, SettingsSection, StatusLine } from "@/components/settings/settings-section";

export const metadata: Metadata = { title: "Connect your AI" };
export const dynamic = "force-dynamic";

function tokenRow(t: MyToken, now: Date): Omit<TokenRow, "owner"> {
  const expired = tokenState(t, now) === "expired";
  return {
    id: t.id,
    name: t.name,
    prefix: t.prefix,
    scope: t.scope,
    created: format(t.createdAt, "MMM d, yyyy"),
    lastUsed: t.lastUsedAt ? formatDistanceToNow(t.lastUsedAt, { addSuffix: true }) : null,
    expiry: !t.expiresAt
      ? "Never expires"
      : expired
        ? `Expired ${formatDistanceToNow(t.expiresAt, { addSuffix: true })}`
        : `Expires ${formatDistanceToNow(t.expiresAt, { addSuffix: true })}`,
    expired,
  };
}

type Example = { ask: string; note?: string; needs: "read" | "write" | "partner" };

const EXAMPLES: Example[] = [
  { ask: "What needs me this week?", needs: "read" },
  { ask: "Brief me on APP-12 before my coffee chat. What should I ask them?", needs: "read" },
  {
    ask: "Log my coffee chat with Lecture Loop. We met today at the library, I would advance them, and here are my notes: …",
    needs: "write",
  },
  {
    ask: "Draft the Team section of the Lecture Loop memo from what is in the application. Show me the text before you save it.",
    needs: "write",
  },
  { ask: "Draft the funding request for Lecture Loop and send me the link.", needs: "partner" },
  {
    ask: "Every Monday at 8am, email me my OpenVenture digest.",
    note: "The schedule lives in your assistant, so this needs one that can run tasks on a timer.",
    needs: "write",
  },
  { ask: "How much is left in this year's pool, and which grants are still waiting on receipts?", needs: "read" },
];

export default async function ConnectPage() {
  const ctx = await requireCtx();
  const role = ctx.member.role;
  const now = new Date();
  const enabled = mcpEnabled();
  const canWrite = role !== "read_only";
  const isAdmin = can(role, "manageMembers");
  const endpoint = appUrl("/api/mcp");

  const [mine, club] = await Promise.all([
    getMyTokens(ctx.org.id, ctx.member.id),
    isAdmin ? getClubTokens(ctx.org.id) : Promise.resolve([]),
  ]);
  const myRows = mine.map((t) => tokenRow(t, now));
  const activeCount = myRows.filter((t) => !t.expired).length;
  const othersRows: TokenRow[] = club
    .filter((t) => t.memberId !== ctx.member.id)
    .map((t) => ({
      ...tokenRow(t, now),
      owner: { name: t.ownerName, offboarded: t.ownerOffboardedAt != null || t.ownerStatus !== "active" },
    }));

  // The same registry tools/list reads, so this list can't promise a tool the endpoint won't offer.
  const offered = new Set(toolsFor(role, canWrite ? "write" : "read"));
  const hiddenByRole = TOOL_NAMES.length - offered.size;
  const groups = TOOL_GROUPS.map((group) => ({
    group,
    tools: TOOL_NAMES.filter((name) => offered.has(name) && (TOOLS[name] as ToolSpec).group === group).map(
      (name) => ({ name, spec: TOOLS[name] as ToolSpec })
    ),
  })).filter((g) => g.tools.length > 0);

  const examples = EXAMPLES.filter(
    (e) => e.needs === "read" || (e.needs === "write" && canWrite) || (e.needs === "partner" && can(role, "partnerWork"))
  );

  return (
    <div className="pb-16">
      <PageHeader
        title="Connect your AI"
        description="Give your own assistant (Claude, or anything that speaks MCP) a key to your OpenVenture account. It can then answer “what needs me this week”, look up any application, and do the routine writing and logging you ask it to, as you and with your role."
      />

      <div className="flex max-w-3xl flex-col gap-10 px-4 md:px-6">
        {!enabled && (
          <div className="rounded-lg border border-warning-border bg-warning-bg p-4 text-sm">
            <p className="font-medium">The AI connection is switched off on this deployment.</p>
            <p className="mt-1 text-fg-muted">
              Whoever runs the server set <code className="font-mono text-xs">MCP_DISABLED</code>. Existing
              tokens are refused until it is removed. You can still revoke tokens here.
            </p>
          </div>
        )}

        <SettingsSection
          id="tokens"
          title="Your tokens"
          description="A token is a password for an assistant. It acts as you, so it can never do more than your role allows, and everything it changes is recorded under your name."
        >
          <SettingsCard>
            {enabled || myRows.length > 0 ? (
              <MyTokens
                tokens={myRows}
                endpoint={endpoint}
                canWrite={canWrite}
                atLimit={!enabled || activeCount >= MAX_TOKENS_PER_MEMBER}
                limit={MAX_TOKENS_PER_MEMBER}
              />
            ) : (
              <p className="text-sm text-fg-muted">You have no tokens.</p>
            )}
          </SettingsCard>
        </SettingsSection>

        <SettingsSection
          id="setup"
          title="Set it up"
          description="Make a token above, then give your assistant this address and the token. It takes about a minute."
        >
          <SettingsCard title="Claude Code" description="Run this once in a terminal. Replace the placeholder with your token.">
            <CodeSnippet value={claudeCodeCommand(endpoint)} label="Command" />
            <p className="mt-2 text-xs text-fg-muted">
              Then start Claude Code and ask: “Who am I in OpenVenture?” It should answer with your
              name and role.
            </p>
          </SettingsCard>
          <SettingsCard
            title="Any assistant with an MCP config file"
            description="Cursor, VS Code, Windsurf and most others take a remote server in this shape. The file's name and place differ per app; look for “MCP servers” in its settings."
          >
            <CodeSnippet value={genericConfig(endpoint)} label="Config" />
          </SettingsCard>
          <SettingsCard
            title="Claude Desktop, and apps that only start local servers"
            description="Some desktop apps can't send a token to a remote server directly. This config runs a small bridge on your computer that does it for them. It needs Node.js installed."
          >
            <CodeSnippet value={bridgeConfig(endpoint)} label="Config" />
            <p className="mt-2 text-xs text-fg-muted">
              In Claude Desktop: Settings → Developer → Edit Config, paste, then restart the app.
            </p>
          </SettingsCard>
          <SettingsCard>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-fg-muted">Address</dt>
              <dd className="min-w-0 font-mono text-xs break-all">{endpoint}</dd>
              <dt className="text-fg-muted">Transport</dt>
              <dd>Streamable HTTP</dd>
              <dt className="text-fg-muted">Sign-in</dt>
              <dd>
                Header <code className="font-mono text-xs">Authorization: Bearer {"<your token>"}</code>
              </dd>
            </dl>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection
          id="tools"
          title="What your assistant can do"
          description={
            <>
              You are {role === "admin" || role === "analyst" ? "an" : "a"} {ROLE_LABEL[role].toLowerCase()}
              {canWrite ? "" : " member"}, so these are the tools your assistant is offered.
              {canWrite && " The ones marked “write” need a read-and-write token."}
              {hiddenByRole > 0 &&
                (canWrite
                  ? ` ${hiddenByRole} more are for partners and admins.`
                  : " Tools that change things are for analysts and above.")}
            </>
          }
        >
          {groups.map(({ group, tools }) => (
            <SettingsCard key={group} title={group}>
              <ul className="divide-y divide-border">
                {tools.map(({ name, spec }) => (
                  <li key={name} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{spec.title}</div>
                      <div className="mt-0.5 text-xs leading-relaxed text-fg-muted">{spec.summary}</div>
                    </div>
                    {spec.scope === "write" && <Badge variant="neutral">write</Badge>}
                  </li>
                ))}
              </ul>
            </SettingsCard>
          ))}
          <SettingsCard title="What it can't do, on purpose">
            <ul className="flex flex-col gap-2">
              <StatusLine ok>
                Cast, change or reveal a vote. It can tell you a vote is open and hand you the link;
                the ballot is yours, and nobody sees results before the reveal.
              </StatusLine>
              <StatusLine ok>Email a founder or anyone outside the club.</StatusLine>
              <StatusLine ok>Approve or issue a grant, or touch the budget.</StatusLine>
              <StatusLine ok>Invite, promote or offboard members, or change settings.</StatusLine>
              <StatusLine ok>Delete anything, or make or revoke tokens.</StatusLine>
            </ul>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection
          id="examples"
          title="Things to ask"
          description="Say it the way you would say it to an analyst. Refs like APP-12 work, and so do company names."
        >
          <SettingsCard>
            <ul className="flex flex-col gap-3">
              {examples.map((e) => (
                <li key={e.ask}>
                  <CodeSnippet value={e.ask} label="Prompt" wrap />
                  {e.note && <p className="mt-1 text-xs text-fg-muted">{e.note}</p>}
                </li>
              ))}
            </ul>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection
          id="security"
          title="Before you hand over a key"
          description="Four things worth knowing."
        >
          <SettingsCard>
            <ul className="flex flex-col gap-3 text-sm leading-relaxed">
              <li>
                <span className="font-medium">The token is you.</span> Whoever holds it can read what
                you can read and, with a write token, change what you can change. Treat it like a
                password: don&apos;t paste it into a chat, a doc or a repo.
              </li>
              <li>
                <span className="font-medium">Start with read only.</span> It covers briefings and
                look-ups. Make a write token when you want the assistant to log and draft for you.
              </li>
              <li>
                <span className="font-medium">Your assistant reads what founders wrote.</span> An
                application could contain text that tries to steer it. That is why it can&apos;t vote,
                pay or email outsiders, and why you should read a decline or a memo edit before
                saying yes to it.
              </li>
              <li>
                <span className="font-medium">Revoke here, any time.</span> It takes effect at once.
                Tokens also stop working when you leave the club. Limits: {MCP_REQUESTS_PER_MINUTE}{" "}
                requests a minute per token, {EMAIL_LIMITS.mcp_email_me} emails to yourself and{" "}
                {EMAIL_LIMITS.mcp_email_member} to other members a day.
              </li>
            </ul>
          </SettingsCard>
        </SettingsSection>

        {isAdmin && (
          <SettingsSection
            id="club-tokens"
            title="Other members' tokens"
            description="Every working token in the club that isn't yours. Revoke one when a laptop is lost or someone hands over their role. Offboarding a member already stops their tokens; revoking clears them from this list."
          >
            <SettingsCard>
              {othersRows.length > 0 ? (
                <ClubTokens tokens={othersRows} />
              ) : (
                <p className="text-sm text-fg-muted">Nobody else has connected an assistant yet.</p>
              )}
            </SettingsCard>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
