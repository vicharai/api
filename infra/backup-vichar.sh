#!/bin/sh
# Daily logical backup of the Vichar Postgres database inside the `vichar`
# container. Keeps the newest 3 dumps in /var/backups/vichar.
set -eu

CONTAINER="${BACKUP_CONTAINER:-vichar}"
DB_NAME="${BACKUP_DB:-vichar}"
DB_USER="${BACKUP_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vichar}"
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

out="${BACKUP_DIR}/vichar-$(date -u +%Y%m%d-%H%M).sql.gz"
tmp="${out}.incomplete"

# pg_dump inside the container; gzip on the host so we can test the size of the
# plaintext and never gzip a truncated/failed dump.
if docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" >"$tmp"; then
	if [ "$(wc -c <"$tmp")" -lt "$MIN_DUMP_BYTES" ]; then
		echo "backup: dump too small, refusing to keep $tmp" >&2
		rm -f "$tmp"
		exit 1
	fi
else
	echo "backup: pg_dump failed" >&2
	rm -f "$tmp"
	exit 1
fi

gzip -f "$tmp" && mv "${tmp}.gz" "$out"
echo "backup: wrote $out ($(du -h "$out" | cut -f1))"

# keep the newest KEEP dumps
ls -1t "${BACKUP_DIR}"/vichar-*.sql.gz | tail -n "+$((KEEP + 1))" | while read -r old; do
	rm -f "$old"
done
