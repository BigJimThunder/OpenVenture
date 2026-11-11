# OpenVenture Admin Runbook

For the club officer who keeps the lights on. **No engineering background assumed.**
Bookmark this; hand it to your successor every spring.

## The three dashboards you own

| Service | What it runs | Where |
|---|---|---|
| **Vercel** | The app itself | vercel.com → your project |
| **Neon** | The database (all club data) | console.neon.tech |
| **Resend** | Sign-in links, reminders, digests, replies to founders | resend.com → Domains |
| **GitHub** | Your copy of the code (Vercel deploys from it) | github.com → your repository |

All of them have free/hobby tiers that comfortably fit a 15-person club.

**The one link to remember: `https://your-site/api/health`.** It says, in plain
words, whether the database is reachable and up to date, whether email is
connected, and whether the daily schedule is protected. It never shows a secret,
so it's safe to paste into a message when asking for help.

If the app is down, check `/api/health` first, then Vercel (Deployments tab — is
the latest one red?), then Neon (is the database suspended or over quota?).

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

### Open or close applications
Settings → Intake → **Application form**. When it's on, founders apply at
`https://your-site/apply` (the link is also on the Getting started page). When
it's off, that page shows your "we're closed" message instead — write one that
says when you reopen. Closing the form never touches applications you already
have.

### Rotate the intake secret
Only matters if your own website form posts applications to OpenVenture. If
that secret leaks (or annually, out of caution): Settings → Intake →
**Rotate secret**, then paste the new secret into wherever
your website form is hosted. The old secret stops working immediately. Rotating
also changes the calendar-feed URL — re-subscribe in Google/Apple Calendar.

### Email health
If sign-in emails stop arriving: Resend dashboard → Domains → your domain should
show SPF and DKIM as **Verified**, and `EMAIL_FROM` in Vercel must use that
domain. Until a domain is verified, Resend only delivers to the address that
owns the Resend account — so the first admin can sign in, but nobody they invite
can. Every sign-in email carries a 6-digit code as well as a link, because some
university mail scanners "click" links before you do.

Resend's free tier allows 100 emails a day. OpenVenture is built to stay well
under it: reminders are batched into one email per person, never one per event.

### AI connections (access tokens)
Any member can let their own AI assistant act as them: account menu → **Connect
your AI**. They create a token there, paste it into the assistant, and the
assistant can then read (and, with a write token, change) exactly what that
member can. Everything it changes is in the activity log under the member's name.

What you need to know as an admin:

- **See who has connected one.** Connect your AI → **Other members' tokens**
  lists every working token in the club: owner, name, read or write, last used.
  **Revoke** stops it at once. Do this when a laptop is lost, or when someone
  says "I pasted my token somewhere I shouldn't have".
- **Offboarding.** Offboarding a member stops all their tokens immediately,
  with nothing else to do. The tokens stay in the list (marked *Owner
  offboarded*) until you revoke them; revoke them so the list stays clean.
- **At handover.** Before the outgoing officers lose access, open the list
  together and revoke every token that belongs to someone leaving or changing
  role, and any that says *Never expires*. A token is as good as a password.
- **Role changes.** A token never does more than its owner's current role. If
  you demote a partner to analyst, their assistant loses the partner tools on
  its next request.
- **Limits.** 120 requests a minute per token. An assistant can email its own
  member 10 times a day, send 5 digests a day, and (partners and admins only)
  email other members 20 times a day. It cannot email founders at all. The
  per-minute limit is counted per server instance, so on Vercel it is a guard
  against a runaway loop rather than an exact ceiling; the email limits are
  counted in the database and are exact.
- **What it will never do.** Cast or reveal a vote, approve or issue a grant,
  invite or offboard anyone, change settings, delete anything, or make more
  tokens. Those stay with a signed-in person.
- **Turning it off.** Set the environment variable `MCP_DISABLED=1` (Vercel →
  Settings → Environment Variables, then Redeploy). Every token is refused and
  the page stops offering new ones. Existing tokens are kept and work again
  when you remove the variable. If you want them gone for good, revoke them
  first.
- **If an assistant "can't connect".** `401` means the token is wrong, expired,
  revoked, or its owner was offboarded: make a new one. `404` means
  `MCP_DISABLED` is set. `429` means it hit the per-minute limit and should
  wait. Check that the address ends in `/api/mcp` and that `BETTER_AUTH_URL` is
  your real site address, because the setup lines on the page are built from it.

## Scheduling

Reminders, the Monday digest and auto-closing votes all come from **one request
a day** to `/api/cron/daily`. It is safe to run more than once: everything it
sends is remembered, so nobody is emailed twice.

