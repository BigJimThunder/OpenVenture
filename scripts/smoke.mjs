/**
 * End-to-end smoke test: the built app, a real browser, the demo club.
 *
 * It starts `next start` itself, signs in the way a member does (the sign-in
 * link is read from the server's own log, since no email key is set), opens
 * every screen at desktop and phone width, and fails on:
 *   - a page that errors or lands somewhere unexpected,
 *   - anything written to the browser console as an error (a CSP violation,
 *     a hydration mismatch, a failed chunk),
 *   - a WCAG A/AA violation (axe-core),
 *   - sideways scrolling at 390px.
 * Then it checks the edges that only show in a running deployment: security
 * headers, the invite-only sign-in, and what an access token cannot do.
 *
 * Usage (after `pnpm build` against a migrated, demo-seeded database):
 *   DATABASE_URL=postgresql://… node scripts/smoke.mjs
 *
 * SMOKE_CHROMIUM=/path/to/chromium uses an existing browser instead of the
 * one `playwright-core install chromium` downloads.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PORT = Number(process.env.SMOKE_PORT ?? 3210);
const BASE = `http://localhost:${PORT}`;
const DEMO_EMAIL = "demo@example.com";

if (!process.env.DATABASE_URL) {
  console.error("[smoke] DATABASE_URL is required (a migrated database with `pnpm seed:demo` loaded).");
  process.exit(2);
}

const failures = [];
const fail = (where, what) => {
  failures.push(`${where}: ${what}`);
  console.error(`  ✗ ${where}: ${what}`);
};
const ok = (message) => console.log(`  ✓ ${message}`);

// ——— the server ———

let serverLog = "";
const server = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    BETTER_AUTH_URL: BASE,
    CRON_SECRET: process.env.CRON_SECRET ?? "smoke-cron-secret",
    RESEND_API_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not come up on ${BASE}.\n${serverLog.slice(-2000)}`);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function signInLink(email) {
  const before = serverLog.length;
  const res = await fetch(`${BASE}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ email, callbackURL: "/inbox" }),
  });
  await new Promise((r) => setTimeout(r, 800));
  const sent = serverLog.slice(before);
  const link = sent.match(/http:\/\/localhost:\d+\/api\/auth\/magic-link\/verify[^"\s]*/)?.[0]?.replace(/&amp;/g, "&");
  return { status: res.status, link: link ?? null };
}

// ——— the crawl ———

const SCREENS = [
  "/inbox", "/my-work", "/pipeline", "/pipeline?view=list", "/memos", "/grants", "/grants/budget", "/meetings",
  "/members", "/insights", "/outcomes", "/lab", "/reports", "/reports/quarterly", "/reports/annual", "/docs",
  "/onboarding", "/schedule", "/settings", "/connect", "/welcome", "/members/me/insights", "/activity",
];
const DETAIL = [
  ["/pipeline?view=list", /^\/pipeline\/[0-9a-f-]{36}$/],
  ["/memos", /^\/memos\/[0-9a-f-]{36}$/],
  ["/meetings", /^\/meetings\/[0-9a-f-]{36}$/],
  ["/members", /^\/members\/[0-9a-f-]{36}$/],
  ["/lab", /^\/lab\/[0-9a-f-]{36}$/],
  ["/docs", /^\/docs\/[^/]+$/],
];
const PUBLIC = ["/", "/login", "/apply", "/privacy", "/unsubscribe", "/definitely-not-a-page"];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

