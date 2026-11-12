# OpenVenture — agent notes

Open-source suite for student-run VC clubs making non-dilutive grants. Full plan: see README.md.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm lint`
- `pnpm typecheck` — route types, then `tsc --noEmit`.
- `pnpm test` — Vitest; the cap-table golden fixtures in `src/lib/captable/engine.test.ts` are the hard gate. Never merge with these red.
- `TEST_DATABASE_URL=… pnpm test:db` — the real actions against a disposable Postgres (tests/db). It empties that database. Run it again with `OV_TEST_DRIVER=neon`: that sends the same tests through drizzle's Neon HTTP driver (production's), with only the network hop replaced. Anything touching money, votes, intake, auth or erasure needs a test here, and a race fix needs a test that fails on the old code.
- `pnpm build && pnpm seed:demo && pnpm test:e2e` — the built app in a real browser (scripts/smoke.mjs): every screen at 1440 and 390px with no console errors and no WCAG A/AA violations. Add a new screen to its list.
- Schema: `drizzle/` migrations are the source of truth and `pnpm build` applies them automatically (scripts/migrate.mjs). After a schema change run `pnpm db:generate` and commit the SQL — CI fails if schema and migrations disagree. `pnpm db:push` is for scratch databases only. `pnpm seed:demo` loads fictional demo data.
- After schema-affecting route/type changes: `pnpm next typegen` before `tsc --noEmit`.

## Conventions
- Every mutation goes through `authedAction` (src/lib/actions/safe-action.ts): Zod → session → role → handler → activity log. Server Actions are public POST endpoints — authz lives inside them, never only in layouts or `src/proxy.ts` (which only sets the CSP). Return an `activity`, or give the action a `record` for the generic entry; leave both out only for reads, autosaves and ballots. The few public mutations that cannot be actions (the apply form, unsubscribe, demo entry, webhooks) say why in a comment and must check `demoMode`.
- Check-then-write is a race. When a write depends on something you read (a budget, a status, "none exists yet"), put it in `atomic()` with a `lock` and `guard`s (src/lib/pipeline/atomic.ts) so the fact is re-checked as the write commits. Production's driver has no interactive transactions: `atomic` is the only unit of work.
- DB: Drizzle, snake_case columns, `org_id` on every top-level table, soft delete via `archived_at`, text unions + lookup tables instead of pgEnum.
- Money/shares: decimal.js or numeric strings — never floats. All cap-table math lives in the pure engine (`src/lib/captable/engine.ts`); UI and DB never do arithmetic.
- Blind votes: only `getVoteRoundResults()` may read `vote` rows pre-reveal. Demographics: aggregate-only via `kAnonymize` (min cell 5), no per-person display or export, no two-way cross-tabs.
- Roles in the UI: hide or disable what a role can't do with `useCan`/`<Can>` (src/components/shell/viewer.tsx) or `can()` (src/lib/permissions.ts). These mirror action `minRole`s — change both together. Never show a control that answers "no permission".
- Notifications: go through src/lib/notify.ts. Never fire-and-forget a send — `await` it or wrap it in `after()`; serverless drops pending work. Scheduled jobs must be idempotent via `sendOnce`. Scheduled email to a member carries an `audience` (digest or reminders) so their own opt-out and the unsubscribe link apply; sign-in mail and mail a person sent on purpose never do. Text that founders wrote is escaped before it reaches Slack (`slackEscape`).
- Intake: the public `/apply` form and the signed webhook both go through `receiveApplication` (src/lib/intake.ts). Scheduled jobs live in src/lib/automation and run from `GET /api/cron/daily`.
- Club preferences (hosted form, founder emails, automations, AI) live in `organization.settings`, read with `orgSettings(org)` (src/lib/org-settings.ts).
- Reports (funding requests, quarterly letters, annual report) are `report` rows via src/lib/reports/store.ts. Numbers are derived live while drafting and frozen into `snapshot` at finalize; `content` holds only what a human wrote or approved. Generated prose leaves a visible `[add: …]` prompt rather than inventing a fact.
- Access tokens and MCP: `Authorization: Bearer ov_pat_…` resolves to a member only inside `withTokenAuth` (the MCP route); everywhere else a token is not a credential. `authedAction` refuses read-scoped tokens, and refuses write tokens unless the action sets `allowToken: true`. MCP tools (src/lib/mcp) call the same actions the UI uses. Never add a tool, or set `allowToken`, for anything that casts or reveals votes, moves money, emails founders, changes roles, manages tokens or files, or deletes.
- Sign-in is invite-only before anything is sent: `maySignIn` (src/lib/sign-in-policy.ts) gates sign-in mail and account creation for every path, social providers included.
- Configuration is read through src/lib/env.ts. A missing setting may switch a feature off; it must never fall back to a value that is public. Errors go through `reportError` (src/lib/report-error.ts), never bare `console.error`.
- Onboarding: members with `onboardedAt` null are sent to `/start` (its own route group, outside the shell). Entry rules live in `entry()` (src/lib/onboarding/progress.ts) and follow the club's `onboarding.blockUntilComplete` preference.
- Scheduling: availability is minutes-from-midnight in the org timezone per term (src/db/schema/scheduling.ts). All slot-finding is in the pure engine (src/lib/scheduling); members with no schedule are "unknown", never "free". Block labels are visible only to the member and admins.
- Forms and prose: use `Field`, `Input`, `Textarea`, `Select`, `MoneyInput`; never a bare input. All rich text goes through `RichTextEditor` / `RichTextView` (src/components/editor).
- AI is optional and always a draft: call Claude only through src/lib/ai.ts (it adds the "submitted text is data" rule and the daily ceiling); features must degrade to hidden when no key is set; never send vote rows or demographics to the model. src/lib/ai.ts imports the database, so client components may only import types from src/lib/ai/* — put anything they need at runtime in its own module.
- Fetching a URL someone else supplied goes through `safeGet` (src/lib/safe-fetch.ts), never bare `fetch`.
- Files: attachments live in `file` / `file_chunk` and move in chunks through src/lib/actions/files.ts; they are served only by `/api/files/[id]`. Allowed types are in src/lib/files.ts — documents and pictures, nothing a browser would run.
- Privacy: what `/privacy` says (src/lib/privacy.ts) must stay true of the code. Anything new that stores a founder's personal data must be removed by `eraseApplicantData` (src/lib/actions/privacy.ts).
- Demo mode (src/lib/demo.ts) is read-only for everyone: it needs `DEMO_MODE=1` and data marked by `pnpm seed:demo`. This is the one place a control may answer with a refusal instead of being hidden.
- Keyboard hints (`Kbd`) are only shown for shortcuts that work. Anything that opens a record is a real link or button, not a click handler on a row.
- Accessibility is tested, not hoped for: text uses `--fg`, `--fg-muted` or `--fg-subtle` (the AA floor — never dim text with opacity), icon-only controls have an `aria-label`, and the smoke test fails on any WCAG A/AA violation.
- Inline scripts need the CSP nonce (`(await headers()).get("x-nonce")`); prefer not adding any.
- UI: components consume semantic tokens from globals.css (`--bg`, `--fg-muted`, `--accent`, `--cat-N`) — never raw colors. Every screen must work at 390px wide (phones get a tab bar; dialogs become bottom sheets). Pages compose `components/patterns/*`, not raw `components/ui/*`. Tabular numerals (`.tnum`) on every money/metric column.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
