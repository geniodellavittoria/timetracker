#!/usr/bin/env bash
# Dumps the production D1 database and uploads it to the backup file server
# over SFTP. Used by the nightly backup workflow and before every deploy's
# migrations (see .github/workflows/). Usage: backup-to-sftp.sh <label>
#
# The repo is public, so dumps (password hashes, personal time data) must
# never become Actions artifacts or be printed to the log — they only ever
# go to the file server.
#
# Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, BACKUP_SSH_KEY,
#      BACKUP_SSH_KNOWN_HOSTS, BACKUP_SFTP_HOST, BACKUP_SFTP_USER,
#      BACKUP_SFTP_PATH, optional BACKUP_SFTP_PORT (default 22).
set -euo pipefail

label="${1:?usage: backup-to-sftp.sh <label>}"
: "${BACKUP_SSH_KEY:?}" "${BACKUP_SSH_KNOWN_HOSTS:?}" "${BACKUP_SFTP_HOST:?}" "${BACKUP_SFTP_USER:?}" "${BACKUP_SFTP_PATH:?}"

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# The exact Time Travel restore point, for `wrangler d1 time-travel restore
# --bookmark=...`. Not sensitive, so it's fine in the log.
npx wrangler d1 time-travel info timetracker --json

file="timetracker-$(date -u +%Y%m%dT%H%M%SZ)-${label}.sql"
npx wrangler d1 export timetracker --remote --output "$workdir/$file"
gzip "$workdir/$file"

install -m 600 /dev/null "$workdir/key"
printf '%s\n' "$BACKUP_SSH_KEY" > "$workdir/key"
printf '%s\n' "$BACKUP_SSH_KNOWN_HOSTS" > "$workdir/known_hosts"

# Upload under a temporary name and rename, so a half-written file never
# looks like a valid backup on the server.
sftp -b - \
  -i "$workdir/key" \
  -P "${BACKUP_SFTP_PORT:-22}" \
  -o UserKnownHostsFile="$workdir/known_hosts" \
  -o StrictHostKeyChecking=yes \
  -o IdentitiesOnly=yes \
  "$BACKUP_SFTP_USER@$BACKUP_SFTP_HOST" <<EOF
put $workdir/$file.gz $BACKUP_SFTP_PATH/$file.gz.part
rename $BACKUP_SFTP_PATH/$file.gz.part $BACKUP_SFTP_PATH/$file.gz
EOF

echo "Uploaded $file.gz"