async function visit(context, path, label, expectStatus = 200) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    // A 404 the test asked for logs "Failed to load resource" — that is the point of the request.
    if (m.type() === "error" && !(expectStatus === 404 && /404/.test(m.text()))) errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push(`uncaught ${String(e).slice(0, 200)}`));
  let response;
  try {
    response = await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 45_000 });
  } catch (e) {
    fail(label, `did not load (${String(e).slice(0, 120)})`);
    await page.close();
    return null;
  }
  if (response.status() !== expectStatus) fail(label, `HTTP ${response.status()}, expected ${expectStatus}`);
  const landed = new URL(page.url()).pathname;
  if (expectStatus === 200 && landed !== path.split("?")[0]) fail(label, `landed on ${landed}`);
  for (const e of errors) fail(label, `console: ${e}`);

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (sideways) fail(label, "scrolls sideways");

  await page.addScriptTag({ content: axeSource }).catch(() => {});
  const violations = await page
    .evaluate(async () => {
      const result = await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] });
      return result.violations.map((v) => `${v.id} ×${v.nodes.length} (${v.nodes[0].target.join(" ").slice(0, 80)})`);
    })
    .catch((e) => [`axe could not run: ${String(e).slice(0, 80)}`]);
  for (const v of violations) fail(label, `accessibility: ${v}`);

  const hrefs = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
  await page.close();
  return hrefs;
}