| What it does | When |
|---|---|
| Closes vote rounds whose deadline has passed (it never reveals them) and tells partners they're ready | Daily |
| Reminds every eligible voter that a vote closes soon | The day before it closes |
| Nudges the owner of an application that has sat past its stage deadline (admins, if nobody owns it) | Once per application per stage |
| Sends each member a digest of what needs them | Mondays, in the club's timezone |
| Reminds the owner to check in with a funded company | When 90 days pass without an update, at most once a quarter |

Each one has a switch in Settings → Automations.

**On Vercel** this is already set up (`vercel.json` schedules it for 12:00 UTC,
early morning in the Americas). It only needs the `CRON_SECRET` environment
variable to exist — any long random string. Check Vercel → your project →
Settings → Cron Jobs to see the last run. On the Hobby plan Vercel may run it
any time within that hour, which is fine.

**On any other host**, have a scheduler make the same request once a day:

```
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/daily
```

A crontab line for 12:00 UTC: `0 12 * * * curl -fsS -H "Authorization: Bearer YOUR_SECRET" https://your-site/api/cron/daily`.
A free scheduled GitHub Action or cron-job.org does the same job. The response
is a short JSON summary of what each job did.

**Did it run?** Open the response, or look at Vercel → Logs for
`/api/cron/daily`. `401` means the secret doesn't match; `503` means
`CRON_SECRET` isn't set. If emails say "only printed to the server log",
`RESEND_API_KEY` is missing.

## The annual handover checklist (do this every spring)

1. **Promote the successor to admin** (Members → role dropdown) *while you still can*.
2. Confirm there are **two admins** among people who haven't graduated.
3. Transfer ownership of the Vercel project, Neon project, and Resend account to
   club-owned logins (use a shared club email like `vcclub@school.edu`, not a
   personal one that graduates too).
   Do the same for the GitHub repository (Settings → Transfer, or add the
   successor as an owner).
4. **Download an export** (Settings → Data → Full JSON dump) and put it in the
   club's shared drive. This is your offline backup of every decision the club
   has ever made.
5. Rotate the intake secret, `BETTER_AUTH_SECRET` and `CRON_SECRET` (Vercel →
   Settings → Environment Variables, then Redeploy) if any graduating member had
   infrastructure access. Changing `BETTER_AUTH_SECRET` signs everyone out once.
6. Create next year's grant pool (Settings → Money) so approvals keep working
   after the fiscal year turns over.
7. Sit down with the successor at the app's **Getting started** page
   (`/welcome`). It is the one-page version of how a week works, written to be
   read aloud. Then skim this runbook together. Twenty minutes now saves a lost
   year.

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

## Backups

You have two, and you should use both:

- **Neon keeps point-in-time history** on its own (about a day on the free
  plan, longer on paid). Neon console → Branches → Restore. This is for "we
  broke something an hour ago".
- **Your export is the long-term backup.** Settings → Data → Full JSON dump,
  once a term and at every handover, saved to the club's shared drive. This is
  for "the account was deleted" or "we're moving hosts".

## Upgrades

To pick up a new version of OpenVenture, how you do it depends on how the club's
copy of the code was made:

- **It's a fork** (the repository page says "forked from …"): click
  **Sync fork → Update branch**. Vercel notices and deploys it. That's the whole
  process.
- **It was created by the Deploy button** (no "forked from"): there is no sync
  button. Ask a member who uses git to run the three commands under "For the
  technically inclined" below — a five-minute job once or twice a year.

Database changes that come with a new version are applied **automatically
during that deploy**, before the new code goes live. You never run a database
command. If a database change fails, the deploy fails, nothing is changed, and
the previous version keeps running — open the red deployment in Vercel and read
the lines starting with `[migrate]`; they say what went wrong in plain words.

`/api/health` shows `migrations: N of N applied` when the database matches the
code.

<details>
<summary>For the technically inclined</summary>

`pnpm build` runs `scripts/migrate.mjs` before `next build`. It applies the SQL
files in `drizzle/` inside one transaction behind an advisory lock and records
them in `drizzle.__drizzle_migrations` (the same table `drizzle-kit` uses). A
database that was originally created with `drizzle-kit push` is detected: any
migration whose tables and columns already exist is recorded instead of re-run.
If a migration is only half present the script stops without changing anything
and prints what is there and what is missing. `pnpm db:status` reports without
changing anything; `SKIP_DB_MIGRATE=1` builds without touching the database.


Updating a non-fork copy:

```
git remote add upstream https://github.com/BigJimThunder/OpenVenture.git
git pull upstream main
git push
```

</details>

## Exports and what's deliberately missing

Settings → **Data** gives a full JSON dump plus CSVs for
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

0. Open `https://your-site/api/health`. Anything marked `"ok": false` tells you
   where to look.
1. Vercel → Deployments: red build? Open it and read the error. A rollback is
   one click ("Instant Rollback" on the last green deployment).
2. Neon → is the project suspended (free-tier idle) or out of storage?
3. Still stuck? Open an issue on the GitHub repo — this is open source, and the
   maintainers have seen your error before.
