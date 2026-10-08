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

# Runs a wrangler command without echoing its output. `d1 export` prints a
# presigned download URL for the full dump, and error output includes the
# account name (an email address) — both readable by anyone in a public
# repo's Actions log. On failure, show the output with those redacted.
quiet() {
  if ! "$@" > "$workdir/out.log" 2>&1; then
    sed -E -e 's#https://[^[:space:]]*X-Amz-[^[:space:]]*#<presigned URL redacted>#g' \
      -e 's#[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]+#<email redacted>#g' \
      "$workdir/out.log" >&2
    return 1
  fi
}

# The exact Time Travel restore point, for `wrangler d1 time-travel restore
# --bookmark=...`. Not sensitive, so it's fine in the log.
quiet npx wrangler d1 time-travel info timetracker --json
cat "$workdir/out.log"

file="timetracker-$(date -u +%Y%m%dT%H%M%SZ)-${label}.sql"
quiet npx wrangler d1 export timetracker --remote --output "$workdir/$file"
gzip "$workdir/$file"

quiet npx wrangler r2 object put "timetracker-backups/$file.gz" \
  --file "$workdir/$file.gz" --content-type application/gzip --remote

echo "Uploaded $file.gz"
