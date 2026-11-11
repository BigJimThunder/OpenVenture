# OpenVenture — UI/UX Design Brief

A working brief for redesigning or extending the interface. Everything here reflects
what is actually built and shipping, not aspiration. Use the real vocabulary, real
numbers, and real constraints below in mockups — this product's credibility comes from
looking like a tool that has actually run a fund, not a dashboard template.

---

## 1. What this is

**OpenVenture is the operating system for a student-run venture club that gives
non-dilutive grants to student founders.**

A college VC club has ~$10,000 a year to disburse in checks of **$200–$4,000**. The
money funds unglamorous things that unblock a student company: incorporation filing
fees, a registered agent, API credits, a hardware prototype, a conference trip. The club
takes **no equity, ever** — there is no portfolio value, no MOIC, no carry.

Today that operation is spread across Airtable, Notion, Google Sheets, Slack, and Google
Forms, and every May the institutional memory graduates with the seniors. OpenVenture
replaces the sprawl with one app that owns the club's deal flow, its written work, its
people, and its money.

It has a **second job that is equally important**: teaching. Members join to learn what
venture capital actually involves. So the app deliberately teaches four things through
use — portfolio construction, LP reporting, dilution math, and honest self-assessment of
your own judgment as an investor. Design decisions should serve both jobs; when they
conflict, the teaching one usually loses to the operating one, but it should never
disappear.

**Open source, self-hostable, one club per deployment.** Runs on Vercel + Neon for
roughly $0–15/month.

---

## 2. Who uses it

Fifteen or fewer people, all undergraduates, all unpaid, all busy.

| Role | Who they are | What they do here | Frequency |
|---|---|---|---|
| **Analyst** (default) | New and returning members, 1st–4th year | Screen applications, take coffee chats, write memos, vote | Weekly, ~20 min |
| **Partner** | Experienced members, usually juniors/seniors | Everything analysts do + reveal votes, write the LP letter | Weekly |
| **Admin** | The 1–2 officers who run the club | Members, settings, exports, the money | Weekly + a heavy week each term |
| **Read-only** | Prospective members, faculty advisor | Look, don't touch | Occasionally |

**Context of use matters a lot:**

- The weekly hour is a **meeting**. Several people are in a room, one laptop is projected,
  and members are voting on their phones. Meeting run mode is genuinely used on a phone.
- Coffee chats get logged **from a phone, in a café, right after the chat** — while the
  impression is fresh. If it takes more than 60 seconds, it doesn't get logged.
- Nobody is trained. Officers hand this to their successor in a 20-minute conversation
  and graduate. The UI has to teach its own workflow.
- Attention is scarce and voluntary. There is no manager. If a screen is tedious, members
  simply stop using it and the club reverts to a spreadsheet.

**Founders see exactly one screen: the application form.** `/apply` is a public, hosted
form a club can switch on and share as a single link (or keep its own form and post to
the signed ingest endpoint instead). Founders never sign in and never see the pipeline;
they hear from the club by email — application received, and, if the club opts in,
declined or funded. Everything else in this app is internal.

---

## 3. Product principles that drive the design

1. **One app, not five.** Everything touched weekly lives here. Resist patterns that
   imply "and then you go to Notion for the rest."
2. **Decisions leave a trail.** Stage moves, decline reasons, votes, and grants are all
   recorded and attributed. The interface should make the trail feel like an asset, not
   like surveillance.
3. **Blind by default.** IC votes are hidden until reveal — enforced server-side, and the
   UI must never imply otherwise.
4. **Privacy is code, not policy.** Demographic aggregates suppress small cells. A chart
   that could re-identify a person refuses to render that bucket.
5. **Teaching tool, not black box.** Every derived number — especially cap-table math —
   can expand to show its inputs.
6. **Dense but calm.** This is a working tool for people who are scanning, not browsing.
   Default body text is 13px, generous whitespace is spent on grouping rather than
   padding, and there is exactly one accent color.

---

## 4. Design system (already built — reuse it)

Tailwind v4 with OKLCH tokens in `src/app/globals.css`. **Components consume semantic
tokens only, never raw color values.** Both themes ship; dark mode is genuinely used
(evening meetings).

