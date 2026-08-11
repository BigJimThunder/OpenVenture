# OpenVenture

**The open-source operating system for student-run venture funds and grant programs.**

College VC clubs run on a sprawl of Airtable, Notion, Google Sheets, Slack pings, and Google Forms — and every spring the institutional memory graduates with the seniors. OpenVenture replaces that sprawl with one application that owns the club's deal flow, its written work, its people, and its money — and doubles as a training ground for the skills venture firms actually expect.

Built for clubs that make **non-dilutive grants** to student founders (a ~$10k/year pool, checks from $200–$4,000) but useful to any student investing group.

## Modules

| Module | Status | What it does |
|---|---|---|
| **Intake & pipeline** | ✅ Shipped | Applications flow from your website form straight into a kanban: Applied → Screening → Coffee Chat → Pitched Group → Decision → Funded/Declined. Declines require a reason — that's what makes the annual retro real. |
| **Grants** | ✅ Shipped | The pool, requests, approve → issue → reconcile, receipts, budget burn-down with an overdraw guard. |
| **Memos & blind IC voting** | ✅ Shipped | Templated memos with section versioning and comments; conviction voting that stays **hidden until reveal** — the cheapest anti-groupthink mechanism there is. |
| **Members, onboarding, meetings** | ✅ Shipped | Roster, onboarding checklists, agenda builder, two-tap attendance, run mode, recaps, iCal feed. |
| **Insights** | ✅ Shipped | The headline: funnel conversion, sector & department mix, per-member sourcing attribution, decline reasons, outcome tiers (the grant-world power-law lesson), and per-member investor self-analysis. |
| **Cap Table Lab** | ✅ Shipped | A dilution sandbox for advising grantees: pitch-comp SAFEs, "$125K for 7%" accelerator deals, pool shuffles — with "show your work" on every derived number. |
| **LP reports** | ✅ Shipped | Quarterly letters generated from real data — deployment, pipeline, portfolio moves — plus GP commentary, print-ready for PDF. |
| **Enrichment & export** | ✅ Shipped | One-click company enrichment from the founder's own website (optional Claude pass with an `ANTHROPIC_API_KEY`); full JSON/CSV export — your data is never locked in. |

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn-style components · Drizzle ORM · Neon Postgres · Better Auth (magic link + email OTP) · Resend · Recharts · dnd-kit · Vitest.

Runs comfortably at **$0–15/month**: Vercel Hobby + Neon usage-based + Resend free tier.

## Getting started

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBigJimThunder%2FOpenVenture&env=DATABASE_URL,DATABASE_URL_DIRECT,BETTER_AUTH_SECRET,BETTER_AUTH_URL&envDescription=Neon%20Postgres%20URLs%20and%20an%20auth%20secret%20—%20see%20.env.example&project-name=openventure&repository-name=openventure)

Create a free [Neon](https://neon.tech) database first, paste its pooled and direct
URLs when prompted, run `pnpm db:push` once against it, and sign in — first sign-in
walks you through creating the club.

Handing the club to next year's officers? Read **[ADMIN_RUNBOOK.md](ADMIN_RUNBOOK.md)** —
a non-engineer's guide to invites, exports, the annual handover checklist, and the
break-glass admin hatch.

### Run locally

```bash
pnpm install
cp .env.example .env        # fill in DATABASE_URL (Neon), BETTER_AUTH_SECRET
pnpm db:push                # create the schema
pnpm dev                    # http://localhost:3000
```

First sign-in walks you through creating the club (name, school, email-domain restriction, grant pool). Without a `RESEND_API_KEY`, magic links print to the server console — fine for local dev.

Want a full plausible year of demo data (fictional companies only)?

```bash
pnpm seed:demo
```

### Wiring your website form

Settings → Application intake gives you a signed endpoint:

```
POST /api/ingest/application
x-openventure-signature: sha256=<HMAC-SHA256 of raw body>
```

Your existing form POSTs JSON there; the application lands in the pipeline instantly and pings your Slack webhook. No Airtable, no copy-paste.

## The cap table engine

`src/lib/captable/engine.ts` is a pure function — no I/O, no floats, all `decimal.js` — that folds an immutable event ledger into a cap table. It handles post-money SAFEs (YC mechanics: fixed `principal ÷ cap` ownership, pool increase excluded from their denominator), pre-money SAFEs (original YC convention, sharing pool-shuffle dilution), notes with accrued interest, MFN resolution, discounts (better-of pricing), pool top-ups, splits, and transfers. Priced rounds are solved by bisection on a monotone residual, so it's robust across the piecewise kinks where instruments switch between cap and discount pricing — and it tells you clearly when a pool target is mathematically unattainable.

Run the golden-fixture corpus (hand-computed worked examples + property tests):

```bash
pnpm test
```

## Design principles

- **One app, not five.** Everything a member touches weekly lives here.
- **Decisions leave a trail.** Stage moves, decline reasons, votes, and grants are all recorded — the club's memory survives officer turnover.
- **Blind by default.** IC votes are hidden until reveal, enforced server-side.
- **Privacy is code, not policy.** Self-reported demographics are aggregate-only with k-anonymity suppression; small clubs can re-identify from a chart, so the chart refuses.
- **Teaching tool, not black box.** Every derived cap-table number expands to its inputs.

> **Disclaimer:** the Cap Table Lab is an educational modeling tool, not legal or financial advice. Verify against the company's own records before anyone signs anything.

## License

MIT
