<div align="center">

# OpenVenture

**The open-source operating system for student-run venture funds and grant programs.**

Applications, screening, memos, blind IC votes, and budget-guarded grants — with the
discipline of a real fund and none of the spreadsheet sprawl.

[![CI](https://github.com/BigJimThunder/OpenVenture/actions/workflows/ci.yml/badge.svg)](https://github.com/BigJimThunder/OpenVenture/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Postgres](https://img.shields.io/badge/Postgres-Neon-336791?logo=postgresql&logoColor=white)](https://neon.tech)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/pipeline-dark.png">
  <img alt="OpenVenture pipeline board — applications moving through Applied, Screening, Coffee Chat, Pitched Group and Decision" src="docs/screenshots/pipeline-light.png" width="900">
</picture>

</div>

## Why

College VC clubs run on a sprawl of Airtable, Notion, Google Sheets, Slack pings, and
Google Forms — and every spring the institutional memory graduates with the seniors.
OpenVenture replaces that sprawl with one application that owns the club's deal flow, its
written work, its people, and its money — and doubles as a training ground for the skills
venture firms actually expect.

Built for clubs that make **non-dilutive grants** to student founders (a ~$10k/year pool,
checks from $200–$4,000) but useful to any student investing group.

> Every screenshot on this page is the real app, rendered from the demo seed
> (`pnpm seed:demo`) — fictional companies, plausible numbers.

## What's inside

| Module | What it does |
|---|---|
| **Intake & pipeline** | Applications flow from your website form straight into a kanban: Applied → Screening → Coffee Chat → Pitched Group → Decision → Funded/Declined. Declines require a reason — that's what makes the annual retro real. |
| **Memos & blind IC voting** | Templated memos with section versioning and comments; conviction voting that stays **hidden until reveal** — the cheapest anti-groupthink mechanism there is. |
| **Grants** | The pool, requests, approve → issue → reconcile, receipts, budget burn-down with an overdraw guard. |
| **Members, onboarding, meetings** | Roster, onboarding checklists, agenda builder, two-tap attendance, run mode, recaps, iCal feed. |
| **Insights** | Funnel conversion, sector & department mix, per-member sourcing attribution, decline reasons, outcome tiers, and per-member investor self-analysis. |
| **Cap Table Lab** | A dilution sandbox for advising grantees: pitch-comp SAFEs, "$125K for 7%" accelerator deals, pool shuffles — with "show your work" on every derived number. |
| **LP reports** | Quarterly letters generated from real data — deployment, pipeline, portfolio moves — plus GP commentary, print-ready for PDF. |
| **Enrichment & export** | One-click company enrichment from the founder's own website (optional Claude pass with an `ANTHROPIC_API_KEY`); full JSON/CSV export — your data is never locked in. |

## The work, not just the workflow

Memos are documents, not form fields — templated sections, versioned, commentable, and
tied back to the application they argue about.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/memo-dark.png">
  <img alt="A grant memo with Summary, Team, Product & Traction and Use of Funds sections, a completion meter, and a comments rail" src="docs/screenshots/memo-light.png">
</picture>

Votes are **blind by default**. Conviction scores and rationales stay sealed until the
round is revealed — enforced server-side, not by convention. Only `getVoteRoundResults()`
may read ballots pre-reveal.

## Money that reconciles

Every grant walks propose → approve → issue → reconcile, against a pool that knows its own
budget. Approvals are budget-guarded, so the club cannot overdraw the pool by accident.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/grants-dark.png">
  <img alt="Grants page showing budget, committed, deployed and remaining tiles above a table of grants with status, amount, use of funds and issue date" src="docs/screenshots/grants-light.png">
</picture>

## The season, in numbers

The headline module. Funnel conversion, where applications actually come from, who sourced
what, and why the club said no.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/insights-dark.png">
  <img alt="Insights dashboard with stage conversion funnel, applications per month, decline reasons, department mix, campus source and member sourcing attribution" src="docs/screenshots/insights-light.png">
</picture>

Self-reported demographics are **aggregate-only**, suppressed below a cell size of 5, with
no per-person display, no export, and no two-way cross-tabs. Small clubs can re-identify a
person from a chart, so the chart refuses.

## Cap Table Lab

A dilution sandbox for advising grantees — and a teaching tool. Every derived number
expands to the arithmetic that produced it.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/lab-dark.png">
  <img alt="Cap Table Lab showing an event ledger, fully-diluted ownership, a priced-round preview with before/after ownership, and an expanded show-your-work panel" src="docs/screenshots/lab-light.png">
</picture>

`src/lib/captable/engine.ts` is a pure function — no I/O, no floats, all `decimal.js` —
that folds an immutable event ledger into a cap table. It handles:

- **Post-money SAFEs** (YC mechanics: fixed `principal ÷ cap` ownership, pool increase excluded from their denominator)
- **Pre-money SAFEs** (original YC convention, sharing pool-shuffle dilution)
- **Notes** with accrued interest, **MFN** resolution, **discounts** (better-of pricing)
- Pool top-ups, splits, and transfers

Priced rounds are solved by bisection on a monotone residual, so it stays robust across the
piecewise kinks where instruments switch between cap and discount pricing — and it tells you
clearly when a pool target is mathematically unattainable.

```bash
pnpm test    # golden-fixture corpus: hand-computed worked examples + property tests
```

> **Disclaimer:** the Cap Table Lab is an educational modeling tool, not legal or financial
> advice. Verify against the company's own records before anyone signs anything.

## Quickstart

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL (Neon), BETTER_AUTH_SECRET
pnpm db:push                # create the schema
pnpm dev                    # http://localhost:3000
```

First sign-in walks you through creating the club (name, school, email-domain restriction,
grant pool). Without a `RESEND_API_KEY`, magic links print to the server console — fine for
local dev.

Want a full plausible year of demo data (fictional companies only)?

```bash
pnpm seed:demo
```

### Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBigJimThunder%2FOpenVenture&env=DATABASE_URL,DATABASE_URL_DIRECT,BETTER_AUTH_SECRET,BETTER_AUTH_URL&envDescription=Neon%20Postgres%20URLs%20and%20an%20auth%20secret%20—%20see%20.env.example&project-name=openventure&repository-name=openventure)

Create a free [Neon](https://neon.tech) database first, paste its pooled and direct URLs
when prompted, run `pnpm db:push` once against it, and sign in — first sign-in walks you
through creating the club.

Runs comfortably at **$0–15/month**: Vercel Hobby + Neon usage-based + Resend free tier.
One club per deployment, self-hostable, no multi-tenant SaaS in the middle.

Handing the club to next year's officers? Read **[ADMIN_RUNBOOK.md](ADMIN_RUNBOOK.md)** — a
non-engineer's guide to invites, exports, the annual handover checklist, and the
break-glass admin hatch.

### Wiring your website form

Settings → Application intake gives you a signed endpoint:

```
POST /api/ingest/application
x-openventure-signature: sha256=<HMAC-SHA256 of raw body>
```

Your existing form POSTs JSON there; the application lands in the pipeline instantly and
pings your Slack webhook. No Airtable, no copy-paste.

## Design principles

- **One app, not five.** Everything a member touches weekly lives here.
- **Decisions leave a trail.** Stage moves, decline reasons, votes, and grants are all recorded — the club's memory survives officer turnover.
- **Blind by default.** IC votes are hidden until reveal, enforced server-side.
- **Privacy is code, not policy.** Demographics are aggregate-only with k-anonymity suppression.
- **Teaching tool, not black box.** Every derived cap-table number expands to its inputs.
- **Money is never a float.** All amounts and shares are `decimal.js` or numeric strings, and every cap-table calculation lives in one pure engine.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn-style components · Drizzle ORM ·
Neon Postgres · Better Auth (magic link + email OTP) · Resend · Recharts · dnd-kit · Vitest.

Every mutation goes through a single `authedAction` wrapper — Zod validation, session
check, role check, handler, activity log — because Server Actions are public POST endpoints
and authorization belongs inside them, never only in middleware.

## Contributing

Issues and pull requests are welcome. Before opening a PR:

```bash
pnpm lint
pnpm test     # the cap-table golden fixtures are the hard gate — never merge them red
pnpm build
```

Conventions worth knowing are in [CLAUDE.md](CLAUDE.md); the visual system is in
[DESIGN_BRIEF.md](DESIGN_BRIEF.md).

## License

[MIT](LICENSE)
