# OpenVenture — Technical Overview

**An open-source operating system for student-run venture funds, built as a single
full-stack TypeScript application.**

This document is the long-form tour: what the product does, why it exists, how the
codebase is structured, and the engineering decisions that hold it together. It is
written for a technical reader who wants to evaluate the work — the [README](README.md)
is the quick start; this is the "how it's actually built."

---

## 1. The problem it solves

A college venture club has roughly **$10,000 a year** to give to student founders in
non-dilutive grants of **$200–$4,000** — checks that pay for incorporation filings, API
credits, a hardware prototype, a conference trip. The club takes no equity. Fifteen or
fewer unpaid undergraduates run the whole operation in about an hour a week.

In practice that operation lives across Airtable, Notion, Google Sheets, Slack pings,
and Google Forms — and every May, the institutional memory graduates with the seniors.
Decline reasons vanish. The cap table spreadsheet has three competing versions. Nobody
remembers why last year's committee passed on the company that just raised a seed round.

OpenVenture replaces that sprawl with **one application that owns the club's deal flow,
its written work, its people, and its money** — and it has a deliberate second job:
teaching. Members join these clubs to learn venture. So the product teaches portfolio
construction, LP reporting, dilution math, and honest self-assessment of investment
judgment *through use*, not through documentation.

Design constraints that shaped everything:

- **Nobody is trained.** Officers hand the app to successors in a 20-minute conversation.
  The UI must teach its own workflow (keyboard hints in the footer of every screen, a
  ⌘K palette that doubles as a feature index).
- **Attention is voluntary.** If a screen is tedious, members revert to a spreadsheet.
  The common case of every workflow is optimized to seconds: logging a coffee chat from
  a phone in a café, adding an application mid-conversation with a single `C` keypress.
- **Decisions must leave a trail.** Stage moves, decline reasons, votes, and money all
  produce structured audit records — the club's memory has to survive officer turnover.
- **It must run at student-budget cost:** $0–15/month on Vercel Hobby + Neon's free
  tier + Resend's free tier, one club per deployment.

---

## 2. What's in it

Eight shipped modules, one app:

| Module | What it does |
|---|---|
| **Intake & pipeline** | Applications land from the club's website form (signed webhook) into a kanban: Applied → Screening → Coffee Chat → Pitched Group → Decision → Funded/Declined. Drag-and-drop with optimistic updates, keyboard navigation, a peek panel, URL-param filters, stage SLAs with staleness warnings, and hard **stage gates** (e.g., can't pass Decision without a revealed vote). Declines *require* a recorded reason — that's what makes the annual retro real. |
| **Grants & budget** | The pool, requests, approve → issue → reconcile lifecycle, receipts, budget burn-down, and an overdraw guard implemented in a pure, unit-tested budget module. |
| **Memos & blind IC voting** | Templated investment memos with per-section versioning and inline comments. Conviction voting (1–5 scale + fund/decline + suggested check size) that is **hidden until reveal, enforced server-side** — the cheapest anti-groupthink mechanism there is. |
| **Members, onboarding, meetings** | Roster with roles, invite flow, onboarding checklists, agenda builder, two-tap attendance, a phone-friendly meeting run mode, recaps, and an iCal feed. |
| **Insights** | Funnel conversion, sector/department mix, per-member sourcing attribution, decline-reason analytics, outcome tiers (the grant-world power-law lesson), and per-member *calibration* — how your conviction scores correlate with what actually happened. |
| **Cap Table Lab** | A dilution sandbox for advising grantees: post-money and pre-money SAFEs, convertible notes with accrued interest, MFN, discounts, option-pool shuffles, splits, transfers — with "show your work" derivations on every computed number. |
| **LP reports** | Quarterly letters generated from live data — deployment, pipeline stats, grants issued, portfolio tier moves — plus GP commentary in a rich-text editor, print-styled to produce a clean PDF. |
| **Enrichment & export** | One-click company enrichment from the founder's own website (deterministic meta-tag pass, optionally augmented by a Claude API call); full JSON/CSV export so the club's data is never locked in. |

There is deliberately **no founder-facing surface**. Founders interact with the club's
existing website; applications arrive through the signed ingest endpoint.

---