async function main() {
  await waitForServer();
  await db.connect();
  // A fresh run each time: the per-address sign-in throttle is counted in this table.
  await db.query(`delete from notification_log where kind like 'signin_%'`);

  console.log("Deployment");
  const health = await (await fetch(`${BASE}/api/health`)).json();
  if (!health.checks.database.ok || !health.checks.migrations.ok) fail("health", JSON.stringify(health.checks));
  else ok(`database reachable, ${health.checks.migrations.detail}`);
  if (!health.checks.auth.ok) fail("health", "auth secret check failed");

  const home = await fetch(`${BASE}/login`);
  const csp = home.headers.get("content-security-policy") ?? "";
  const wanted = {
    "content-security-policy": /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && /frame-ancestors 'none'/.test(csp),
    "x-frame-options": home.headers.get("x-frame-options") === "DENY",
    "x-content-type-options": home.headers.get("x-content-type-options") === "nosniff",
    "referrer-policy": Boolean(home.headers.get("referrer-policy")),
    "permissions-policy": Boolean(home.headers.get("permissions-policy")),
    "no x-powered-by": !home.headers.get("x-powered-by"),
  };
  for (const [name, present] of Object.entries(wanted)) {
    if (!present) fail("headers", `${name} missing or wrong`);
  }
  if (Object.values(wanted).every(Boolean)) ok("security headers and a nonce-based CSP on documents");

  console.log("Sign-in is invite-only");
  const stranger = await signInLink(`stranger-${randomBytes(4).toString("hex")}@nowhere.test`);
  const member = await signInLink(DEMO_EMAIL);
  if (stranger.status !== member.status) fail("sign-in", "a stranger gets a different response than a member");
  if (stranger.link) fail("sign-in", "a stranger was sent a sign-in link");
  if (!member.link) {
    fail("sign-in", "the demo member was not sent a sign-in link — is the demo data seeded?");
    return;
  }
  ok("same response for both; only the member is sent a link");

  const browser = await chromium.launch(
    process.env.SMOKE_CHROMIUM ? { executablePath: process.env.SMOKE_CHROMIUM, args: ["--no-sandbox"] } : {}
  );
  try {
    const first = await browser.newContext({ viewport: VIEWPORTS[0] });
    const page = await first.newPage();
    await page.goto(member.link, { waitUntil: "networkidle" });
    if (new URL(page.url()).pathname !== "/inbox") fail("sign-in", `the link landed on ${page.url()}`);
    else ok("the link signs the member in");
    const state = await first.storageState();
    await page.close();

    const detail = [];
    for (const [list, pattern] of DETAIL) {
      const p = await first.newPage();
      await p.goto(BASE + list, { waitUntil: "networkidle" });
      const hrefs = await p.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")));
      const hit = hrefs.find((h) => pattern.test(h ?? ""));
      if (hit) detail.push(hit);
      else fail(list, "no detail page linked from the list (is the demo data seeded?)");
      await p.close();
    }
    await first.close();

    for (const viewport of VIEWPORTS) {
      console.log(`Signed-in screens, ${viewport.name} (${viewport.width}px)`);
      const context = await browser.newContext({
        viewport,
        storageState: state,
        hasTouch: viewport.name === "phone",
        isMobile: viewport.name === "phone",
      });
      const before = failures.length;
      for (const path of [...SCREENS, ...detail]) await visit(context, path, `${path} [${viewport.name}]`);
      if (failures.length === before) ok(`${SCREENS.length + detail.length} screens, no errors, no accessibility violations`);
      await context.close();

      for (const colorScheme of ["light", "dark"]) {
        const visitor = await browser.newContext({ viewport, colorScheme });
        const publicBefore = failures.length;
        for (const path of PUBLIC) {
          await visit(visitor, path, `${path} [${viewport.name}, ${colorScheme}, signed out]`, path.includes("not-a-page") ? 404 : 200);
        }
        const gate = await visitor.newPage();
        await gate.goto(`${BASE}/settings`, { waitUntil: "networkidle" });
        if (new URL(gate.url()).pathname !== "/login") fail("/settings signed out", `landed on ${gate.url()}`);
        await gate.close();
        if (failures.length === publicBefore) ok(`${PUBLIC.length} public pages (${colorScheme}), and the app redirects to sign-in`);
        await visitor.close();
      }
    }

    console.log("Without JavaScript");
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORTS[0] });
    const landing = await plain.newPage();
    await landing.goto(BASE + "/", { waitUntil: "networkidle" });
    const hidden = await landing.evaluate(() => {
      let invisible = 0;
      for (const el of document.querySelectorAll("main *")) {
        if (el.children.length || !el.textContent.trim()) continue;
        let opacity = 1;
        for (let e = el; e && e !== document.body; e = e.parentElement) opacity *= parseFloat(getComputedStyle(e).opacity);
        if (opacity < 0.1) invisible++;
      }
      return invisible;
    });
    if (hidden > 0) fail("landing without JS", `${hidden} text blocks are invisible`);
    else ok("the landing page is fully readable");
    await plain.close();
  } finally {
    await browser.close();
  }

  console.log("Access tokens");
  const token = `ov_pat_${randomBytes(32).toString("base64url")}`;
  await db.query(
    `insert into api_token (org_id, member_id, name, token_hash, prefix, scope)
     select org_id, id, 'smoke test', $1, 'ov_pat_smoke', 'write' from member where email = $2`,
    [createHash("sha256").update(token).digest("hex"), DEMO_EMAIL]
  );
  const auth = { authorization: `Bearer ${token}` };
  const rpc = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: {} } }),
  });
  const who = await rpc.json().catch(() => null);
  if (rpc.status !== 200 || !JSON.stringify(who).includes(DEMO_EMAIL)) fail("mcp", `whoami failed (HTTP ${rpc.status})`);
  else ok("a token works at the MCP endpoint");
  const refused = {
    "/api/export/json": (await fetch(`${BASE}/api/export/json`, { headers: auth })).status,
    "/api/export/csv/applications": (await fetch(`${BASE}/api/export/csv/applications`, { headers: auth })).status,
    "POST /api/cron/daily": (await fetch(`${BASE}/api/cron/daily`, { method: "POST", headers: auth })).status,
  };
  for (const [where, status] of Object.entries(refused)) if (status !== 401) fail(where, `a token got HTTP ${status}, expected 401`);
  if (Object.values(refused).every((s) => s === 401)) ok("…and nowhere else: exports and the cron route refuse it");
  await db.query(`delete from api_token where name = 'smoke test'`);

  console.log("Scheduled run");
  const noSecret = await fetch(`${BASE}/api/cron/daily`);
  const run = await fetch(`${BASE}/api/cron/daily`, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? "smoke-cron-secret"}` },
  });
  const report = await run.json().catch(() => null);
  if (noSecret.status !== 401) fail("cron", `without the secret: HTTP ${noSecret.status}`);
  if (run.status !== 200 || report?.ok !== true) fail("cron", `the daily run failed (HTTP ${run.status}) ${JSON.stringify(report).slice(0, 300)}`);
  else ok("refused without the secret; runs clean with it");
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  fail("smoke", String(e?.stack ?? e).slice(0, 600));
} finally {
  await db.end().catch(() => {});
  server.kill("SIGTERM");
}
if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s).`);
  if (process.env.SMOKE_VERBOSE) console.error(serverLog.slice(-4000));
  exitCode = 1;
} else {
  console.log("\nAll good.");
}
process.exit(exitCode);
