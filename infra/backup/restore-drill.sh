#!/bin/bash
# Weekly restore drill: restore the newest backup into a throwaway postgres
# container and compare row counts with prod. Always tears itself down.
#
#   DRILL_CONTAINER  throwaway name       default: vichar-stg-drill
#   PG_CONTAINER     postgres container   default: vichar-postgres
#   LEGACY_CONTAINER all-in-one fallback  default: vichar
#   DRILL_VOLUME     scratch volume name  default: vichar-stg-drill-pgdata
#   PG_IMAGE         postgres image       default: vichar-postgres:local
#   ENV_FILE         env file for WAL-G   default: .env.vichar
#   MINIO_ENDPOINT   staging S3 endpoint override for WALG_S3_ENDPOINT
set -euo pipefail

DRILL_CONTAINER="${DRILL_CONTAINER:-vichar-stg-drill}"
DRILL_VOLUME="${DRILL_VOLUME:-vichar-stg-drill-pgdata}"
PG_CONTAINER="${PG_CONTAINER:-vichar-postgres}"
LEGACY_CONTAINER="${LEGACY_CONTAINER:-vichar}"
PG_IMAGE="${PG_IMAGE:-vichar-postgres:local}"
ENV_FILE="${ENV_FILE:-.env.vichar}"
DB_NAME="${DB_NAME:-vichar}"
DB_USER="${DB_USER:-postgres}"
NETWORK="${DRILL_NETWORK:-vichar}"

envfile_get() { # print value of $1 from env file, or empty
	awk -F= -v k="$1" 'index($0,k "=")==1{sub("^[^=]*=",""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$ENV_FILE" 2>/dev/null
}

counts() {
	docker exec "$1" psql -U "$DB_USER" -d "$DB_NAME" -tA -F'|' -c \
		"select 'user',count(*) from \"user\" union all
		 select 'organization',count(*) from organization union all
		 select 'api_key',count(*) from api_key union all
		 select 'transaction',count(*) from \"transaction\" order by 1"
}

cleanup() {
	docker rm -f "$DRILL_CONTAINER" "${DRILL_CONTAINER}-fetch" >/dev/null 2>&1 || true
	docker volume rm "$DRILL_VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
	PROD_CONTAINER="$PG_CONTAINER"
else
	PROD_CONTAINER="$LEGACY_CONTAINER"
fi
echo "restore-drill: counting prod rows in $PROD_CONTAINER"
PROD_COUNTS="$(counts "$PROD_CONTAINER")"

R2_ACCOUNT_ID="${R2_ACCOUNT_ID:-$(envfile_get R2_ACCOUNT_ID)}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:-$(envfile_get R2_ACCESS_KEY_ID)}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:-$(envfile_get R2_SECRET_ACCESS_KEY)}"
R2_BUCKET="${R2_BUCKET:-$(envfile_get R2_BUCKET)}"
VICHAR_BACKUP_KEY="${VICHAR_BACKUP_KEY:-$(envfile_get VICHAR_BACKUP_KEY)}"

WALG_OK=no
if [ -n "$R2_ACCOUNT_ID" ] && [ -n "$R2_ACCESS_KEY_ID" ] \
	&& [ -n "$R2_SECRET_ACCESS_KEY" ] && [ -n "$R2_BUCKET" ] \
	&& [ -n "$VICHAR_BACKUP_KEY" ]; then
	WALG_OK=yes
fi

cleanup # ensure clean slate
docker volume create "$DRILL_VOLUME" >/dev/null

walg_env=()
if [ "$WALG_OK" = "yes" ]; then
	walg_env=(-e "R2_ACCOUNT_ID=$R2_ACCOUNT_ID" -e "R2_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID"
		-e "R2_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY" -e "R2_BUCKET=$R2_BUCKET"
		-e "VICHAR_BACKUP_KEY=$VICHAR_BACKUP_KEY")
	[ -n "${MINIO_ENDPOINT:-}" ] && walg_env+=(-e "WALG_S3_ENDPOINT=$MINIO_ENDPOINT")

	# Fetch the base backup with a one-shot container before postgres starts:
	# never delete PGDATA under a running server.
	echo "restore-drill: wal-g backup-fetch LATEST into $DRILL_VOLUME"
	docker run --rm --name "${DRILL_CONTAINER}-fetch" --network "$NETWORK" \
		-v "$DRILL_VOLUME:/var/lib/postgresql/data" \
		"${walg_env[@]}" "$PG_IMAGE" \
		sh -c 'wal-g backup-fetch /var/lib/postgresql/data LATEST &&
			chown -R 999:999 /var/lib/postgresql/data' >/dev/null
fi

echo "restore-drill: starting $DRILL_CONTAINER"
docker run -d --name "$DRILL_CONTAINER" --network "$NETWORK" \
	-v "$DRILL_VOLUME:/var/lib/postgresql/data" \
	-e "POSTGRES_DB=$DB_NAME" -e POSTGRES_PASSWORD=drill \
	-e VICHAR_PITR=1 \
	"${walg_env[@]}" "$PG_IMAGE" postgres -c archive_mode=off >/dev/null

t=180
until docker exec "$DRILL_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do
	sleep 2; t=$((t - 2))
	[ "$t" -le 0 ] && {
		echo "restore-drill: drill pg never came up" >&2
		docker logs "$DRILL_CONTAINER" 2>&1 | tail -12 >&2
		exit 1
	}
done

if [ "$WALG_OK" != "yes" ]; then
	DUMP="$(ls -1t /var/backups/vichar/vichar-*.sql.gz 2>/dev/null | head -1 || true)"
	[ -n "$DUMP" ] || {
		echo "restore-drill: no local dump found" >&2
		exit 1
	}
	echo "restore-drill: loading $DUMP"
	docker exec "$DRILL_CONTAINER" createdb -U postgres "$DB_NAME" 2>/dev/null || true
	gunzip -c "$DUMP" | docker exec -i "$DRILL_CONTAINER" psql -U postgres -d "$DB_NAME" -q >/dev/null
fi

DRILL_COUNTS="$(counts "$DRILL_CONTAINER")"
echo "restore-drill: prod  ${PROD_COUNTS//$'\n'/ }"
echo "restore-drill: drill ${DRILL_COUNTS//$'\n'/ }"

ok=yes
while IFS='|' read -r tbl pc; do
	dc="$(echo "$DRILL_COUNTS" | awk -F'|' -v t="$tbl" '$1==t{print $2}')"
	dc="${dc:-0}"
	if [ "$dc" -gt "$pc" ]; then
		echo "restore-drill: FAIL $tbl drill=$dc > prod=$pc"
		ok=no
	fi
	if { [ "$tbl" = "user" ] || [ "$tbl" = "transaction" ]; } \
		&& [ "$pc" -gt 0 ] && [ "$dc" -lt $((pc * 99 / 100)) ]; then
		echo "restore-drill: FAIL $tbl drill=$dc < 99% of prod=$pc"
		ok=no
	fi
done <<EOF2
$PROD_COUNTS
EOF2

if [ "$ok" = yes ]; then
	echo "restore-drill: PASS"
else
	echo "restore-drill: FAIL" >&2
	exit 1
fi
