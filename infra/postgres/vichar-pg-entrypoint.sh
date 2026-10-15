#!/bin/bash
# Wraps docker-entrypoint.sh: maps the R2/Vichar env onto WAL-G's S3 env,
# guarantees our conf drop-in is included, and fixes PGDATA ownership for the
# uid-999 postgres user of this image (the legacy image used uid 100).
set -euo pipefail

PGDATA_DIR="${PGDATA:-/var/lib/postgresql/data}"

# --- WAL-G env mapping (only armed when every input is non-empty) -----------
if [ -n "${R2_ACCOUNT_ID:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] \
	&& [ -n "${R2_SECRET_ACCESS_KEY:-}" ] && [ -n "${R2_BUCKET:-}" ] \
	&& [ -n "${VICHAR_BACKUP_KEY:-}" ]; then
	export AWS_ENDPOINT="${WALG_S3_ENDPOINT:-https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
	export AWS_REGION=auto
	export AWS_S3_FORCE_PATH_STYLE=true
	export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
	export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
	export WALG_S3_PREFIX="s3://${R2_BUCKET}/walg"
	export WALG_LIBSODIUM_KEY="$VICHAR_BACKUP_KEY"
	export WALG_LIBSODIUM_KEY_TRANSFORM=hex
	export WALG_COMPRESSION_METHOD="${WALG_COMPRESSION_METHOD:-brotli}"
	# docker exec sessions do not see entrypoint exports; persist for the
	# backup scripts and wal-g invocations run via exec (root-only file).
	# One-shot containers started with -u postgres cannot write /etc — fine,
	# their wal-g calls inherit the exports directly.
	if [ -w /etc ]; then
		{
			echo "AWS_ENDPOINT=$AWS_ENDPOINT"
			echo "AWS_REGION=$AWS_REGION"
			echo "AWS_S3_FORCE_PATH_STYLE=$AWS_S3_FORCE_PATH_STYLE"
			echo "AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID"
			echo "AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY"
			echo "WALG_S3_PREFIX=$WALG_S3_PREFIX"
			echo "WALG_LIBSODIUM_KEY=$WALG_LIBSODIUM_KEY"
			echo "WALG_LIBSODIUM_KEY_TRANSFORM=$WALG_LIBSODIUM_KEY_TRANSFORM"
			echo "WALG_COMPRESSION_METHOD=$WALG_COMPRESSION_METHOD"
		} >/etc/walg-env
		chmod 640 /etc/walg-env
		chown postgres:postgres /etc/walg-env
	fi
	echo "vichar-pg: WAL-G configured (prefix ${WALG_S3_PREFIX})"
else
	echo "vichar-pg: WAL-G not configured, archive_command no-ops"
fi

# PITR restore mode: arm recovery.signal + restore_command once.
if [ "${VICHAR_PITR:-}" = "1" ] && [ -f "$PGDATA_DIR/postgresql.auto.conf" ]; then
	if ! grep -q "restore_command" "$PGDATA_DIR/postgresql.auto.conf"; then
		echo "vichar-pg: arming PITR restore"
		printf 'restore_command = %s
' 			"'/usr/local/bin/wal-g wal-fetch %f %p'" >>"$PGDATA_DIR/postgresql.auto.conf"
		touch "$PGDATA_DIR/recovery.signal"
	fi
fi

if [ -d "$PGDATA_DIR" ]; then
	# Re-own the data dir for this image's postgres uid (legacy image: uid 100).
	owner="$(stat -c %u "$PGDATA_DIR")"
	if [ "$owner" != "999" ]; then
		echo "vichar-pg: chown PGDATA uid $owner -> 999"
		chown -R 999:999 "$PGDATA_DIR"
	fi

	# Include our drop-in once PGDATA holds a real postgresql.conf.
	if [ -f "$PGDATA_DIR/postgresql.conf" ] \
		&& ! grep -q "vichar.conf" "$PGDATA_DIR/postgresql.conf"; then
		echo "vichar-pg: appending include for vichar.conf"
		printf "\ninclude '/etc/postgresql/vichar.conf'\n" >>"$PGDATA_DIR/postgresql.conf"
	fi

	# hba: the legacy cluster trusted every host connection. Keep local
	# trust/peer; require scram-sha-256 for anything off-host (the compose
	# network only — the port is loopback-bound on the host anyway).
	if [ -f "$PGDATA_DIR/pg_hba.conf" ] \
		&& ! grep -q "vichar-pg managed" "$PGDATA_DIR/pg_hba.conf"; then
		echo "vichar-pg: appending scram-sha-256 rule for off-host connections"
		cat >>"$PGDATA_DIR/pg_hba.conf" <<'HBA'
# vichar-pg managed: connections not via local socket need a password.
host all all samenet scram-sha-256
HBA
	fi
fi

exec docker-entrypoint.sh "$@"
