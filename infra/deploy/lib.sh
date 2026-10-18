#!/bin/bash
# Shared helpers for vichar-deploy / vichar-rollback. Sourced, not executed.
#
# Every path/name is env-overridable so the same code runs against stub
# containers in tests without touching production names or nginx.

APP_IMAGE_REPO="${APP_IMAGE_REPO:-ghcr.io/vicharai/api-app}"
CONTAINER_PREFIX="${CONTAINER_PREFIX:-vichar-app}"
# The admin panel (apps/admin) ships as its own image and container, switched
# together with the app colour so it always talks to the live api.
ADMIN_IMAGE_REPO="${ADMIN_IMAGE_REPO:-ghcr.io/vicharai/api-admin}"
ADMIN_CONTAINER_PREFIX="${ADMIN_CONTAINER_PREFIX:-vichar-admin}"
APP_NETWORK="${APP_NETWORK:-vichar}"
ENV_FILE="${ENV_FILE:-/root/llmgateway-upstream/.env.vichar}"
STATE_DIR="${VICHAR_STATE_DIR:-/var/lib/vichar}"
STATE_FILE="${STATE_FILE:-${STATE_DIR}/deploy-state}"
LEGACY_CONTAINER="${LEGACY_CONTAINER:-vichar}"
NGINX_UPSTREAMS_FILE="${NGINX_UPSTREAMS_FILE:-/etc/nginx/vichar-upstreams.conf}"
WORKER_PROGRAM="${WORKER_PROGRAM:-worker}"

# Host loopback ports per colour. The container-side ports are fixed by the
# image (3002 ui / 3005 docs / 4001 gateway / 4002 api). Green reuses the old
# staging overlay ports — never run both at once.
BLUE_UI_PORT="${BLUE_UI_PORT:-3302}"
BLUE_DOCS_PORT="${BLUE_DOCS_PORT:-3305}"
BLUE_GW_PORT="${BLUE_GW_PORT:-4301}"
BLUE_API_PORT="${BLUE_API_PORT:-4302}"
GREEN_UI_PORT="${GREEN_UI_PORT:-3312}"
GREEN_DOCS_PORT="${GREEN_DOCS_PORT:-3315}"
GREEN_GW_PORT="${GREEN_GW_PORT:-4311}"
GREEN_API_PORT="${GREEN_API_PORT:-4312}"
# Admin container listens on :3006 inside its own image.
BLUE_ADMIN_PORT="${BLUE_ADMIN_PORT:-3306}"
GREEN_ADMIN_PORT="${GREEN_ADMIN_PORT:-3316}"

# Docker-network names of the split data services. Container names resolve on
# the user-defined "vichar" network alongside the compose service aliases.
DB_NET_HOST="${DB_NET_HOST:-vichar-postgres}"
REDIS_NET_HOST="${REDIS_NET_HOST:-vichar-redis}"

MIN_FREE_KB="${VICHAR_MIN_FREE_KB:-$((5 * 1024 * 1024))}"  # abort below 5G free on /
# Plan calls for a fresh dump before every deploy; keep it optional and
# fail-closed (an error aborts before anything changes).
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/root/llmgateway-upstream/infra/backup-vichar.sh}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"  # api / covers boot migrations too
DRY_RUN="${VICHAR_DEPLOY_DRY_RUN:-0}"
SKIP_NGINX="${VICHAR_SKIP_NGINX:-0}"     # test hook: stub nginx -t/reload away
SKIP_WORKER="${VICHAR_SKIP_WORKER:-0}"   # test hook: stubs have no supervisor
SKIP_PULL="${VICHAR_SKIP_PULL:-0}"       # test hook: use a local image tag

log()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }
warn() { log "WARN: $*" >&2; }
die()  { log "FATAL: $*" >&2; exit 1; }

run() { # execute, or print under VICHAR_DEPLOY_DRY_RUN=1
	if [ "$DRY_RUN" = "1" ]; then
		log "dry-run: $*"
	else
		"$@"
	fi
}

envfile_get() { # print value of $1 from env file, or empty
	awk -F= -v k="$1" 'index($0,k "=")==1{sub("^[^=]*=",""); gsub(/^["'"'"']|["'"'"']$/,""); print; exit}' "$ENV_FILE" 2>/dev/null || true
}

