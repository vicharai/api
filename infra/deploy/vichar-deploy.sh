#!/bin/bash
# vichar-deploy <sha> — blue/green deploy of ghcr.io/vicharai/api-app:sha-<sha>
# plus the matching ghcr.io/vicharai/api-admin:sha-<sha> admin container.
#
# Run as root, or as the restricted deploy user (the script re-execs itself
# via sudo; sudoers permits only this path). Flow: disk check -> pull ->
# start the idle colour -> health-check -> switch nginx upstreams -> start the
# worker -> stop the old colour -> record state -> prune images -> Discord.
#
# VICHAR_DEPLOY_DRY_RUN=1 prints every mutating step without executing.
# See infra/README-vichar.md for the install + go-live procedure.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then exec sudo "$(readlink -f "$0")" "$@"; fi

_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for _lib in "${VICHAR_LIB:-}" "${_HERE}/lib.sh" "/usr/local/lib/vichar/lib.sh"; do
	# shellcheck source=infra/deploy/lib.sh
	[ -n "$_lib" ] && [ -f "$_lib" ] && . "$_lib" && break
done
[ "${VICHAR_LIB_LOADED:-0}" = "1" ] || { echo "vichar-deploy: lib.sh not found" >&2; exit 1; }

SHA="${1:-}"
case "$SHA" in
	''|*[!0-9a-f]*) die "usage: vichar-deploy <sha>  (7-40 lowercase hex chars)" ;;
esac
[ "${#SHA}" -ge 7 ] && [ "${#SHA}" -le 40 ] || die "bad sha length: $SHA"
IMAGE="${APP_IMAGE_REPO}:sha-${SHA}"
ADMIN_IMAGE="${ADMIN_IMAGE_REPO}:sha-${SHA}"

SWITCHED=0
TARGET=""
TARGET_COLOR=""
LIVE_COLOR=""
LIVE_CONTAINER=""

fail() { # msg — pre-switch failures clean up; post-switch ones keep green live
	trap - ERR
	set +e # cleanup below must never abort halfway
	if [ "$SWITCHED" = "1" ]; then
		warn "FAILED AFTER NGINX SWITCH — $*"
		warn "${TARGET:-target} keeps serving. NO auto-rollback: nginx may be"
		warn "mid-state. Manual recovery: inspect 'docker logs ${TARGET}', then"
		warn "either fix forward or run: vichar-rollback <previous-sha>"
		# nginx already points at the target — record that ground truth so
		# the next run detects correctly instead of trusting the stale state.
		write_state "$TARGET_COLOR" "$SHA" "$TARGET" || true
		notify_discord "VICHAR DEPLOY ${SHA} FAILED post-switch: $* — manual attention required"
	else
		warn "failed before nginx switch: $*"
		if [ -n "$TARGET_COLOR" ]; then
			destroy_container "$TARGET_COLOR"
			if [ "$DRY_RUN" != "1" ]; then docker rmi "$IMAGE" "$ADMIN_IMAGE" >/dev/null 2>&1 || true; fi
		fi
		notify_discord "VICHAR DEPLOY ${SHA} failed pre-switch ($*) — rolled back, ${LIVE_COLOR:-live} untouched"
		die "$*"
	fi
	exit 1
}
trap 'fail "unexpected error near line $LINENO"' ERR

# --- 1. disk ----------------------------------------------------------------
log "deploy ${SHA} starting (image ${IMAGE})"
check_free_disk

# --- 2. pre-deploy backup + pull ---------------------------------------------
log "pre-deploy backup"
pre_deploy_backup || fail "pre-deploy backup (${BACKUP_SCRIPT})"

pull_image "$IMAGE" || fail "docker pull ${IMAGE} (build pushed it? ghcr login ok?)"
pull_image "$ADMIN_IMAGE" || fail "docker pull ${ADMIN_IMAGE} (build pushed it? ghcr login ok?)"

# --- 3. live colour ----------------------------------------------------------
_live="$(detect_live)"
LIVE_COLOR="${_live%% *}"
LIVE_CONTAINER="${_live##* }"
if [ "$LIVE_COLOR" = "none" ]; then
	TARGET_COLOR="blue"
	warn "nothing currently live — first deploy lands on the blue port set"
else
	TARGET_COLOR="$(other_color "$LIVE_COLOR")"
fi
TARGET="$(container_name "$TARGET_COLOR")"
TARGET_ADMIN="$(admin_container_name "$TARGET_COLOR")"
log "live=${LIVE_COLOR} (${LIVE_CONTAINER}); deploying to ${TARGET_COLOR} (${TARGET}, ${TARGET_ADMIN})"

# --- 4. start the idle colour -------------------------------------------------
require_network
for _stale in "$TARGET" "$TARGET_ADMIN"; do
	if container_exists "$_stale"; then
		log "removing stale container $_stale"
		run docker rm -f "$_stale"
	fi
done
check_ports_free "$TARGET_COLOR"
start_container "$TARGET_COLOR" "$IMAGE" || fail "docker run ${TARGET}"

# --- 5. health ----------------------------------------------------------------
log "health checks on ${TARGET_COLOR} (api has ${HEALTH_TIMEOUT}s — migrations run at boot)"
health_color "$TARGET_COLOR" || fail "health checks on ${TARGET_COLOR} (see: docker logs ${TARGET})"

# The admin container reaches the api by container name, so it starts once
# the api is healthy.
start_admin_container "$TARGET_COLOR" "$ADMIN_IMAGE" || fail "docker run ${TARGET_ADMIN}"
health_admin "$TARGET_COLOR" || fail "admin health on ${TARGET_COLOR} (see: docker logs ${TARGET_ADMIN})"

# --- 6. switch nginx ----------------------------------------------------------
log "switching nginx upstreams to ${TARGET_COLOR}"
switch_nginx "$TARGET_COLOR" || fail "nginx switch (file/nginx -t/reload)"
SWITCHED=1

# --- 7. worker on, old colour off ----------------------------------------------
enable_worker "$TARGET" || fail "worker start in ${TARGET}"
log "worker started; settling 5s"
sleep 5
ports_for "$TARGET_COLOR"
wait_http "http://127.0.0.1:${P_API}/" 200 30 || fail "post-switch api probe"

if [ "$LIVE_COLOR" != "none" ]; then
	log "stopping previous live container ${LIVE_CONTAINER} (kept for rollback)"
	run docker stop "$LIVE_CONTAINER" || fail "docker stop ${LIVE_CONTAINER}"
	_live_admin="$(admin_container_name "$LIVE_COLOR")"
	if container_running "$_live_admin"; then
		run docker stop "$_live_admin" || fail "docker stop ${_live_admin}"
	fi
fi
write_state "$TARGET_COLOR" "$SHA" "$TARGET"

# --- 8. cleanup + report -------------------------------------------------------
prune_images "$SHA"
notify_discord "VICHAR DEPLOY ${SHA} OK — ${TARGET_COLOR} live (was ${LIVE_COLOR})"
log "done: ${TARGET_COLOR} serving ${SHA}"
