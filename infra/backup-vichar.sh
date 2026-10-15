#!/bin/bash
# Daily logical backup of the Vichar database. Dumps from the separated
# postgres container (falls back to the legacy all-in-one), keeps the newest
# 3 gzipped dumps in /var/backups/vichar, and — when R2 + VICHAR_BACKUP_KEY
# are configured — uploads an openssl-encrypted copy:
#   dumps/daily/    every day
#   dumps/weekly/   Sundays
#   dumps/monthly/  1st of month
# R2 lifecycle rules (retention 7/35/370 days) are set by the owner; see the
# runbook in README-vichar.md.
set -eu

CONTAINER="${BACKUP_CONTAINER:-vichar-postgres}"
LEGACY_CONTAINER="${LEGACY_CONTAINER:-vichar}"
DB_NAME="${BACKUP_DB:-vichar}"
DB_USER="${BACKUP_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vichar}"
ENV_FILE="${ENV_FILE:-.env.vichar}"
KEEP=3
MIN_DUMP_BYTES=$((1 * 1024 * 1024)) # abort if the dump is suspiciously small
MIN_FREE_KB=$((5 * 1024 * 1024))    # 5G free disk required

umask 077

mkdir -p "$BACKUP_DIR"

free_kb=$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {print $4}')
if [ "$free_kb" -lt "$MIN_FREE_KB" ]; then
	echo "backup: aborting, only ${free_kb}KB free in ${BACKUP_DIR}" >&2
	exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
	echo "backup: $CONTAINER not running, falling back to $LEGACY_CONTAINER"
	CONTAINER="$LEGACY_CONTAINER"
fi

out="${BACKUP_DIR}/vichar-$(date -u +%Y%m%d-%H%M).sql.gz"
tmp="${out}.incomplete"

status_file="${tmp}.status"
{
	docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME"
	echo $? >"$status_file"
} | gzip >"$tmp"

if [ "$(cat "$status_file" 2>/dev/null)" != "0" ]; then
	echo "backup: pg_dump failed" >&2
	rm -f "$tmp" "$status_file"
	exit 1
fi
rm -f "$status_file"
if [ "$(wc -c <"$tmp")" -lt "$MIN_DUMP_BYTES" ]; then
	echo "backup: dump too small, refusing to keep $tmp" >&2
	rm -f "$tmp"
	exit 1
fi

mv "$tmp" "$out"
echo "backup: wrote $out ($(du -h "$out" | cut -f1))"

ls -1t "${BACKUP_DIR}"/vichar-*.sql.gz | tail -n "+$((KEEP + 1))" | while read -r old; do
	rm -f "$old"
done

# --- optional encrypted upload to R2 --------------------------------------
envfile_get() { # print value of $1 from env file, or empty
	awk -F= -v k="$1" 'index($0,k "=")==1{sub("^[^=]*=",""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$ENV_FILE" 2>/dev/null
}

R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-$(envfile_get R2_ACCOUNT_ID)}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-$(envfile_get R2_ACCESS_KEY_ID)}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$(envfile_get R2_SECRET_ACCESS_KEY)}"
R2_BUCKET="${R2_BUCKET:-$(envfile_get R2_BUCKET)}"
R2_ENDPOINT="${R2_ENDPOINT:-$(envfile_get R2_ENDPOINT)}"
VICHAR_BACKUP_KEY="${VICHAR_BACKUP_KEY:-$(envfile_get VICHAR_BACKUP_KEY)}"
if [ -z "$R2_ACCOUNT_ID" ] || [ -z "$R2_ACCESS_KEY_ID" ] \
	|| [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_BUCKET" ] \
	|| [ -z "$VICHAR_BACKUP_KEY" ]; then
	echo "backup: R2 upload skipped: R2 not configured"
	exit 0
fi

endpoint="${R2_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
export VICHAR_BACKUP_KEY
enc="${out}.enc"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass env:VICHAR_BACKUP_KEY \
	-in "$out" -out "$enc"
echo "backup: encrypted to $enc"

upload() { # key-prefix
	local prefix="$1"
	local key="${prefix}/$(basename "$enc")"
	code="$(curl -sS -o /dev/null -w '%{http_code}' --aws-sigv4 "aws:amz:auto:s3" \
		--user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
		-X PUT --data-binary "@${enc}" "${endpoint}/${R2_BUCKET}/${key}")"
	if [ "${code#2}" = "$code" ]; then
		echo "backup: R2 upload to ${key} returned HTTP ${code}" >&2
		rm -f "$enc"
		exit 1
	fi
	echo "backup: uploaded ${endpoint}/${R2_BUCKET}/${key} (HTTP ${code})"
}

dow="$(date -u +%u)"; dom="$(date -u +%d)"
upload "dumps/daily"
[ "$dow" = "7" ] && upload "dumps/weekly"
[ "$dom" = "01" ] && upload "dumps/monthly"
rm -f "$enc"
