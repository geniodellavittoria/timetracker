# ⏱ Time Tracker

A personal work-hours tracker. Enter when you arrived, how many minutes of break you took,
and when you left — it works out your hours, sums them per day, and keeps a running
overtime balance against a target you configure per weekday.

Single user, no accounts. Runs free on Cloudflare Workers with a D1 database.

## What it does

- **One row per day**: arrival, break minutes, leaving time → worked hours, computed as you type.
- **Per-weekday targets**, with a workload panel so you can say "42 h week, 80 %, Friday off"
  and let it do the division.
- **Days off anywhere in the week.** A target of 0 *is* a day off — weekends aren't special, so a
  mid-week day off works exactly the same way. Hours you do work on a day off count as pure overtime.
- **Vacation / sick / holiday** day types, which count as that weekday's target so they neither
  earn nor cost overtime.
- **Week and month views** with per-week buckets, and a cumulative balance in the header.
- **Untracked days are flagged, not punished.** A workday you never logged doesn't drag your
  balance down; it shows up as "⚠ N untracked workdays" instead.

## Getting started

```bash
npm install
npx wrangler login
npx wrangler d1 create timetracker     # paste the printed database_id into wrangler.jsonc
npm run db:local                       # create the local dev database
npm run dev                            # http://localhost:5173
```

`npm run dev` runs the Worker in Cloudflare's real runtime *and* the React client with hot
reload, on one origin — so local behaviour matches production.

### Deploying

```bash
npm run db:remote                      # apply migrations to the production database
npx wrangler secret put APP_PASSWORD   # set a password (see below)
npm run deploy                         # → https://timetracker.<your-subdomain>.workers.dev
```

Cloudflare's free tier covers this comfortably: 100 k Worker requests/day, and D1 gives 5 GB
with 5 M row reads and 100 k row writes a day. A single person logging every working day for a
year is a few hundred rows.

**[docs/DEPLOY.md](docs/DEPLOY.md)** has the full runbook — a verification checklist for the
live deployment, and a table of what to do when a step fails.

### Password protection

The deployed URL is public, so set `APP_PASSWORD` as a Worker secret. The whole app is then
behind HTTP Basic auth — the UI as well as the API — with username `me`.

Locally the gate is off unless you create a `.dev.vars` file (see `.dev.vars.example`), so
development stays frictionless.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Worker + client with hot reload on http://localhost:5173 |
| `npm test` | Full suite: calculations, API, and UI components |
| `npm run test:tz` | The same suite under `TZ=Europe/Zurich` — see below |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production build into `dist/` |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run db:local` / `db:remote` | Apply migrations |

## How it's put together

```
src/shared/   Pure calculation code — imported by BOTH the client and the Worker
src/worker/   Hono API on the Workers runtime, D1 for storage
src/client/   React 19 + Vite
migrations/   D1 schema, applied by wrangler
```

`src/shared/` is the important part. The same `workedMinutesFor` and `buildRangeSummary` run in
the browser for the live preview and in the Worker as the authority, so the number that appears
while you type is by construction the number that gets stored.

Three layers enforce the same rules — the shared validators on the client, the same validators
in the Worker, and `CHECK` constraints in SQL. That's deliberate: the database constraint is the
one that still holds if the other two have a bug.

### Two things to know

**Targets aren't versioned.** Changing a weekday target recalculates every past balance, not just
future ones. Fine for personal use; worth knowing before you edit them mid-year.

**Overnight shifts aren't supported.** A leaving time at or before the arrival time is rejected,
in the UI, the API and the database. That also rules out `00:00` as a leaving time.

### Time and timezones

Times are stored as integer minutes since midnight, and all arithmetic stays in whole minutes —
decimals only ever appear in formatters, so totals can't drift. Every date helper uses UTC
internally; the browser sends its own local `today` to the summary endpoint, because Workers run
in UTC and would otherwise call a 01:00 entry in Zurich "tomorrow".

`npm run test:tz` exists for this reason. The DST test in `test/shared/dates.test.ts` passes
trivially under UTC and only has teeth in a timezone with daylight saving.

## Backups

```bash
npx wrangler d1 export timetracker --remote --output backup.sql
```
