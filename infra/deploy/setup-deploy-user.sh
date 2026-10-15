#!/bin/bash
# setup-deploy-user — idempotent host setup for the Vichar deploy pipeline.
# Run once as root at go-live. Safe to re-run; existing users/keys/files are
# kept. Prints the GitHub secrets + environment checklist at the end.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
STATE_DIR="${VICHAR_STATE_DIR:-/var/lib/vichar}"
KEY_DIR="${STATE_DIR}/.ssh"
KEY="${KEY_DIR}/id_ed25519"
NGINX_UPSTREAMS_FILE="${NGINX_UPSTREAMS_FILE:-/etc/nginx/vichar-upstreams.conf}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${REPO_ROOT}/infra/deploy"

step() { echo; echo "== $*"; }
[ "$(id -u)" -eq 0 ] || { echo "must run as root" >&2; exit 1; }

# --- deploy user --------------------------------------------------------------
step "deploy user"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
	useradd --create-home --shell /bin/bash "$DEPLOY_USER"
	echo "created $DEPLOY_USER"
else
	echo "$DEPLOY_USER exists"
fi

mkdir -p "$STATE_DIR" "$KEY_DIR"
chmod 700 "$KEY_DIR"

# --- deploy SSH keypair ---------------------------------------------------------
step "deploy SSH key"
if [ ! -f "$KEY" ]; then
	ssh-keygen -t ed25519 -N "" -C "vichar-deploy@$(hostname)" -f "$KEY" -q
	chmod 600 "$KEY"
	echo "generated $KEY"
else
	echo "$KEY exists"
fi

home_dir="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
mkdir -p "$home_dir/.ssh"
pub="$(cat "${KEY}.pub")"
# `restrict` kills pty/port-forwarding/agent-forwarding for this key; the
# deploy command still takes arguments so no forced-command.
entry="restrict ${pub}"
if ! grep -qF "$pub" "$home_dir/.ssh/authorized_keys" 2>/dev/null; then
	echo "$entry" >> "$home_dir/.ssh/authorized_keys"
	echo "installed authorized_keys entry (restrict)"
else
	echo "authorized_keys entry present"
fi
chmod 700 "$home_dir/.ssh"
chmod 600 "$home_dir/.ssh/authorized_keys"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$home_dir/.ssh"

# --- deploy scripts -------------------------------------------------------------
step "install scripts"
install -m 0755 -o root -g root "$SRC/vichar-deploy.sh"   /usr/local/sbin/vichar-deploy
install -m 0755 -o root -g root "$SRC/vichar-rollback.sh" /usr/local/sbin/vichar-rollback
mkdir -p /usr/local/lib/vichar
install -m 0644 -o root -g root "$SRC/lib.sh" /usr/local/lib/vichar/lib.sh
echo "installed /usr/local/sbin/vichar-{deploy,rollback} + /usr/local/lib/vichar/lib.sh"

# --- sudoers --------------------------------------------------------------------
step "sudoers"
dropin="/etc/sudoers.d/vichar-deploy"
cat > "$dropin" <<EOF
# deploy user may run ONLY the vichar deploy/rollback entry points, as root.
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/vichar-deploy
$DEPLOY_USER ALL=(root) NOPASSWD: /usr/local/sbin/vichar-rollback
EOF
chmod 440 "$dropin"
if visudo -cf "$dropin" >/dev/null; then
	echo "sudoers drop-in OK: $dropin"
else
	rm -f "$dropin"
	echo "sudoers drop-in INVALID — removed" >&2
	exit 1
fi

# --- nginx upstreams seed ---------------------------------------------------------
step "nginx upstreams"
if [ ! -f "$NGINX_UPSTREAMS_FILE" ]; then
	install -m 0644 -o root -g root "$SRC/nginx-upstreams.inc" "$NGINX_UPSTREAMS_FILE"
	echo "installed $NGINX_UPSTREAMS_FILE (blue port defaults)"
else
	echo "$NGINX_UPSTREAMS_FILE exists (left as-is — deploy manages it)"
fi
echo "NOTE: install the updated vichar.conf (repo infra/nginx-vichar.conf uses"
echo "      the upstream names) to /etc/nginx/llmgateway-demo/vichar.conf, then"
echo "      'nginx -t && systemctl reload nginx'. The upstreams file must exist"
echo "      first — that is why this step runs before it."

# --- checklist -------------------------------------------------------------------
step "manual checklist (owner)"
cat <<EOF
1. GHCR pull auth on this host (one-time, as root):
     echo '<GHCR_PAT>' | docker login ghcr.io -u <github-user> --password-stdin
   PAT scope: read:packages on vicharai/api.
2. GitHub repo settings on vicharai/api:
     - create environment 'production'
     - secrets: DEPLOY_SSH_KEY (the PRIVATE key below), DEPLOY_HOST,
       DEPLOY_USER=$DEPLOY_USER, VICHAR_OPS_DISCORD_WEBHOOK (optional)
3. Optional: add VICHAR_OPS_DISCORD_WEBHOOK=... to /root/llmgateway-upstream/.env.vichar
   so host-side deploy/rollback scripts can also post status.
4. Seed the deploy state if the legacy 'vichar' container is still live:
     printf 'color=blue\nsha=bootstrap\ncontainer=vichar\nts=%s\n' \\
       "\$(date -u +%FT%TZ)" > $STATE_DIR/deploy-state
   (Without it, first deploy still works: it detects 'vichar' holding the
   blue ports and lands on green.)

DEPLOY_SSH_KEY secret value (private key):
$(cat "$KEY")

Public key (already installed for $DEPLOY_USER):
$pub
EOF
