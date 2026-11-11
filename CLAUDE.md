# OpenVenture — agent notes

Open-source suite for student-run VC clubs making non-dilutive grants. Full plan: see README.md.

## Commands
- `pnpm dev` / `pnpm build` / `pnpm lint`
- `pnpm test` — Vitest; the cap-table golden fixtures in `src/lib/captable/engine.test.ts` are the hard gate. Never merge with these red.
- Schema: `drizzle/` migrations are the source of truth and `pnpm build` applies them automatically (scripts/migrate.mjs). After a schema change run `pnpm db:generate` and commit the SQL — CI fails if schema and migrations disagree. `pnpm db:push` is for scratch databases only. `pnpm seed:demo` loads fictional demo data.
- After schema-affecting route/type changes: `pnpm next typegen` before `tsc --noEmit`.

## Conventions
- Every mutation goes through `authedAction` (src/lib/actions/safe-action.ts): Zod → session → role → handler → activity log. Server Actions are public POST endpoints — authz lives inside them, never only in middleware/layouts.
- DB: Drizzle, snake_case columns, `org_id` on every top-level table, soft delete via `archived_at`, text unions + lookup tables instead of pgEnum.
- Money/shares: decimal.js or numeric strings — never floats. All cap-table math lives in the pure engine (`src/lib/captable/engine.ts`); UI and DB never do arithmetic.
- Blind votes: only `getVoteRoundResults()` may read `vote` rows pre-reveal. Demographics: aggregate-only via `kAnonymize` (min cell 5), no per-person display or export, no two-way cross-tabs.
- Roles in the UI: hide or disable what a role can't do with `useCan`/`<Can>` (src/components/shell/viewer.tsx) or `can()` (src/lib/permissions.ts). These mirror action `minRole`s — change both together. Never show a control that answers "no permission".
- Notifications: go through src/lib/notify.ts. Never fire-and-forget a send — `await` it or wrap it in `after()`; serverless drops pending work. Scheduled jobs must be idempotent via `sendOnce`.
- Intake: the public `/apply` form and the signed webhook both go through `receiveApplication` (src/lib/intake.ts). Scheduled jobs live in src/lib/automation and run from `GET /api/cron/daily`.
- Club preferences (hosted form, founder emails, automations, AI) live in `organization.settings`, read with `orgSettings(org)` (src/lib/org-settings.ts).
- AI is optional and always a draft: call Claude only through src/lib/ai.ts; features must degrade to hidden when no key is set; never send vote rows or demographics to the model.
- Keyboard hints (`Kbd`) are only shown for shortcuts that work.
- UI: components consume semantic tokens from globals.css (`--bg`, `--fg-muted`, `--accent`, `--cat-N`) — never raw colors. Every screen must work at 390px wide (phones get a tab bar; dialogs become bottom sheets). Pages compose `components/patterns/*`, not raw `components/ui/*`. Tabular numerals (`.tnum`) on every money/metric column.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