## 3. Stack and why

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16, App Router** | Server Components keep read paths on the server (queries return exactly what a screen needs, no API layer); Server Actions carry every mutation; typed routes (`PageProps<"/pipeline/[id]">` via `next typegen`) make navigation refactor-safe. |
| Language | **TypeScript, strict** | End-to-end types from Drizzle schema → queries → components. |
| Database | **Neon Postgres** via **Drizzle ORM** | Serverless Postgres with true SQL; Drizzle gives typed schema-as-code without hiding the SQL. Snake_case columns via Drizzle's `casing` option. |
| Auth | **Better Auth** (magic link + email OTP) | Students lose passwords; university mail sometimes mangles links, so every email carries both a link and a 6-digit code. Domain allow-listing restricts sign-ups to the school. |
| Email | **Resend + react-email** | Free tier suffices; without an API key, magic links print to the dev console so local setup requires zero external accounts. |
| UI | **Tailwind CSS v4 + shadcn-style components + Radix primitives** | Semantic design tokens (`--bg`, `--fg-muted`, `--accent`, `--cat-N`) defined once in `globals.css`; components never touch raw colors, which is what makes the light/dark themes and any future re-skin tractable. |
| Interaction | **dnd-kit** (kanban), **cmdk** (⌘K palette), **TipTap** (memo/commentary editors), **Recharts** (insights), **sonner** (toasts), **nuqs** (URL state) | Each chosen for being headless/composable rather than opinionated. |
| Money & math | **decimal.js + Postgres `numeric`** | No floats, anywhere, ever. Money and share counts travel as decimal strings between DB and UI. |
| Testing | **Vitest** | 92 tests across 7 suites, concentrated on the pure domain cores (see §6). |

Total: **~24,500 lines of TypeScript/TSX** in `src/`, **50 Postgres tables**, **69
server actions**, ~25 screens.

---

## 4. Architecture

### 4.1 The shape of the app

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/             #   login, first-run club setup
│   ├── (app)/              #   the product — one folder per screen
│   │   ├── pipeline/       #   kanban + application detail
│   │   ├── memos/[id]/     #   memo editor, versions, blind vote
│   │   ├── grants/         #   pool, requests, budget
│   │   ├── meetings/[id]/  #   agenda, run mode
│   │   ├── insights/       #   analytics + calibration
│   │   ├── lab/            #   cap table sandbox
│   │   ├── reports/        #   LP quarterly letters
│   │   └── …               #   members, my-work, docs, settings, onboarding
│   └── api/                # the few true HTTP endpoints:
│       ├── ingest/application  # HMAC-signed intake webhook
│       ├── export/{json,csv}   # full data export
│       ├── calendar/[token]    # iCal feed
│       └── auth/[...all]       # Better Auth handler
├── components/
│   ├── ui/                 # shadcn-style primitives (button, dialog, select…)
│   ├── patterns/           # app-level patterns (page-header, money, stat-card…)
│   └── <feature>/          # feature components (applications/, memos/, votes/…)
├── db/
│   └── schema/             # Drizzle schema, split by domain (core, pipeline,
│                           #   memos, grants, meetings, captable)
└── lib/
    ├── actions/            # ALL mutations (server actions via authedAction)
    ├── queries/            # ALL reads (plain server-side functions)
    ├── captable/           # pure engine + golden-fixture tests
    ├── votes/              # pure redaction module + tests
    ├── grants/             # pure budget math + tests
    ├── insights/           # k-anonymity + calibration, both tested
    ├── pipeline/           # pure stage-gate checks + tests
    └── enrichment/         # meta-tag fetcher (+ optional Claude pass)
