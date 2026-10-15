#!/bin/bash
# Every-5-min backup health monitor. Alerts to Discord; logs only when no
# webhook is configured. Same alert is suppressed for 6 h via a state file.
#
#   PG_CONTAINER default vichar-postgres   STATE_FILE default /var/lib/vichar-monitor.state
#   ENV_FILE default .env.vichar           BACKUP_DIR default /var/backups/vichar
set -uo pipefail

PG_CONTAINER="${PG_CONTAINER:-vichar-postgres}"
LEGACY_CONTAINER="${LEGACY_CONTAINER:-vichar}"
ENV_FILE="${ENV_FILE:-.env.vichar}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vichar}"
STATE_FILE="${STATE_FILE:-/var/lib/vichar-monitor.state}"
DB_NAME="${DB_NAME:-vichar}"
DB_USER="${DB_USER:-postgres}"

envfile_get() { # print value of $1 from env file, or empty
	awk -F= -v k="$1" 'index($0,k "=")==1{sub("^[^=]*=",""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$ENV_FILE" 2>/dev/null
}
WEBHOOK="${VICHAR_OPS_DISCORD_WEBHOOK:-}"
[ -z "$WEBHOOK" ] && WEBHOOK="$(envfile_get VICHAR_OPS_DISCORD_WEBHOOK)"

touch "$STATE_FILE" 2>/dev/null || STATE_FILE="/tmp/vichar-monitor.state"

alert() { # name message
	local name="$1" msg="$2" now last
	now="$(date +%s)"
	last="$(grep "^${name} " "$STATE_FILE" 2>/dev/null | awk '{print $2}' || true)"
	if [ -n "$last" ] && [ $((now - last)) -lt 21600 ]; then
		echo "monitor: $name suppressed (${msg})"
		return
	fi
	sed -i "/^${name} /d" "$STATE_FILE" 2>/dev/null || true
	echo "$name $now" >>"$STATE_FILE"
	echo "monitor: ALERT $name: $msg"
	if [ -n "$WEBHOOK" ]; then
		curl -sfS -X POST -H "Content-Type: application/json" \
			-d "{\"content\": \"[vichar-backup] ${name}: ${msg}\"}" "$WEBHOOK" \
			|| echo "monitor: webhook post failed"
	fi
}

pg_running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

PG="$PG_CONTAINER"; pg_running "$PG" || PG="$LEGACY_CONTAINER"
pg_running "$PG" || { alert "postgres-down" "no postgres container running"; exit 0; }

# WAL archiving (only when WAL-G configured)
walg_on="$(docker exec "$PG" sh -c '[ -f /etc/walg-env ] && . /etc/walg-env && [ -n "$WALG_S3_PREFIX" ] && echo yes' 2>/dev/null || true)"
if [ "$walg_on" = "yes" ]; then
	# Stale = WAL exists newer than the last archived segment but has not
	# been pushed for >10min. Idle clusters simply have nothing pending.
	stats="$(docker exec "$PG" psql -U "$DB_USER" -d "$DB_NAME" -tA -F'|' -c \
		"select extract(epoch from now()-last_archived_time)::bigint, failed_count,
		 pg_current_wal_lsn() > last_archived_lsn from pg_stat_archiver" \
		2>/dev/null || true)"
	IFS='|' read -r arch_age fails pending <<EOF2
$stats
EOF2
	[ "${pending:-f}" = "t" ] && [ "${arch_age:-0}" -gt 600 ] \
		&& alert "wal-stale" "unarchived WAL pending; last archived ${arch_age}s ago"
	last_fail_seen="$(grep '^failcount ' "$STATE_FILE" | awk '{print $2}' || echo 0)"
	if [ -n "${fails:-}" ] && [ "$fails" -gt "${last_fail_seen:-0}" ]; then
		alert "wal-fail" "pg_stat_archiver failed_count=$fails"
	fi
	sed -i '/^failcount /d' "$STATE_FILE" 2>/dev/null || true
	echo "failcount ${fails:-0}" >>"$STATE_FILE"

	# last successful base backup: sentinel line in its own log
	last_base="$(stat -c %Y /var/log/vichar-walg-backup.ok 2>/dev/null || echo 0)"
	now="$(date +%s)"
	[ $((now - last_base)) -gt 93600 ] && alert "base-stale" "no successful WAL-G base backup in >26h"
fi

# pg_wal size
wal_kb="$(docker exec "$PG" sh -c 'du -sk "$PGDATA/pg_wal" 2>/dev/null | cut -f1' || echo 0)"
[ "${wal_kb:-0}" -gt 2097152 ] && alert "wal-size" "pg_wal is ${wal_kb}KB (>2GB)"

# newest local dump
newest="$(ls -1t "$BACKUP_DIR"/vichar-*.sql.gz 2>/dev/null | head -1 || true)"
if [ -z "$newest" ]; then
	alert "dump-missing" "no local pg_dump in $BACKUP_DIR"
else
	age=$(( $(date +%s) - $(stat -c %Y "$newest") ))
	[ "$age" -gt 93600 ] && alert "dump-stale" "newest dump $(basename "$newest") is ${age}s old"
fi

# disk
use_pct="$(df -P / | awk 'NR==2{gsub(/%/,"",$5);print $5}')"
[ "${use_pct:-0}" -gt 85 ] && alert "disk" "root filesystem at ${use_pct}%"
