#!/bin/sh
# archive_command wrapper: archives WAL via WAL-G when configured, no-ops
# otherwise. Exit 0 without creds keeps Postgres happy; a real failure returns
# non-zero so Postgres retains the segment and retries.
set -eu

if [ -z "${WALG_S3_PREFIX:-}" ] \
	|| [ -z "${AWS_ACCESS_KEY_ID:-}" ] \
	|| [ -z "${AWS_SECRET_ACCESS_KEY:-}" ] \
	|| [ -z "${AWS_ENDPOINT:-}" ] \
	|| [ -z "${WALG_LIBSODIUM_KEY:-}" ]; then
	exit 0
fi

exec wal-g wal-push "$1"