container_running() { docker ps --format '{{.Names}}'   | grep -qx "$1"; }
container_exists()  { docker ps -a --format '{{.Names}}' | grep -qx "$1"; }

port_in_use() { # is something listening on loopback $1?
	(exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null || return 1
	exec 3>&- 3<&-
	return 0
}

wait_http() { # url expected-status [timeout-seconds]
	local url="$1" want="$2" t="${3:-60}" code
	if [ "$DRY_RUN" = "1" ]; then log "dry-run: poll $url for HTTP $want"; return 0; fi
	while [ "$t" -gt 0 ]; do
		code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" || true)"
		[ "$code" = "$want" ] && return 0
		sleep 2; t=$((t - 2))
	done
	return 1
}

ports_for() { # colour -> sets P_UI P_DOCS P_GW P_API P_ADMIN
	case "$1" in
		blue)
			P_UI="$BLUE_UI_PORT";   P_DOCS="$BLUE_DOCS_PORT"
			P_GW="$BLUE_GW_PORT";   P_API="$BLUE_API_PORT"
			P_ADMIN="$BLUE_ADMIN_PORT" ;;
		green)
			P_UI="$GREEN_UI_PORT";  P_DOCS="$GREEN_DOCS_PORT"
			P_GW="$GREEN_GW_PORT";  P_API="$GREEN_API_PORT"
			P_ADMIN="$GREEN_ADMIN_PORT" ;;
		*) die "unknown colour '$1'" ;;
	esac
}

other_color()    { [ "$1" = "blue" ] && echo green || echo blue; }
container_name() { echo "${CONTAINER_PREFIX}-$1"; }
admin_container_name() { echo "${ADMIN_CONTAINER_PREFIX}-$1"; }

state_get() { # key -> value from the deploy state file, empty if absent
	[ -f "$STATE_FILE" ] || return 1
	awk -F= -v k="$1" '$1==k{print $2; exit}' "$STATE_FILE"
}

write_state() { # colour sha container — rotates the current file to .prev
	if [ "$DRY_RUN" = "1" ]; then
		log "dry-run: write $STATE_FILE (color=$1 sha=$2 container=$3)"
		return 0
	fi
	mkdir -p "$STATE_DIR"
	[ -f "$STATE_FILE" ] && cp "$STATE_FILE" "${STATE_FILE}.prev"
	{
		echo "color=$1"
		echo "sha=$2"
		echo "container=$3"
		echo "ts=$(date -u +%FT%TZ)"
	} >"$STATE_FILE"
}

detect_live() { # echoes "<colour> <container>" or "none -"
	local col cont
	if [ -f "$STATE_FILE" ]; then
		col="$(state_get color || true)"
		cont="$(state_get container || true)"
		if [ -n "$col" ] && [ -n "$cont" ] && container_running "$cont"; then
			echo "$col $cont"; return
		fi
		[ -n "$col" ] && warn "state file says $col/$cont but it is not running; inspecting docker"
	fi
	for col in blue green; do
		cont="$(container_name "$col")"
		if container_running "$cont"; then echo "$col $cont"; return; fi
	done
	# First deploy after the Phase-1 cutover: the legacy all-in-one (or an
	# ad-hoc container) still owns the blue ports — treat that as "blue live".
	if container_running "$LEGACY_CONTAINER" || port_in_use "$BLUE_API_PORT"; then
		echo "blue $LEGACY_CONTAINER"; return
	fi
	echo "none -"
}

check_free_disk() {
	local kb
	kb="$(df -Pk / | awk 'NR==2 {print $4}')"
	[ "$kb" -ge "$MIN_FREE_KB" ] || die "only ${kb}KB free on / (need ${MIN_FREE_KB}KB)"
}

pre_deploy_backup() { # pg_dump via backup-vichar.sh when it exists on the host
	if [ ! -x "$BACKUP_SCRIPT" ]; then
		log "skip: pre-deploy backup ($BACKUP_SCRIPT not executable)"
		return 0
	fi
	run "$BACKUP_SCRIPT"
}

require_network() { # the shared docker network must exist before docker run
	if docker network inspect "$APP_NETWORK" >/dev/null 2>&1; then return 0; fi
	[ "$DRY_RUN" = "1" ] && { warn "dry-run: network '$APP_NETWORK' missing"; return 0; }
	die "docker network '$APP_NETWORK' missing — first: docker compose --env-file .env.vichar -f infra/docker-compose.vichar.yml up -d postgres redis"
}

