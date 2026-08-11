# OpenVenture Admin Runbook

For the club officer who keeps the lights on. **No engineering background assumed.**
Bookmark this; hand it to your successor every spring.

## The three dashboards you own

| Service | What it runs | Where |
|---|---|---|
| **Vercel** | The app itself | vercel.com → your project |
| **Neon** | The database (all club data) | console.neon.tech |
| **Resend** | Sign-in and recap emails | resend.com → Domains |

All three have free/hobby tiers that comfortably fit a 15-person club. If the app
is down, check Vercel first (Deployments tab — is the latest one red?), then Neon
(is the database suspended or over quota?).

## Everyday admin

### Invite a new member
Members → **Invite** → enter their school email and pick a role. They sign in with
a magic link to that email — there is no password to share. Roles:

- **read_only** — can look, can't touch. Good for prospective members.
- **analyst** — the default. Runs applications, writes memos, votes.
- **partner** — everything analysts do, plus reveal votes, edit LP commentary.
- **admin** — everything, plus settings, members, exports. Keep **at least two admins at all times.**

### Offboard a member
Members → their profile → **Offboard**. Their history (votes, memos, sourcing
credit) is preserved; they just can't sign in. Never delete rows in the database
to remove someone.

### Rotate the intake secret
If the website-form secret leaks (or annually, out of caution): Settings →
Application intake → **Rotate secret**, then paste the new secret into wherever
your website form is hosted. The old secret stops working immediately. Rotating
also changes the calendar-feed URL — re-subscribe in Google/Apple Calendar.

### Email health
If magic links stop arriving: Resend dashboard → Domains → your domain should
show SPF and DKIM as **Verified**. If Resend is down or the key is missing,
there's a fallback: sign-in offers a 6-digit code as well as a link, and in local
development codes print to the server console.

## The annual handover checklist (do this every spring)

1. **Promote the successor to admin** (Members → role dropdown) *while you still can*.
2. Confirm there are **two admins** among people who haven't graduated.
3. Transfer ownership of the Vercel project, Neon project, and Resend account to
   club-owned logins (use a shared club email like `vcclub@school.edu`, not a
   personal one that graduates too).
4. **Download an export** (Settings → Export everything → Full JSON dump) and put
   it in the club's shared drive. This is your offline backup of every decision
   the club has ever made.
5. Rotate the intake secret and `BETTER_AUTH_SECRET` (Vercel → Settings →
   Environment Variables) if any graduating member had infrastructure access.
6. Walk the successor through this runbook. Twenty minutes now saves a lost year.

## Locked out (break-glass admin)

Every admin graduated and nobody was promoted? There's a hatch:

1. Sign in to **Vercel** → your project → Settings → Environment Variables.
2. Add `BOOTSTRAP_ADMIN_EMAIL` = the new officer's email address.
3. Redeploy (Deployments → ⋯ on the latest → Redeploy).
4. The new officer signs in with that email — they're automatically created as
   (or promoted to) an **admin**.
5. **Remove the variable and redeploy again.** Don't leave the hatch open.

This requires access to the Vercel account — which is why step 3 of the handover
checklist matters.

## Exports and what's deliberately missing

Settings → **Export everything** gives a full JSON dump plus CSVs for
applications, grants, members, and outcomes. Two things never leave the system,
by design, and this is not configurable:

- **Self-reported founder demographics** — aggregate-only inside the app
  (small-group numbers are suppressed), and excluded from every export.
- **Ballots for unrevealed vote rounds** — blind means blind, even for admins.

## Money notes

- The app tracks the grant pool, but the **actual money** lives in the club's
  bank account. Reconcile quarterly: Grants → Budget should match the bank
  statement. Mark checks as cashed when they clear.
- Remaining budget is always computed from grants, never typed in — if the
  number looks wrong, a grant record is wrong, so fix the grant.

## When something breaks

1. Vercel → Deployments: red build? Open it and read the error. A rollback is
   one click ("Instant Rollback" on the last green deployment).
2. Neon → is the project suspended (free-tier idle) or out of storage?
3. Still stuck? Open an issue on the GitHub repo — this is open source, and the
   maintainers have seen your error before.
