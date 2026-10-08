#!/usr/bin/env bash
# Dumps the production D1 database and uploads it to the private R2 bucket
# `timetracker-backups`, which the Synology NAS mirrors via Cloud Sync. Used
# by the nightly backup workflow and before every deploy's migrations (see
# .github/workflows/). Usage: backup-to-r2.sh <label>
#
# The repo is public, so dumps (password hashes, personal time data) must
# never become Actions artifacts or be printed to the log.
#
# Env: CLOUDFLARE_API_TOKEN (needs D1 + R2 edit), CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail

label="${1:?usage: backup-to-r2.sh <label>}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# The exact Time Travel restore point, for `wrangler d1 time-travel restore
# --bookmark=...`. Not sensitive, so it's fine in the log.
npx wrangler d1 time-travel info timetracker --json

file="timetracker-$(date -u +%Y%m%dT%H%M%SZ)-${label}.sql"
npx wrangler d1 export timetracker --remote --output "$workdir/$file"
gzip "$workdir/$file"

npx wrangler r2 object put "timetracker-backups/$file.gz" \
  --file "$workdir/$file.gz" --content-type application/gzip --remote

echo "Uploaded $file.gz"
