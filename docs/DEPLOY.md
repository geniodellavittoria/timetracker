# Deploying to Cloudflare

Everything needed to get this app live, written for someone with no prior context.

## Where things stand

| | |
|---|---|
| App | Built, 106 tests green, merged to `main` |
| CI | Runs typecheck, tests, tests under `TZ=Europe/Zurich`, and build on every PR |
| D1 database | Created; its id is in `wrangler.jsonc` |
| Schema on the **local** database | Applied |
| Schema on the **production** database | ⬜ not yet |
| `APP_PASSWORD` secret | ⬜ not yet |
| Deployed | ⬜ not yet |

Verified locally already, so there's no need to re-check: the calculations, the API against a real D1, the password gate covering the UI as well as `/api`, SPA deep-link fallback, and the live-recalculation UI. What has **never** run is a real deploy.

## Prerequisites

```bash
npm install
npx wrangler login
npx wrangler whoami        # confirms which account you're deploying into
```

If a browser login isn't possible, set `CLOUDFLARE_API_TOKEN` instead, with **Workers Scripts: Edit**, **D1: Edit** and **Account Settings: Read**.

## Step 1 — Apply the schema to the production database

```bash
npm run db:remote
```

> **This is the step people skip.** `npm run db:local` and `npm run db:remote` target two completely separate databases. Miss the remote one and the deploy succeeds, the UI loads, and every API call returns `internal_error` — because the `settings` row it expects doesn't exist. If you see that symptom, come back here first.

Confirm the seed landed:

```bash
npx wrangler d1 execute timetracker --remote \
  --command "select target_minutes_mon, workload_percent_x10 from settings"
```

Expect `504` and `1000` — a 42-hour week at 100%.

## Step 2 — Set the password

```bash
npx wrangler secret put APP_PASSWORD
```

The app has no login screen. It uses HTTP Basic auth with the username `me` and this secret as the password, and the gate covers the whole app, not just the API.

**Do not skip this.** With `APP_PASSWORD` unset the gate disables itself — which is what keeps local development frictionless, and what would leave a public deployment world-writable.

## Step 3 — Deploy

```bash
npm run deploy
```

A `predeploy` check refuses to build if `wrangler.jsonc` still holds a placeholder database id, so that particular mistake can't reach production. On a first deploy Cloudflare may ask you to register a `workers.dev` subdomain; accept it.

## Step 4 — Verify

Replace `<sub>` with your workers.dev subdomain and `<password>` with the secret.

```bash
# The gate covers the UI, not just the API
curl -s -o /dev/null -w '%{http_code}\n' https://timetracker.<sub>.workers.dev/
#   expect 401

curl -s -u me:'<password>' https://timetracker.<sub>.workers.dev/api/health
#   expect {"status":"ok"}

# Settings come from the real database — this is what proves step 1 worked
curl -s -u me:'<password>' https://timetracker.<sub>.workers.dev/api/settings
#   expect targetMinutesByWeekday [504,504,504,504,504,0,0]

# An unknown API path must be a JSON 404, not the SPA shell
curl -s -u me:'<password>' https://timetracker.<sub>.workers.dev/api/nope
#   expect {"error":{"code":"not_found",...}}
```

Then in a browser:

1. **Settings** → set your real workload (full-time week, percentage, tick the days you work) → **Apply to weekdays** → **Save settings**. Reload; values persist.
2. **Week** → log a day. The figure updates as you type; a `✓` appears about 600 ms later.
3. **Reload.** The entry is still there.
4. Open `/months/2026-08` directly and hard-reload — it must render, not 404. That's the SPA fallback.
5. **Run `npm run deploy` again** and reload. Your entries must survive. This is the one check that actually proves the database is independent of the Worker.

## When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `internal_error` on `/api/settings` | Schema never applied to production | `npm run db:remote` |
| Predeploy aborts with "placeholder `database_id`" | `wrangler.jsonc` not updated | `npx wrangler d1 create timetracker`, paste the id |
| No password prompt at all | `APP_PASSWORD` not set | Step 2 |
| `/api/*` prompts but the UI loads freely | Your wrangler ignores `assets.run_worker_first` | Upgrade wrangler; failing that, serve assets via `c.env.ASSETS.fetch()` behind the middleware in `src/worker/index.ts` |
| `Unknown field "run_worker_first"` | wrangler too old | `npm i -D wrangler@latest` |
| Every deep link 404s | Assets misconfigured | Check `dist/client` exists after `npm run build` |
| Build fails on `worker-configuration.d.ts` | The `wrangler types` postinstall didn't run | `npx wrangler types` |

## Two behaviours that will otherwise surprise you

**Targets are not versioned.** Changing a weekday target in Settings recalculates *every past balance*, not just future ones. There is no per-period history.

**Overnight shifts are rejected.** A leaving time at or before the arrival time fails validation, which also rules out `00:00` as a leaving time. This is enforced by a SQL `CHECK` as well as in the UI and API, so supporting night shifts later means a migration, not just relaxing a check.

## Backups

```bash
npx wrangler d1 export timetracker --remote --output backup.sql
```