### Color

Cool graphite neutrals with a single cobalt accent. Values live in `globals.css`; the
roles are what matter:

```
--chrome      the app canvas: sidebar and the gutter around the working sheet
--bg          the working sheet (main content)
--bg-subtle   inset / hover
--panel       cards, inputs, menus
--border, --border-strong
--fg, --fg-muted (labels, secondary), --fg-subtle (timestamps, micro)
```

**One accent: cobalt** (`--accent`). Primary actions, selection, links and focus rings
only — never decoration. If two unrelated things on screen are cobalt, one of them is wrong.

**Semantic:** `success`, `warning`, `danger`, `info` — each with a `-bg` and `-border`
companion for badge/callout surfaces.

**Categorical (`--cat-1` … `--cat-10`):** cobalt, teal, amber, violet, green, pink, sky,
orange, plum, slate — pinned lightness and chroma so any subset harmonizes. Used for
pipeline stages, sectors, outcome tiers, and chart series. Never pick a chart color
outside this set.

**Elevation:** `shadow-xs` on cards and inputs, `shadow-md` on menus, `shadow-lg` on
dialogs. Hierarchy still comes mostly from borders and background steps.

### Type

Geist Sans / Geist Mono for the tool. A serif (Source Serif 4) appears in exactly one
place: document surfaces. The scale is deliberately compressed for density:

| Token | Size | Use |
|---|---|---|
| `2xs` | 11px | micro labels, timestamps, table column heads |
| `xs` | 12px | secondary text, badges |
| `sm` | **13px** | **default body — most of the app** |
| `base` | 14px | comfortable body |
| `md` | 16px | section titles |
| `lg` | 20px | page titles |
| `xl` | 24px | display |

Two required utilities:

- **`.tnum`** (tabular numerals) is **mandatory on every money or metric column.** Ragged
  digits in a budget table is the single most common way this app looks amateur.
- **`.prose-surface`** (serif, 17px / 1.7 / max 68ch) is the *only* place comfortable
  reading typography is allowed: memos, docs, LP letters. Everything else stays dense
  and sans.

On touch devices form controls render at 16px so phones don't zoom the page on focus.

### Shape and motion

`--radius: 0.5rem` (8px), with sm/md/lg/xl derived. Motion is functional only: no
decorative animation, no page transitions.

### Existing components

`src/components/ui/` (hand-written, shadcn-style, Radix primitives): avatar, badge,
button, card, checkbox, command, dialog, dropdown-menu, input, label, popover, progress,
scroll-area, select, separator, skeleton, sonner (toasts), switch, table, tabs, textarea,
tooltip.

