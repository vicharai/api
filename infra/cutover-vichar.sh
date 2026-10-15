#!/bin/bash
# Vichar cutover: all-in-one container -> separate postgres + redis + app.
# Parameterized by env so the same script serves prod and the staging test.
#
#   LEGACY_CONTAINER   container to stop          (default: vichar; "" skips)
#   COMPOSE_PROJECT_NAME  compose -p override    (default: none -> file's name:)
#   COMPOSE_FILE       split compose file         (default: infra/docker-compose.vichar.yml)
#   ENV_FILE           project env file           (default: .env.vichar)
#   PG_CONTAINER       postgres container name    (default: vichar-postgres)
#   REDIS_CONTAINER    redis container name       (default: vichar-redis)
#   APP_CONTAINER      app container name         (default: vichar-app)
#   APP_IMAGE          app image to run           (default: vichar-app:local)
#   APP_NETWORK        docker network             (default: vichar)
#   DB_NAME/DB_USER    dump+count target          (default: vichar/postgres)
#   HOST_UI_PORT etc   host loopback ports        (default: 3302/3305/4301/4302)
#   WORKER_AUTOSTART   VICHAR_WORKER_AUTOSTART    (default: true)
#
# Idempotent: every step checks and logs. On failure it prints the rollback
# command and exits non-zero.
set -euo pipefail

# NOTE: '-' not ':-' — an explicit LEGACY_CONTAINER="" must stay empty so the
# documented "skip legacy" path (staging) actually skips stop+dump.
LEGACY_CONTAINER="${LEGACY_CONTAINER-vichar}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker-compose.vichar.yml}"
ENV_FILE="${ENV_FILE:-.env.vichar}"
PG_CONTAINER="${PG_CONTAINER:-vichar-postgres}"
REDIS_CONTAINER="${REDIS_CONTAINER:-vichar-redis}"
APP_CONTAINER="${APP_CONTAINER:-vichar-app}"
APP_IMAGE="${APP_IMAGE:-vichar-app:local}"
APP_NETWORK="${APP_NETWORK:-vichar}"
DB_NAME="${DB_NAME:-vichar}"
DB_USER="${DB_USER:-postgres}"
HOST_UI_PORT="${HOST_UI_PORT:-3302}"
HOST_DOCS_PORT="${HOST_DOCS_PORT:-3305}"
HOST_GW_PORT="${HOST_GW_PORT:-4301}"
HOST_API_PORT="${HOST_API_PORT:-4302}"
WORKER_AUTOSTART="${WORKER_AUTOSTART:-true}"
SAFETY_DIR="${SAFETY_DIR:-/var/backups/vichar-cutover}"

log() { echo "[cutover $(date -u +%H:%M:%S)] $*"; }
fail() {
	echo "" >&2
	echo "[cutover] FAILED: $*" >&2
	echo "[cutover] rollback: docker compose --env-file ${ENV_FILE} -f infra/docker-compose.vichar-legacy.yml up -d" >&2
	exit 1
}