check_ports_free() { # colour — die if any of its host ports are taken
	local col="$1" p
	ports_for "$col"
	for p in "$P_UI" "$P_DOCS" "$P_GW" "$P_API" "$P_ADMIN"; do
		if port_in_use "$p"; then die "port $p ($col set) already in use"; fi
	done
	return 0
}

start_container() { # colour image — detached, worker held off, loopback ports
	local col="$1" image="$2" name
	name="$(container_name "$col")"
	ports_for "$col"
	[ -f "$ENV_FILE" ] || die "env file $ENV_FILE missing"
	local db_pass db_name
	db_pass="${POSTGRES_PASSWORD:-$(envfile_get POSTGRES_PASSWORD)}"
	db_name="${POSTGRES_DB:-$(envfile_get POSTGRES_DB)}"
	[ -n "$db_pass" ] || die "POSTGRES_PASSWORD unset and not in $ENV_FILE"
	local -a args=(
		-d
		--name "$name"
		--label "vichar.color=$col"
		--network "$APP_NETWORK"
		--env-file "$ENV_FILE"
		-e NODE_OPTIONS=--dns-result-order=ipv4first
		-e "DATABASE_URL=postgres://postgres:${db_pass}@${DB_NET_HOST}:5432/${db_name:-vichar}"
		-e "REDIS_HOST=${REDIS_NET_HOST}"
		-e REDIS_PORT=6379
		-e VICHAR_WORKER_AUTOSTART=false
		-e RUN_MIGRATIONS=true
		-p "127.0.0.1:${P_UI}:3002"
		-p "127.0.0.1:${P_DOCS}:3005"
		-p "127.0.0.1:${P_GW}:4001"
		-p "127.0.0.1:${P_API}:4002"
		--restart unless-stopped
		"$image"
	)
	if [ "$DRY_RUN" = "1" ]; then
		# scrub the db password out of the printed command
		log "dry-run: docker run ${args[*]//${db_pass}/***}"
		return 0
	fi
	docker run "${args[@]}"
}

start_admin_container() { # colour image — talks to the same colour's api over the docker network
	local col="$1" image="$2" name app
	name="$(admin_container_name "$col")"
	app="$(container_name "$col")"
	ports_for "$col"
	[ -f "$ENV_FILE" ] || die "env file $ENV_FILE missing"
	local -a args=(
		-d
		--name "$name"
		--label "vichar.color=$col"
		--network "$APP_NETWORK"
		--env-file "$ENV_FILE"
		-e "API_BACKEND_URL=http://${app}:4002"
		-e PORT=3006
		-e HOSTNAME=0.0.0.0
		-p "127.0.0.1:${P_ADMIN}:3006"
		--restart unless-stopped
		"$image"
	)
	if [ "$DRY_RUN" = "1" ]; then
		log "dry-run: docker run ${args[*]}"
		return 0
	fi
	docker run "${args[@]}"
}

destroy_container() { # colour — app and admin
	local name
	for name in "$(container_name "$1")" "$(admin_container_name "$1")"; do
		if container_exists "$name"; then run docker rm -f "$name"; fi
	done
}

health_admin() { # colour — the admin login page must render
	ports_for "$1"
	wait_http "http://127.0.0.1:${P_ADMIN}/login" 200 60 \
		|| { warn "admin /login on :${P_ADMIN} unhealthy"; return 1; }
	log "  admin /login ok (:${P_ADMIN})"
}

health_color() { # colour — all four surfaces must answer 200
	local col="$1"
	ports_for "$col"
	# api first: it runs migrations at boot (RUN_MIGRATIONS=true) before
	# serving, so its 200 covers schema + db + redis readiness.
	wait_http "http://127.0.0.1:${P_API}/" 200 "$HEALTH_TIMEOUT" \
		|| { warn "api / on :${P_API} unhealthy"; return 1; }
	log "  api / ok (:${P_API})"
	wait_http "http://127.0.0.1:${P_UI}/login" 200 60 \
		|| { warn "ui /login on :${P_UI} unhealthy"; return 1; }
	log "  ui /login ok (:${P_UI})"
	wait_http "http://127.0.0.1:${P_DOCS}/" 200 60 \
		|| { warn "docs / on :${P_DOCS} unhealthy"; return 1; }
	log "  docs / ok (:${P_DOCS})"
	wait_http "http://127.0.0.1:${P_GW}/v1/models" 200 60 \
		|| { warn "gateway /v1/models on :${P_GW} unhealthy"; return 1; }
	log "  gateway /v1/models ok (:${P_GW})"
}

