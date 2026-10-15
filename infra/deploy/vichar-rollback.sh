#!/bin/bash
# vichar-rollback <sha> — send traffic back to the other colour.
#
# The previous colour's container is normally still parked (stopped, not
# removed), so this is `docker start` + health + nginx switch. If it was
# removed (e.g. after the next deploy), the sha-<sha> image is pulled and the
# container recreated with the same env/port layout as a deploy would use.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then exec sudo "$(readlink -f "$0")" "$@"; fi

_HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for _lib in "${VICHAR_LIB:-}" "${_HERE}/lib.sh" "/usr/local/lib/vichar/lib.sh"; do
	# shellcheck source=infra/deploy/lib.sh
	[ -n "$_lib" ] && [ -f "$_lib" ] && . "$_lib" && break
done
[ "${VICHAR_LIB_LOADED:-0}" = "1" ] || { echo "vichar-rollback: lib.sh not found" >&2; exit 1; }

SHA="${1:-}"
case "$SHA" in
	''|*[!0-9a-f]*) die "usage: vichar-rollback <sha>  (7-40 lowercase hex chars)" ;;
esac
IMAGE="${APP_IMAGE_REPO}:sha-${SHA}"

SWITCHED=0
fail() { # msg — same rule as deploy: after the switch, keep the target live
	trap - ERR
	set +e
	if [ "$SWITCHED" = "1" ]; then
		warn "ROLLBACK FAILED AFTER NGINX SWITCH — $*"
		warn "target colour keeps serving; fix forward or re-run manually"
		write_state "$TARGET_COLOR" "$SHA" "$TARGET" || true
		notify_discord "VICHAR ROLLBACK to ${SHA} FAILED post-switch: $* — manual attention required"
	else
		# A failed target may hold its port set — stop it (kept, not removed,
		# so the operator can inspect logs). Live colour is untouched.
		if [ -n "${TARGET:-}" ] && container_running "$TARGET"; then
			log "stopping failed target $TARGET"
			docker stop "$TARGET" >/dev/null 2>&1 || true
		fi
		notify_discord "VICHAR ROLLBACK to ${SHA} failed pre-switch ($*) — live colour untouched"
		die "$*"
	fi
	exit 1
}
trap 'fail "unexpected error near line $LINENO"' ERR

_live="$(detect_live)"
LIVE_COLOR="${_live%% *}"
LIVE_CONTAINER="${_live##* }"
[ "$LIVE_COLOR" = "none" ] && die "no live colour detected; nothing to roll back from"
TARGET_COLOR="$(other_color "$LIVE_COLOR")"
TARGET="$(container_name "$TARGET_COLOR")"
log "rollback to ${SHA}: live=${LIVE_COLOR} (${LIVE_CONTAINER}); target=${TARGET_COLOR} (${TARGET})"

check_free_disk
require_network

if container_exists "$TARGET"; then
	container_running "$TARGET" && die "${TARGET} already running — two live colours, refusing to guess"
	img="$(docker inspect -f '{{.Config.Image}}' "$TARGET" 2>/dev/null || true)"
	[ "$img" = "$IMAGE" ] || warn "${TARGET} runs image '${img}', requested sha-${SHA} — starting it anyway"
	run docker start "$TARGET" || fail "docker start ${TARGET}"
else
	check_ports_free "$TARGET_COLOR"
	pull_image "$IMAGE" || fail "docker pull ${IMAGE} (pruned from registry too?)"
	start_container "$TARGET_COLOR" "$IMAGE" || fail "docker run ${TARGET}"
fi

health_color "$TARGET_COLOR" || fail "health checks on ${TARGET_COLOR}"

log "switching nginx upstreams to ${TARGET_COLOR}"
switch_nginx "$TARGET_COLOR" || fail "nginx switch"
SWITCHED=1

enable_worker "$TARGET" || fail "worker start in ${TARGET}"
sleep 5
ports_for "$TARGET_COLOR"
wait_http "http://127.0.0.1:${P_API}/" 200 30 || fail "post-switch api probe"

log "stopping former live container ${LIVE_CONTAINER}"
run docker stop "$LIVE_CONTAINER" || fail "docker stop ${LIVE_CONTAINER}"
write_state "$TARGET_COLOR" "$SHA" "$TARGET"
notify_discord "VICHAR ROLLBACK OK — back on ${TARGET_COLOR} at ${SHA}"
log "done: ${TARGET_COLOR} serving"