```

The pattern throughout: **pages are thin server components** that call a query function
and compose feature components; **feature components are client islands** only where
interactivity demands it; **every mutation goes through one spine** (§4.2); **all
domain logic that can be pure, is pure** — and that's exactly where the tests live.

### 4.2 The mutation spine: `authedAction`

Server Actions are, in security terms, public POST endpoints. OpenVenture treats them
that way. Every one of the 69 mutations is built with a single wrapper
(`src/lib/actions/safe-action.ts`) that enforces, in order:

```
Zod parse → session check → role check → org scope → handler → activity log
```

```ts
export const updateApplicationFacts = authedAction({
  minRole: "analyst",
  input: z.object({ applicationId: z.string().uuid(), /* … */ }),
  handler: async (input, ctx) => {
    // ctx.org and ctx.member are guaranteed here; every query in the handler
    // is written against ctx.org.id, so cross-club access is structurally off
    // the table.
    return {
      data: { ok: true },
      activity: {           // returning this is how the audit log gets written —
        verb: "application.facts_updated",   // it's impossible to forget,
        diff,                                // because the wrapper writes it.
      },
    };
  },
});
```

Three properties worth noting:

- **Authorization lives inside the action**, never only in middleware or layouts —
  the layout guard is a UX nicety, not the security boundary.
- **The audit trail is structural.** A handler reports its activity record as part of
  its return value and the wrapper persists it; there is no separate "remember to log"
  call to forget. Activity rows carry a structured `diff` of changed fields.
- **Errors are typed.** Handlers throw `ActionError("grant would overdraw the pool")`
  for deliberate, user-facing failures; anything else is logged server-side and
  replaced with a generic message. The client always receives a discriminated
  `{ ok: true, data } | { ok: false, code, error }` — no thrown exceptions crossing
  the network boundary.

### 4.3 Multi-tenancy and data conventions

One club per deployment, but the schema is org-scoped anyway (`org_id` on every
top-level table) — it costs little and keeps the door open for multi-club hosting.
Other conventions applied uniformly across the 50 tables:

- **Soft deletes** via `archived_at` — history is the product; nothing that carries
  decisions is ever hard-deleted.
- **Text unions + lookup tables instead of `pgEnum`** — clubs rename their stages and
  sources; `ALTER TYPE` migrations are not a thing a student officer should ever face.
- **Human-readable refs** (`APP-141`, `MEM-12`, `TSK-84`): per-org sequential integers
  allocated by `max(ref)+1` under a unique index, with a retry on collision
  (`src/lib/refs-server.ts`). A counter table or per-org sequence would be more
  "correct" and also more machinery than a 15-person club will ever need — the code
  says exactly this in a comment, which is the point: the trade-off is documented
  where it's made.
- **Fractional kanban positions** (`numeric(12,6)`): drag-reorder writes one row in
  the common case (midpoint between neighbors) and renumbers a column only when
  midpoints are exhausted.

### 4.4 Neon, and the dual-driver setup

The database layer (`src/db/index.ts`) picks its driver at runtime:

- **Production (Neon):** `drizzle-orm/neon-http` over Neon's HTTP proxy — each query
  is a fetch, no TCP handshake, no connection pool to exhaust under serverless
  concurrency. The app always uses the **pooled** (`-pooler`, PgBouncer) URL.
- **Local dev / any Postgres:** plain `node-postgres`, selected automatically when the
  URL isn't Neon's.

Migrations are the reason there are *two* URLs in `.env`: `drizzle-kit` needs the
**direct** endpoint because PgBouncer's transaction mode breaks the prepared
statements and multi-statement scripts migration tooling relies on
(`drizzle.config.ts` documents this). The repo also ships three operational scripts
born from real deploy debugging — a pooler-safe migration runner that prints the
exact failing statement, a baseliner for databases created with `drizzle-kit push`,
and a read-only diagnostic — all written in the simple query protocol so they work
through either endpoint.

One more Neon-specific detail: when `DATABASE_URL` is absent, `db` is a Proxy that
throws on first property access rather than at import time — so `next build` succeeds
in CI without database credentials, and the failure, if any, happens at request time
with a clear message.

### 4.5 The intake webhook

The one write endpoint exposed to the outside world is the application intake:

```
POST /api/ingest/application
x-openventure-signature: sha256=<HMAC-SHA256 of the raw body>
```

The club's existing website form POSTs JSON; the handler verifies the HMAC against a
per-org secret (rotatable from Settings), validates with Zod, dedupes on company
domain, creates the company + application at the pipeline's entry stage, and pings the
club's Slack webhook. No polling, no Zapier, no copy-paste from Airtable.

---

## 5. The interesting engineering

### 5.1 The cap-table engine

`src/lib/captable/engine.ts` is the technical heart of the teaching mission: a **pure
function** — no I/O, no DB imports, no `Date.now()` — that folds an immutable ledger
of events into a cap-table state:

```
foldCapTable(events: CapEventInput[]) → CapTableState
```

Everything is `decimal.js` at 40-digit precision. Shares are modeled *fractionally* so
ownership always sums to exactly 100% — the UI rounds for display, the engine never
does. Each computed number carries a `DerivationStep` trail, which is what powers the
"show your work" expansion in the Lab UI: a student can click any post-round ownership
percentage and see the equation that produced it.

What it models correctly, because a *teaching* tool must not teach the wrong mechanics:

- **Post-money SAFEs** with YC semantics: ownership fixed at `principal ÷ cap`, and the
  option-pool increase excluded from *their* denominator (the subtle point most
  spreadsheet models get wrong).
- **Pre-money SAFEs** (the original convention), which *do* share pool-shuffle dilution.
- **Convertible notes** with day-count interest accrual to the conversion date.
- **Discounts vs caps** resolved as better-of pricing; **MFN** clauses resolved against
  the instrument set.
- **Pool top-ups, stock splits, secondary transfers.**

The hard part is priced rounds: with a target post-money option pool, the pool shuffle,
SAFE conversions, and note conversions are mutually dependent — and the function
mapping price-per-share to residual error is only **piecewise smooth**, with kinks
wherever an instrument switches between cap-pricing and discount-pricing. Rather than
attempt a closed form per regime, the engine **solves by bisection on a monotone
residual**, which is robust across all the kinks — and it detects and reports plainly
when a pool target is mathematically unattainable instead of silently producing
garbage.

Correctness is enforced by a **golden-fixture corpus**: hand-computed worked examples
(the kind you'd do on paper to check a term sheet) plus property tests — ownership
sums to 100%, conversion never destroys value, engine version is stamped on snapshots
so a recompute after an engine upgrade is traceable. Per project convention, these
fixtures are the merge gate: **nothing ships red.**

### 5.2 Blind voting, enforced in one place

The anti-groupthink mechanism only works if it cannot leak. The enforcement design:

- Ballots live in a `vote` table that **exactly one query function is allowed to
  read pre-reveal**: `getVoteRoundResults()` (`src/lib/queries/memos.ts`). The
  convention is written into the project instructions and the code comments — every
  other read path sees participation counts only.
- That function delegates to a **pure redaction module** (`src/lib/votes/redact.ts`)
  which decides, from `(round state, viewer, ballots)`, exactly what this viewer may
  see: pre-reveal, your own ballot and the submitted count; post-reveal, everything,
  including who abstained. Being pure, the redaction rules are unit-tested directly —
  the tests read like the policy.
- Reveal is role-gated (partner+), recusals are first-class (a recused member sees a
  notice instead of a form that errors on submit), and outcomes are recorded on the
  round — feeding both the decision trail and the calibration analytics.

### 5.3 Privacy as code: k-anonymity on demographics

Clubs want to know whether their funnel reaches beyond the CS department. Small-n
demographics are a re-identification minefield — in a 40-application season, "the one
mechanical engineering sophomore" is not anonymous in a bar chart.

The design (README: *"Privacy is code, not policy"*):

- Self-reported founder demographics are **write-once and aggregate-read only** —
  the table is keyed to the application with no name or email on the row, and it is
  deliberately excluded from admin UI, per-application views, and CSV export.
- Every aggregation passes through `kAnonymize()` (`src/lib/insights/k-anonymize.ts`):
  buckets under the minimum cell size (default 5) are suppressed and pooled into a
  labeled "suppressed" bucket — which itself only appears if *it* clears the minimum.
- **No two-way cross-tabs**, ever — the intersection of two protected attributes is
  where re-identification actually happens.

### 5.4 Stage gates as pure functions

Process rules — "you can't advance past Decision without a revealed vote", "Coffee
Chat requires two recorded verdicts" — are implemented in `src/lib/pipeline/gates.ts`
as a pure check over `(stage flags, evidence)`. The semantics are carefully chosen and
documented in-line: a stage's requirements describe work done *during* that stage and
are enforced when *leaving* it — entry-gating would deadlock (you could never enter
Decision to run the vote that Decision requires). Backward moves and the decline path
are exempt (declines have their own reason-required gate). Pure function → direct unit
tests → the club's process rules are executable and verified.

### 5.5 The UI system

The interface is deliberately Linear-shaped: a fixed sidebar, dense per-screen
headers, keyboard-first interaction, one scroll container owned by the shell.

- **Semantic tokens only.** Components consume `--bg`, `--fg-muted`, `--accent`,
  `--cat-N` (categorical chart colors) from `globals.css`. No raw hex anywhere in
  components — theming and future re-skins are a token-file edit.
- **Two page archetypes.** "Screen" pages (Inbox, Pipeline, My Work, Insights) fill
  the viewport with their own header/footer chrome and internal scrolling; "document"
  pages (memos, reports, application detail) flow naturally in the shell's scroll
  container. The shell wrapper is the single place scrolling is defined — with
  `print:overflow-visible` so the LP letter prints in full.
- **Keyboard everywhere.** `C` creates an application from any screen (guarded
  against firing while typing), `⌘K` opens a palette that is both navigator and
  context-aware action menu — the focused pipeline card publishes its actions
  (peek, open, move stage, start vote) into the palette via a React context ref,
  so the palette, the peek panel, and the single-key shortcuts share one action
  vocabulary. Every screen's footer teaches its own keys.
- **Money is typographically honest.** Tabular numerals (`.tnum`) on every metric
  column; amounts flow as decimal strings into a `<Money>` pattern component.
- **Optimistic drag-and-drop** on the kanban with server reconciliation and a toast
  + retry on failure, using the React adjust-during-render pattern to reconcile
  fresh server data with in-flight optimistic state.

### 5.6 Auth and the sociology of handover

Auth is passwordless (magic link + OTP fallback in the same email, via Better Auth),
with sign-ups restrictable to the university's email domains. The more interesting
design work is organizational:

- **Roles are a ladder** (read_only → analyst → partner → admin) checked by
  `roleAtLeast()` in every action.
- **The annual handover is a first-class flow** documented in
  [ADMIN_RUNBOOK.md](ADMIN_RUNBOOK.md) — written for a non-engineer officer.
- **Break-glass admin:** if the graduating cohort forgot to promote a successor, a
  `BOOTSTRAP_ADMIN_EMAIL` env var lets the new officer sign in as admin once, then
  gets unset. Lock-out by graduation is a *predictable* failure mode, so it has a
  documented, safe recovery path.
- **Exports are a feature, not an afterthought:** full JSON and CSV export endpoints,
  because a club must be able to leave. (Demographics are deliberately absent from
  exports — see §5.3.)

---

## 6. Testing philosophy

The strategy is **concentrate tests where wrongness is silent**: pure domain cores
that would corrupt data or leak information without visibly erroring.

| Suite | What it protects |
|---|---|
| `captable/engine.test.ts` | The golden-fixture corpus: hand-computed SAFE/note/round worked examples + property tests. **The hard merge gate.** |
| `votes/redact.test.ts` | The blind-vote redaction policy, viewer by viewer, state by state. |
| `insights/k-anonymize.test.ts` | Suppression thresholds, pooling, the suppressed-bucket-below-k edge. |
| `insights/calibration.test.ts` | Per-member conviction-vs-outcome math. |
| `grants/budget.test.ts` | Pool arithmetic and the overdraw guard. |
| `pipeline/gates.test.ts` | Stage-gate semantics, including the no-deadlock property. |
| `enrichment/fetch-meta.test.ts` | Meta-tag extraction from real-world HTML shapes. |

92 tests, 7 suites, all runnable in ~1 second (`pnpm test`) — fast enough that they
actually run before every push. The architectural choice that makes this possible is
the consistent extraction of domain logic into dependency-free modules: the engine,
redaction, gates, budget, and anonymization all take plain data in and return plain
data out. I/O lives in queries and actions; logic lives in `lib/*` where Vitest can
reach it without mocking a database.

CI (GitHub Actions) runs lint + the full suite on every push and PR, with pnpm
version sourced from `package.json`'s `packageManager` field — one source of truth.

---

## 7. What this project demonstrates

For a reader evaluating the engineering rather than the product:

- **Security posture appropriate to the platform.** Server Actions treated as public
  endpoints; a single mutation spine enforcing validation → authn → authz → audit;
  org scoping at the query level; HMAC-signed ingest; secrets rotatable from the UI.
- **Correctness where it counts.** Exact decimal arithmetic end-to-end; a numerical
  solver chosen for robustness over elegance (bisection across piecewise kinks);
  golden fixtures as a merge gate; engine versioning stamped on stored snapshots.
- **Privacy engineered, not promised.** Aggregate-only demographic reads, k-anonymity
  suppression, no cross-tabs, exclusion from exports — all structural.
- **Judgment about scale.** A 15-person club does not get a distributed refs
  service; it gets `max+1` with a unique index and a retry, and a comment explaining
  exactly why. Complexity is spent where it buys correctness (the engine), not where
  it buys résumé points.
- **Product thinking in the code.** Decline reasons as a required field (analytics
  depend on it), stage gates encoding club process, the handover runbook, break-glass
  recovery, exports-as-exit-rights — the sociology of a student org is designed for,
  not just the happy path.
- **A real design system.** Token-only theming, two page archetypes, a shared action
  vocabulary across palette/peek/shortcuts, print styles that turn a live report page
  into a clean PDF letter.

---

## 8. Running it

```bash
pnpm install
cp .env.example .env    # DATABASE_URL (any Postgres; Neon in prod), BETTER_AUTH_SECRET
pnpm db:push            # create the schema
pnpm dev                # http://localhost:3000 — first sign-in creates the club
pnpm seed:demo          # optional: a full fictional year of data (wipes first)
pnpm test               # the golden fixtures + domain suites
```

Deploys to Vercel in one click (see README badge) with a free Neon database; magic
links print to the console when no email key is configured, so the entire stack runs
locally with zero third-party accounts.

---

*OpenVenture is MIT-licensed. The Cap Table Lab is an educational modeling tool, not
legal or financial advice.*