compose() {
	local args=()
	# -p beats the file's top-level name: — required for staging, where the
	# same compose file must run under a second project so its volumes
	# (vichar-stg_vichar_*) don't collide with prod's (vichar_vichar_*).
	[ -n "$COMPOSE_PROJECT_NAME" ] && args=(-p "$COMPOSE_PROJECT_NAME")
	docker compose "${args[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

counts() { # table counts, args: container
	docker exec "$1" psql -U "$DB_USER" -d "$DB_NAME" -tAc \
		"select 'user='||count(*) from \"user\" union all
		 select 'org='||count(*) from organization union all
		 select 'key='||count(*) from api_key union all
		 select 'txn='||count(*) from \"transaction\""
}

wait_http() { # url expected-status timeout
	local url="$1" want="$2" t="${3:-60}"
	while [ "$t" -gt 0 ]; do
		code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
		[ "$code" = "$want" ] && return 0
		sleep 2; t=$((t - 2))
	done
	return 1
}

mkdir -p "$SAFETY_DIR"

# --- 1. safety dump + counts -------------------------------------------------
if [ -n "$LEGACY_CONTAINER" ]; then
	log "step 1: safety pg_dump from $LEGACY_CONTAINER -> $SAFETY_DIR"
	dump="$SAFETY_DIR/pre-cutover-$(date -u +%Y%m%d-%H%M).sql.gz"
	docker exec "$LEGACY_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
		| gzip >"$dump" || fail "pg_dump"
	log "  wrote $dump"
	PRE_COUNTS="$(counts "$LEGACY_CONTAINER")" || fail "row counts"
else
	log "step 1: no legacy container (staging); skip safety dump"
	PRE_COUNTS="${PRE_COUNTS:-unknown}"
fi
log "  pre-cutover counts: ${PRE_COUNTS//$'\n'/ }"

# --- 2. stop legacy ----------------------------------------------------------
if [ -n "$LEGACY_CONTAINER" ]; then
	log "step 2: stopping $LEGACY_CONTAINER"
	docker stop "$LEGACY_CONTAINER" >/dev/null || fail "docker stop $LEGACY_CONTAINER"
else
	log "step 2: skip (no legacy container)"
fi

# --- 3. postgres + redis up (entrypoint fixes uid + conf include) ------------
log "step 3: starting postgres and redis via compose"
compose up -d postgres redis || fail "compose up postgres redis"
log "  waiting for postgres to accept connections"
t=90
until docker exec "$PG_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
	sleep 2; t=$((t - 2)); [ "$t" -le 0 ] && fail "postgres not ready"
done

# --- 4. app ------------------------------------------------------------------
log "step 4: starting app container $APP_CONTAINER"
docker rm -f "$APP_CONTAINER" >/dev/null 2>&1 || true
envfile_get() {
	awk -F= -v k="$1" 'index($0,k "=")==1{sub("^[^=]*=",""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$ENV_FILE" 2>/dev/null
}
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(envfile_get POSTGRES_PASSWORD)}"
POSTGRES_DB="${POSTGRES_DB:-$(envfile_get POSTGRES_DB)}"
docker run -d --name "$APP_CONTAINER" \
	--network "$APP_NETWORK" \
	--env-file "$ENV_FILE" \
	-e NODE_OPTIONS=--dns-result-order=ipv4first \
	-e "DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-vichar}" \
	-e REDIS_HOST=redis -e REDIS_PORT=6379 \
	-e "VICHAR_WORKER_AUTOSTART=${WORKER_AUTOSTART}" \
	-e RUN_MIGRATIONS=true \
	-p "127.0.0.1:${HOST_UI_PORT}:3002" \
	-p "127.0.0.1:${HOST_DOCS_PORT}:3005" \
	-p "127.0.0.1:${HOST_GW_PORT}:4001" \
	-p "127.0.0.1:${HOST_API_PORT}:4002" \
	--restart unless-stopped \
	"$APP_IMAGE" || fail "docker run app"

# --- 5. health ---------------------------------------------------------------
log "step 5: health checks"
wait_http "http://127.0.0.1:${HOST_UI_PORT}/login" 200 || fail "ui /login"
log "  ui /login ok"
wait_http "http://127.0.0.1:${HOST_DOCS_PORT}/" 200 || fail "docs /"
log "  docs / ok"
wait_http "http://127.0.0.1:${HOST_GW_PORT}/v1/models" 200 || fail "gateway /v1/models"
log "  gateway /v1/models ok"
wait_http "http://127.0.0.1:${HOST_API_PORT}/" 200 90 || fail "api health /"
log "  api / (health) ok"

# --- 6. row counts -----------------------------------------------------------
log "step 6: row counts in $PG_CONTAINER"
POST_COUNTS="$(counts "$PG_CONTAINER")" || fail "post counts"
log "  post-cutover counts: ${POST_COUNTS//$'\n'/ }"
if [ "$PRE_COUNTS" != "unknown" ] && [ "$PRE_COUNTS" != "$POST_COUNTS" ]; then
	fail "row-count mismatch: pre='${PRE_COUNTS//$'\n'/ }' post='${POST_COUNTS//$'\n'/ }'"
fi

log "done."
log "update .env.vichar: set DATABASE_URL=postgres://postgres:<POSTGRES_PASSWORD>@127.0.0.1:5434/${POSTGRES_DB:-vichar}"
log "  REDIS_HOST=127.0.0.1 REDIS_PORT=8381 (only matters for host processes; the app container uses the docker network)"