write_upstreams() { # colour — atomic rewrite of the nginx upstream include
	local col="$1"
	ports_for "$col"
	if [ "$DRY_RUN" = "1" ]; then
		log "dry-run: write $NGINX_UPSTREAMS_FILE with $col ports ${P_UI}/${P_DOCS}/${P_GW}/${P_API}/${P_ADMIN}"
		return 0
	fi
	local tmp="${NGINX_UPSTREAMS_FILE}.tmp"
	cat >"$tmp" <<EOF
# Generated by vichar-deploy ($(date -u +%FT%TZ), colour: $col). Do not edit.
# http-context upstreams consumed by nginx-vichar.conf. Deploy rewrites this
# file, then runs nginx -t && systemctl reload nginx — a hand edit that fails
# nginx -t leaves nginx on the previous config, a reload applies atomically.
upstream vichar_ui      { server 127.0.0.1:${P_UI}; }
upstream vichar_docs    { server 127.0.0.1:${P_DOCS}; }
upstream vichar_gateway { server 127.0.0.1:${P_GW}; }
upstream vichar_api     { server 127.0.0.1:${P_API}; }
upstream vichar_admin   { server 127.0.0.1:${P_ADMIN}; }
EOF
	mv "$tmp" "$NGINX_UPSTREAMS_FILE"
}

pull_image() { # image — skipped under dry-run and the test hook
	if [ "$DRY_RUN" = "1" ]; then log "dry-run: docker pull $1"; return 0; fi
	if [ "$SKIP_PULL" = "1" ]; then log "skip: docker pull $1 (VICHAR_SKIP_PULL=1)"; return 0; fi
	docker pull "$1"
}

switch_nginx() { # colour — point the edge at the colour's port set
	write_upstreams "$1"
	if [ "$SKIP_NGINX" = "1" ]; then
		log "skip: nginx -t/reload (VICHAR_SKIP_NGINX=1)"
		return 0
	fi
	run nginx -t || return 1
	run systemctl reload nginx || return 1
}

enable_worker() { # container — background jobs run on exactly one colour
	if [ "$SKIP_WORKER" = "1" ]; then
		log "skip: supervisorctl start $WORKER_PROGRAM (VICHAR_SKIP_WORKER=1)"
		return 0
	fi
	run docker exec "$1" supervisorctl start "$WORKER_PROGRAM"
}

notify_discord() { # message — posts to VICHAR_OPS_DISCORD_WEBHOOK if configured
	local hook msg
	hook="${VICHAR_OPS_DISCORD_WEBHOOK:-$(envfile_get VICHAR_OPS_DISCORD_WEBHOOK)}"
	msg="$(printf '%s' "$*" | tr -d '"\\' | head -c 1800)"
	if [ -z "$hook" ]; then log "discord(unset): $msg"; return 0; fi
	if [ "$DRY_RUN" = "1" ]; then log "dry-run: discord -> $msg"; return 0; fi
	curl -sS -o /dev/null -X POST -H 'Content-Type: application/json' \
		--data "{\"content\": \"${msg}\"}" --max-time 10 "$hook" \
		|| warn "discord post failed"
}

prune_images() { # current-sha — keep it plus the 2 newest other sha-* tags per repo
	local keep="sha-$1" n repo tag
	# docker images prints newest first (image creation, not pull order); only
	# sha-* tags of the app/admin repos match, so vichar-vichar legacy,
	# postgres, redis and :latest are never touched.
	for repo in "$APP_IMAGE_REPO" "$ADMIN_IMAGE_REPO"; do
		n=0
		while read -r tag; do
			[ -z "$tag" ] && continue
			[ "$tag" = "$keep" ] && continue
			n=$((n + 1))
			[ "$n" -le 2 ] && continue
			log "prune: docker rmi ${repo}:${tag}"
			run docker rmi "${repo}:${tag}" || warn "prune: rmi ${tag} failed"
		done < <(docker images "$repo" --format '{{.Tag}}' | grep '^sha-')
	done
}

# shellcheck disable=SC2034 # consumed by the sourcing entry scripts
VICHAR_LIB_LOADED=1