`src/components/patterns/` (composed, app-specific — **pages compose these, not raw ui/**):
`PageHeader`, `StatCard`, `StageBadge`, `Money`, `EmptyState`, `ChartFrame`.

### Forms and writing surfaces

- **One field look.** Every control shares `fieldChrome` (`ui/input.tsx`): strong resting border, darker on hover, accent border with a soft ring on focus, danger when `aria-invalid`, flat grey when disabled. 36px with a mouse, 44px on touch. Never restyle a bare `<input>`, `<textarea>` or `<select>`; use `Input`, `Textarea`, `Select` (or `NativeSelect` for FormData forms), `Checkbox`, `Switch`.
- **Every control has a label.** Wrap it in `Field` (`patterns/field.tsx`), which wires `htmlFor`, `aria-describedby` and `aria-invalid`. Pass `optional`, `hint` and `error` rather than writing them into the label. Switch and checkbox rows use `FieldToggle`.
- **Money and units.** Amounts use `MoneyInput` (decimal string in and out, never a float) or `Input leading="$"` / `trailing="%"`.
- **Textareas grow** with their text; add `showCount` when a `maxLength` is tight enough to hit.
- **Prose is one editor.** Anything longer than a note uses `RichTextEditor` (`components/editor/rich-text.tsx`): `variant="document"` for memos, docs and reports; `variant="field"` for boxed notes. Read mode and print use `RichTextView`. Formatting appears on selection (a bubble on desktop, a docked bar on phones), `/` opens blocks, and links go through `safeHref`. The editor only emits `onChange`; the caller owns autosave.

### Shell

**Desktop:** a 240px sidebar sits directly on the chrome — club name, a search field
(⌘K) with a new-application button beside it, grouped nav, the admin's
getting-started progress card until setup is complete, and the account menu (profile,
theme, sign out) pinned at the bottom. The main content is a rounded sheet lifted off
the chrome. There is no global topbar: each screen renders its own 48px header.

**Phone:** the sidebar is replaced by a bottom tab bar — Inbox, Pipeline, a centred
new-application button, Meetings, Menu. Menu opens a sheet with every destination,
search, theme and sign-out. Dialogs become bottom sheets.

Nav groups:

- *(personal)* — Inbox (count of what needs you), My work, Schedule
- **Operate** — Pipeline (open count), Memos, Grants, Meetings, Members
- **Learn** — Insights, Outcomes, Cap Table Lab, Reports (funding requests, quarterly letters, annual report)
- **Club** — Docs, Onboarding, Settings (admins only)

**Keyboard:** ⌘K or `/` searches everything (companies, founders, memos, members,
meetings, docs) and runs commands; `C` creates an application; `G` then a letter jumps
to a screen (the letters are listed in ⌘K). A keyboard hint is only ever shown next to
a shortcut that works.

**Roles in the UI:** controls a member's role can't use are hidden or disabled with a
reason (`useCan` / `<Can>`), mirroring — never replacing — the server-side check.

---

## 5. Screen inventory

Every route that exists today, what it's for, and where it's weak.

### Operate

**`/` — Inbox.** The landing screen; answers "what needs me this week?" A 56px stat strip
(budget remaining, open applications, votes open, next meeting) over a triage list: 36px
rows grouped under Needs action / Open votes / Today, each row carrying a priority glyph,
mono ref, stage dot, SLA breach, amount, age and owner. *This screen decides whether
members come back.*

**`/my-work` — My work.** The same row vocabulary scoped to one member: applications they
own, memos they're writing, action items assigned to them.

**`/pipeline` — Kanban board.** (Renamed from `/applications`; the old paths permanently
redirect.) Columns are pipeline stages: Applied → Screening → Coffee Chat → Pitched Group
→ Decision → Funded / Declined, each header carrying its count and the sum requested. Drag
to move (dnd-kit). Cards show mono ref, company name, one-liner, ask amount, owner avatar,
and time-in-stage coloured against that stage's SLA. Selecting a card opens a 400px **peek
panel** (`?peek=<id>`, so it is linkable): stage stepper, property stack with single-key
hints, screening scores, activity, and vote/memo/decline actions. Space peeks, ↵ opens,
Esc closes, ↑/↓ walk the board, and ⌘K acts on the selection. Stages carry rules that the
UI must surface: Coffee Chat requires 2 attendees; Decision requires a memo and a vote.
*Weak: still unusable on a phone; the filter bar is presentational.*

**`/pipeline/[id]` — Application detail.** Two-column. Left: the ask (amount + use of
funds narrative), screening scorecard (5 criteria × 1–5, averaged across scorers), coffee
chat debriefs with per-attendee verdicts, notes thread. Right rail: Facts card (website,
founder, email, department, class year, campus source, owner, applied date) with an
"✨ Enrich from website" button, decision trail (memos + grants), stage history.
*Weak: the right rail is a wall of label/value rows; the screening scorecard is
read-only-looking when it should invite scoring.*

**`/memos` and `/memos/[id]` — Investment memos.** Templated sections, rich text (Tiptap),
autosave, inline comments in a right rail, version snapshots on circulate. Status:
draft → circulated → final → archived. `/memos/[id]/versions/[versionId]` shows a word-level
diff between versions.

**`/memos/[id]/vote` — Blind IC vote.** *The most consequential screen in the app.* Two
states that must look and feel unmistakably different:
- **Pre-reveal:** you can cast or change your own ballot; you see *only your own*. You do
  not see who has voted, who hasn't, or any tally. A recused member sees the recusal, not
  a ballot form. The screen should make the secrecy feel deliberate and trustworthy — the
  user's instinct is to suspect the chair can peek, and the design should answer that.
- **Post-reveal:** the full distribution — every ballot with voter, decision
  (fund / decline / abstain), conviction 1–5, rationale, and suggested amount; plus
  conviction spread and the recorded outcome.

**`/grants` — Grant tracker.** Table of grants through their lifecycle: proposed →
approved → issued → cashed → reconciled. Columns: company, amount, use of funds, status,
dates, receipts. Approving is budget-guarded — an over-pool approval is blocked with an
explanation, never a silent failure.

**`/grants/budget` — Budget burn-down.** Pool total, committed, deployed, remaining
(always *derived*, never stored). Charts: burn over time, spend by use-of-funds, average
check size. *This is the screen the treasurer reconciles against a bank statement.*

**`/meetings`, `/meetings/[id]`, `/meetings/[id]/run` — Meetings.** Agenda builder with
timeboxed items, two-tap attendance grid, action items with owners. **Run mode is a
distinct presentation-and-phone mode**: large type, current item, a timer, advance/back
controls. *Weak: run mode was designed at desktop width and is cramped where it matters
most.*

**`/members`, `/members/[id]`, `/onboarding` — People.** Roster with roles and cohorts;
per-member profile with sourcing attribution and participation; onboarding is a task
matrix (members × tasks) showing who has completed what. Invitations are email-based —
a pending member row links on first login.

### Learn

**`/insights` — The headline analytics screen.** Funnel conversion by stage, sector mix,
department mix (CS vs econ vs everything else), per-member sourcing attribution, decline
reason distribution, time-in-stage, and demographic aggregates. *This is what officers
show the faculty advisor and use to recruit.* **Hard constraint:** every demographic
bucket passes through k-anonymity with a minimum cell size of 5. Buckets under 5 collapse
into "Not shown (small group)", and if the collapsed bucket is still under 5 it is dropped
entirely. There are no two-way cross-tabs anywhere. The UI must present suppression as an
intentional privacy feature, not as missing data.

**`/members/me/insights` — Investor self-analysis.** Private to each member. Your yes-rate
vs. the club's, your conviction on companies that later did well minus your conviction on
the ones that went dormant, and your contrarian record (times you dissented and were
vindicated). *Tone is the whole design problem here: this must read as a coach, not a
scoreboard. It is a teaching surface for 19-year-olds.*

**`/outcomes` — Portfolio outcomes.** Since there's no equity, success is a **tier ladder**,
not a multiple: dormant → incorporated → launched → revenue → raised_round → accelerator →
acquired. "Meaningful outcome" = revenue or better. Shows the ladder distribution,
time-to-outcome, and per-company check-in history. *Teaching goal: most grants go nowhere
and that's the job — power laws, visualized honestly.*

**`/lab` and `/lab/[id]` — Cap Table Lab.** A dilution sandbox for **advising grantees**,
not tracking positions. A member sits with a founder who says "an accelerator offered
$125K for 7%" or "I won $60K on a SAFE at a $1.5M cap" and models what it means. An
immutable event ledger folds into a cap table: post-money SAFEs, pre-money SAFEs, notes
with interest, MFN, discounts, option pool top-ups, priced rounds, splits, transfers.
Presets seed common scenarios. Every derived number expands into a **"show your work"**
panel with its inputs, and a live round preview shows before / after / delta as you type.
*Weak: this is the most information-dense screen in the app and currently looks like a
spreadsheet. It has the most to gain from design.*

**`/reports` — LP quarterly letter.** A real GP letter generated from live data —
deployment stats as of quarter end, pipeline in review, grants issued, portfolio tier
movements — wrapped around a GP commentary the partners write themselves. A print
stylesheet turns it into a clean PDF: the app shell disappears, the letter becomes the
page. *Teaching goal: members learn what they owe the people who fund them.*

**`/docs`, `/docs/[slug]` — Internal wiki.** Thesis, process, decision log. Visibility
scoped (club-wide vs partners-only).

### Auth and setup

**`/login`** — email only. Magic link with a 6-digit OTP fallback (university mail
scanners eat one-time links). **`/setup`** — first-run club creation: name, school, email
domain restriction, grant pool. **`/settings`** — admin only: club config, the signed
website-form ingest endpoint, calendar feed URL, export everything.

---

## 6. Domain vocabulary — use these exact labels

**Pipeline stages:** Applied · Screening · Coffee Chat · Pitched Group · Decision ·
Funded · Declined

**Application status:** open · on_hold · funded · declined · withdrawn

**Decline reasons:** too early · not a fit · budget exhausted · team · unresponsive ·
duplicate · outside criteria · other

**Grant status:** proposed · approved · issued · cashed · reconciled

**Use of funds:** incorporation · legal · API credits · hosting · hardware · design ·
marketing · travel · prototyping · other

**Outcome tiers:** dormant · incorporated · launched · revenue · raised_round ·
accelerator · acquired

**Vote:** decision = fund / decline / abstain, conviction = 1–5, plus optional rationale
and suggested amount

**Roles:** read_only · analyst · partner · admin

---

## 7. Sample data for mockups

Don't use Lorem or "Acme Inc." The demo dataset is deliberately plausible; borrow it.

**Club:** Cardinal Ventures · FY2026 pool $10,000 (+$850 rollover) · fiscal year starts July

**Companies:** Lecture Loop · NightOwl Security · Quokka Health · Ferrite Robotics ·
AquaSense · ChirpDeck · Trailhead Robotics

**Members:** Tom Ridley (partner) · Casey Lee (analyst) · Riley Nguyen (analyst)

**Realistic figures:** ask $500 · award $2,337 · deployed to date $1,970 · remaining
$6,543 · 22 applications in a year · 4 funded · 14 received in the busiest quarter

**Real copy tone** (from shipped screens):

> "Incorporation filing fees and registered agent for the first year."

> "Impressive demo. Two paying pilots already. Fast yes from both of us."

> "We received **14** applications this quarter, funded **3**, and declined **2** — every
> decline with a recorded reason and a reply to the founder."

Dry, specific, first-person-plural. Never marketing voice, never exclamation points.

---

## 8. Hard constraints — a mockup that violates these is wrong

1. **Pre-reveal vote screens show no tally, no voter list, no who-hasn't-voted.** Not even
   for the chair or an admin.
2. **Demographic buckets under 5 people never render as a number.** They collapse to
   "Not shown (small group)".
3. **`.tnum` on every money and metric column.** No exceptions.
4. **Semantic tokens only** — no raw hex, no Tailwind palette colors like `blue-500`.
5. **One accent color.** Cobalt is for primary action, selection and focus, nothing else.
6. **Money is never a float.** Displayed via the `Money` component; the cap-table engine
   is the only place arithmetic happens.
7. **Founders never sign in.** The only founder-facing surface is the public `/apply`
   form and the emails the club sends. If a mockup implies a founder account, it's out of scope.
8. **Both themes.** Every screen must work in light and dark.

---

## 9. Where design help is most wanted

Ranked by impact:

1. **Mobile.** Meeting run mode, casting a vote, and logging a coffee chat all genuinely
   happen on a phone, and all three were designed at desktop width. This is the biggest gap.
2. **The Cap Table Lab.** The densest, most valuable, least designed screen. How do you
   make dilution legible to a 19-year-old without dumbing it down?
3. **Today.** It should make a busy member feel oriented in five seconds. Today it's a
   competent card grid.
4. **The blind vote screen.** Pre-reveal secrecy should *feel* trustworthy and a little
   ceremonial; reveal should feel like an event.
5. **Empty states.** A brand-new club sees empty everything on day one — and that's the
   moment it decides whether to adopt this or go back to Airtable. Each empty state should
   teach the workflow, not apologize.
6. **Self-analysis tone.** Coaching, not ranking. Nobody should feel graded.
7. **Onboarding matrix.** Members × tasks grids get ugly fast at 15 × 12.

---

## 10. Stack notes (constrain what's buildable)

Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Radix primitives ·
Recharts (charts) · Tiptap (rich text) · dnd-kit (kanban) · Drizzle + Neon Postgres ·
Better Auth.

Mockups should be implementable with these. Recharts constrains chart types to the
conventional set — bar, line, area, pie, scatter, radial — so an exotic visualization is a
build cost, not a free choice. All colors must come from the `--cat-*` set.
