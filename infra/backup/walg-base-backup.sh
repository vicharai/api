#!/bin/bash
# Nightly WAL-G base backup inside the postgres container, then prune to the
# newest 7 FULL backups. No-ops cleanly when R2 creds are not configured.
set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-vichar-postgres}"
DB_USER="${DB_USER:-postgres}"

# WAL-G env is written to /etc/walg-env by the entrypoint (docker exec sees
# only docker-provided env, not entrypoint exports).
configured() {
	docker exec "$PG_CONTAINER" sh -c \
		'[ -f /etc/walg-env ] && . /etc/walg-env && [ -n "$WALG_S3_PREFIX" ]' \
		2>/dev/null
}

if ! configured; then
	echo "walg-base-backup: skipped: R2 not configured"
	exit 0
fi

echo "walg-base-backup: backup-push"
docker exec -u postgres "$PG_CONTAINER" sh -c 'set -a; . /etc/walg-env; set +a; wal-g backup-push /var/lib/postgresql/data'
echo "walg-base-backup: retain newest 7 FULL"
docker exec -u postgres "$PG_CONTAINER" sh -c 'set -a; . /etc/walg-env; set +a; wal-g delete retain FULL 7 --confirm'
echo "walg-base-backup: done"
