# Deploying to Cloudflare

Everything needed to get this app live, written for someone with no prior context.

## Where things stand

| | |
|---|---|
| App | Built, tests green, merged to `main` |
| CI | Runs typecheck, tests, tests under `TZ=Europe/Zurich`, and build on every PR |
| D1 database | Created; its id is in `wrangler.jsonc` |
| Schema (incl. accounts) on the **local** database | Applied |
| Schema (incl. accounts) on the **production** database | ⬜ not yet |
| Deployed | ⬜ not yet |

Verified locally already, so there's no need to re-check: the calculations, the API against a real D1, register/login/logout and per-user data isolation, SPA deep-link fallback, and the live-recalculation UI. What has **never** run is a real deploy.

## Prerequisites

```bash
npm install
npx wrangler login
npx wrangler whoami        # confirms which account you're deploying into
```

If a browser login isn't possible, set `CLOUDFLARE_API_TOKEN` instead, with **Workers Scripts: Edit**, **D1: Edit** and **Account Settings: Read**.

## Step 1 — Apply the schema to the production database

`npm run deploy` (Step 3) now runs `npm run db:remote` itself before `wrangler deploy`, so this happens automatically on every deploy — including CI's automatic deploy on push to `main`. There's nothing to run by hand here anymore; this step is left in place only so a first-time deploy can verify the schema landed before moving on.

```bash
npm run db:remote
```

> **This used to be the step people skipped.** `npm run db:local` and `npm run db:remote` target two completely separate databases, and a deploy without the remote schema applied succeeds, the UI loads, and every API call returns `internal_error` — because the tables it expects don't exist. That failure mode is now closed off for the normal deploy path; it can still happen if someone runs `wrangler deploy` directly instead of `npm run deploy`.

Confirm the tables landed:

```bash
npx wrangler d1 execute timetracker --remote \
  --command "select name from sqlite_master where type='table'"
```

Expect `users`, `sessions`, `entries`, `settings` among the results.

## Step 2 — Register the first account

There's no seed user — register through the app itself once it's deployed
(Step 3), by opening `/register`. Whoever registers first automatically
inherits any pre-accounts data this deployment already had (see
"Two behaviours that will otherwise surprise you" below).

**If you're deploying this for the first time on top of an existing,
already-in-use instance**, set `LEGACY_CLAIM_EMAIL` *before* registering, so
only your real email can claim that existing data — otherwise the first
person to find the URL and register gets it instead:

```bash
npx wrangler secret put LEGACY_CLAIM_EMAIL
```

Skip this if there's no pre-existing data to protect (e.g. a brand new
deployment) — registration works the same either way, this only narrows who
*may* claim the legacy rows.

## Step 3 — Deploy

```bash
npm run deploy
```

A `predeploy` check refuses to build if `wrangler.jsonc` still holds a placeholder database id, so that particular mistake can't reach production. On a first deploy Cloudflare may ask you to register a `workers.dev` subdomain; accept it.

## Step 4 — Verify

Replace `<sub>` with your workers.dev subdomain.

```bash
# The SPA shell is public — only the API is gated
curl -s -o /dev/null -w '%{http_code}\n' https://timetracker.<sub>.workers.dev/
#   expect 200

curl -s -o /dev/null -w '%{http_code}\n' https://timetracker.<sub>.workers.dev/api/settings
#   expect 401 (no session yet)

# Register through the browser first (see below), then reuse its cookie here:
curl -s -c cookies.txt -X POST -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"<your password>"}' \
  https://timetracker.<sub>.workers.dev/api/auth/register
#   expect {"id":1,"email":"you@example.com"} — repeat with your real email/password

# Settings come from the real database — this is what proves step 1 worked
curl -s -b cookies.txt https://timetracker.<sub>.workers.dev/api/settings
#   expect a targetMinutesByWeekday array

# An unknown API path must be a JSON 404, not the SPA shell
curl -s -b cookies.txt https://timetracker.<sub>.workers.dev/api/nope
#   expect {"error":{"code":"not_found",...}}
```

Then in a browser:

1. Open the deployed URL — it should redirect to **/login**. Go to **/register** instead and create your account.
2. **Settings** → set your real workload (full-time week, percentage, tick the days you work — the weekday targets update immediately, no button) → **Save settings**. Reload; values persist.
3. **Week** → log a day. The figure updates as you type; a `✓` appears about 600 ms later.
4. **Reload.** The entry is still there.
5. Open `/months/2026-08` directly and hard-reload — it must render, not 404. That's the SPA fallback.
6. **Run `npm run deploy` again** and reload. Your entries must survive. This is the one check that actually proves the database is independent of the Worker.
7. **Abmelden** (logout), then reload — you should land back on `/login`.

## When something breaks

| Symptom | Cause | Fix |
|---|---|---|
| `internal_error` on `/api/settings` | Schema never applied to production (only possible if something ran `wrangler deploy` directly instead of `npm run deploy`) | `npm run db:remote` |
| Predeploy aborts with "placeholder `database_id`" | `wrangler.jsonc` not updated | `npx wrangler d1 create timetracker`, paste the id |
| `/api/*` 401s even when logged in | Cookie not reaching the Worker (e.g. testing cross-origin) | The app is same-origin by design — verify you're calling the same host the browser is on |
| Registration doesn't inherit the existing data | Someone else already claimed it, or `LEGACY_CLAIM_EMAIL` doesn't match | Check who's registered (`select id, email from users`); there's no way to un-claim short of editing the database directly |
| `/api/*` prompts but the UI loads freely | Your wrangler ignores `assets.run_worker_first` | Upgrade wrangler; failing that, serve assets via `c.env.ASSETS.fetch()` behind the middleware in `src/worker/index.ts` |
| `Unknown field "run_worker_first"` | wrangler too old | `npm i -D wrangler@latest` |
| Every deep link 404s | Assets misconfigured | Check `dist/client` exists after `npm run build` |
| Build fails on `worker-configuration.d.ts` | The `wrangler types` postinstall didn't run | `npx wrangler types` |

## Behaviours that will otherwise surprise you

**Targets are not versioned.** Changing a weekday target in Settings recalculates *every past balance*, not just future ones. There is no per-period history.

**Overnight shifts are rejected.** A leaving time at or before the arrival time fails validation, which also rules out `00:00` as a leaving time. This is enforced by a SQL `CHECK` as well as in the UI and API, so supporting night shifts later means a migration, not just relaxing a check.

**The legacy-data claim only ever fires once.** The first successful registration (optionally restricted to one email via `LEGACY_CLAIM_EMAIL`) inherits any data that existed before accounts did; every registration after that gets a clean, empty account. There's no UI for re-assigning data between accounts later.

## Backups

```bash
npx wrangler d1 export timetracker --remote --output backup.sql
```
