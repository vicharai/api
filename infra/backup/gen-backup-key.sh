#!/bin/sh
# Generates VICHAR_BACKUP_KEY (32 random bytes, hex) and appends it to an env
# file WITHOUT printing it. Refuses to overwrite an existing key.
# Usage: gen-backup-key.sh <env-file>   (do NOT run against .env.vichar)
set -eu

env_file="${1:?usage: gen-backup-key.sh <env-file>}"

if grep -q "^VICHAR_BACKUP_KEY=" "$env_file" 2>/dev/null; then
	echo "gen-backup-key: VICHAR_BACKUP_KEY already set in $env_file" >&2
	exit 1
fi

key="$(openssl rand -hex 32)"
printf 'VICHAR_BACKUP_KEY=%s\n' "$key" >>"$env_file"
chmod 600 "$env_file"
echo "gen-backup-key: wrote VICHAR_BACKUP_KEY to $env_file (value not shown)"
