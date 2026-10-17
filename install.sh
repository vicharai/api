#!/usr/bin/env bash
# Vichar server installer for Ubuntu 26.04 LTS.
#
#   cp .env.install.example .env && $EDITOR .env
#   sudo ./install.sh [command]
#
# Commands:
#   install            (default) install/upgrade everything for DEPLOY_MODE
#   check              validate .env, the server and database connectivity only
#   update             git pull (fast-forward), rebuild and restart
#   status             show service and health status
#   logs [service]     follow logs (production: app|admin|redis)
#   restart | stop     restart or stop the stack
#   verify-admin EMAIL mark an ADMIN_EMAILS account's email as verified
#   tls                request/renew HTTPS now (also retried automatically)
#   help               show this help
#
# PostgreSQL is external (DATABASE_URL, e.g. AWS RDS). Redis, nginx, certbot
# and Docker (plus Node.js in development mode) are installed here.
set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${VICHAR_ENV_FILE:-$REPO_DIR/.env}"
RUNTIME_ENV_FILE="$REPO_DIR/.env.runtime"
CONFIG_DIR="${VICHAR_CONFIG_DIR:-/etc/vichar}"
COMPOSE_DIR="$REPO_DIR/infra/install"
LOG_FILE="${VICHAR_INSTALL_LOG:-/var/log/vichar-install.log}"
RDS_BUNDLE_URL="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
PG_CLIENT_IMAGE="postgres:17-alpine"
NGINX_SITE="/etc/nginx/sites-available/vichar.conf"
DEV_SERVICE="vichar-dev"
TLS_UNIT="vichar-tls"
CERT_NAME="vichar"
SUPPORTED_UBUNTU="26.04"

ERRORS=0
WARNINGS=0
declare -A CFG=()

# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------
if [ -t 1 ]; then
	C_RED=$'\e[31m' C_YEL=$'\e[33m' C_GRN=$'\e[32m' C_BLU=$'\e[34m' C_RST=$'\e[0m'
else
	C_RED="" C_YEL="" C_GRN="" C_BLU="" C_RST=""
fi
step() { printf '\n%s==> %s%s\n' "$C_BLU" "$*" "$C_RST"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '    %s✔%s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() {
	WARNINGS=$((WARNINGS + 1))
	printf '    %s!%s %s\n' "$C_YEL" "$C_RST" "$*" >&2
}
fail() {
	ERRORS=$((ERRORS + 1))
	printf '    %s✘%s %s\n' "$C_RED" "$C_RST" "$*" >&2
}
die() {
	printf '\n%sERROR:%s %s\n' "$C_RED" "$C_RST" "$*" >&2
	exit 1
}
trap 'die "command failed (line $LINENO): $BASH_COMMAND — full log: $LOG_FILE"' ERR

usage() { sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

# --------------------------------------------------------------------------
# .env handling — values are read literally (no shell expansion).
# --------------------------------------------------------------------------
parse_env_file() {
	local file="$1" line key value
	CFG=()
	while IFS= read -r line || [ -n "$line" ]; do
		line="${line%$'\r'}"
		[[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
		line="${line#export }"
		[[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
		key="${BASH_REMATCH[1]}"
		value="${BASH_REMATCH[2]}"
		if [[ "$value" =~ ^\'(.*)\'[[:space:]]*$ ]] || [[ "$value" =~ ^\"(.*)\"[[:space:]]*$ ]]; then
			value="${BASH_REMATCH[1]}"
		else
			value="$(sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' <<<"$value")"
		fi
		CFG["$key"]="$value"
	done <"$file"
}

cfg() { # cfg KEY [default]
	local v="${CFG[$1]:-}"
	if [ -n "$v" ]; then printf '%s' "$v"; else printf '%s' "${2:-}"; fi
}

set_env_value() { # persist KEY=VALUE into .env (replace or append)
	local key="$1" value="$2" tmp
	tmp="$(mktemp)"
	if grep -qE "^[[:space:]]*(export[[:space:]]+)?${key}=" "$ENV_FILE"; then
		awk -v k="$key" -v v="$value" '
			$0 ~ "^[[:space:]]*(export[[:space:]]+)?" k "=" && !done { print k "=" v; done=1; next }
			{ print }' "$ENV_FILE" >"$tmp"
	else
		cp "$ENV_FILE" "$tmp"
		printf '%s=%s\n' "$key" "$value" >>"$tmp"
	fi
	cat "$tmp" >"$ENV_FILE"
	rm -f "$tmp"
	CFG["$key"]="$value"
}

is_true() { [[ "${1,,}" =~ ^(1|true|yes|on)$ ]]; }

load_config() {
	[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Create it first: cp .env.install.example .env"
	parse_env_file "$ENV_FILE"

	MODE="$(cfg DEPLOY_MODE production)"
	MODE="${MODE,,}"
	case "$MODE" in
	prod) MODE=production ;;
	dev) MODE=development ;;
	esac

	ENABLE_TLS="$(cfg ENABLE_TLS true)"
	local fw_default=false
	[ "$MODE" = production ] && fw_default=true
	CONFIGURE_FIREWALL="$(cfg CONFIGURE_FIREWALL "$fw_default")"

	STACK_NAME="$(cfg STACK_NAME vichar)"
	BASE_DOMAIN="$(cfg BASE_DOMAIN)"
	BASE_DOMAIN="${BASE_DOMAIN,,}"
	APP_DOMAIN="$(cfg APP_DOMAIN "app.$BASE_DOMAIN")"
	API_DOMAIN="$(cfg API_DOMAIN "api.$BASE_DOMAIN")"
	ADMIN_DOMAIN="$(cfg ADMIN_DOMAIN "admin.$BASE_DOMAIN")"
	DOCS_DOMAIN="$(cfg DOCS_DOMAIN "docs.$BASE_DOMAIN")"
	LETSENCRYPT_EMAIL="$(cfg LETSENCRYPT_EMAIL "$(cfg ADMIN_EMAILS | cut -d, -f1 | tr -d ' ')")"
	DEV_USER="$(cfg DEV_USER "${SUDO_USER:-root}")"

	SCHEME=http
	if is_true "$ENABLE_TLS" && cert_present; then SCHEME=https; fi
	load_ports
}

cert_present() { [ -s "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" ]; }

# --------------------------------------------------------------------------
# Ports — picked automatically on first install (the default when free,
# else the next free one) and kept in $CONFIG_DIR/ports.env afterwards.
# --------------------------------------------------------------------------
PORT_KEYS_PRODUCTION=(UI_PORT DOCS_PORT GATEWAY_PORT API_PORT ADMIN_PORT)
PORT_KEYS_DEVELOPMENT=(UI_PORT DOCS_PORT GATEWAY_PORT API_PORT ADMIN_PORT METRICS_PORT REDIS_HOST_PORT)
declare -A PORT_DEFAULTS=(
	[UI_PORT]=3002 [DOCS_PORT]=3005 [GATEWAY_PORT]=4001 [API_PORT]=4002
	[ADMIN_PORT]=3006 [METRICS_PORT]=9090 [REDIS_HOST_PORT]=6379
)

port_keys() {
	if [ "$MODE" = development ]; then
		printf '%s\n' "${PORT_KEYS_DEVELOPMENT[@]}"
	else
		printf '%s\n' "${PORT_KEYS_PRODUCTION[@]}"
	fi
}

port_in_use() { ss -Hltn "sport = :$1" 2>/dev/null | grep -q .; }

load_ports() {
	local key line
	for key in "${!PORT_DEFAULTS[@]}"; do
		printf -v "$key" '%s' "${PORT_DEFAULTS[$key]}"
	done
	if [ -f "$CONFIG_DIR/ports.env" ]; then
		while IFS='=' read -r key line; do
			if [[ "$key" =~ ^[A-Z_]+_PORT$ ]] && [[ "$line" =~ ^[0-9]+$ ]]; then
				printf -v "$key" '%s' "$line"
			fi
		done <"$CONFIG_DIR/ports.env"
	fi
}

allocate_ports() {
	step "Allocating ports"
	local key port taken=" " saved=""
	[ -f "$CONFIG_DIR/ports.env" ] && saved="$(cat "$CONFIG_DIR/ports.env")"
	for key in $(port_keys); do
		if grep -q "^$key=" <<<"$saved"; then
			port="${!key}"
		else
			port="${PORT_DEFAULTS[$key]}"
			while port_in_use "$port" || [[ "$taken" == *" $port "* ]]; do
				port=$((port + 1))
			done
			printf -v "$key" '%s' "$port"
			[ "$port" = "${PORT_DEFAULTS[$key]}" ] || info "$key: ${PORT_DEFAULTS[$key]} is busy, using $port"
		fi
		taken+="$port "
	done
	install -d -m 0755 "$CONFIG_DIR"
	{
		echo "# Ports chosen by install.sh — delete this file to re-pick them."
		for key in $(port_keys); do echo "$key=${!key}"; done
	} >"$CONFIG_DIR/ports.env"
	ok "ui $UI_PORT, api $API_PORT, gateway $GATEWAY_PORT, admin $ADMIN_PORT, docs $DOCS_PORT (loopback only, behind nginx)"
}

has_systemd() { [ -d /run/systemd/system ]; }

# --------------------------------------------------------------------------
# Checks
# --------------------------------------------------------------------------
check_host() {
	step "Checking the server"
	if [ -r /etc/os-release ]; then
		# shellcheck disable=SC1091
		. /etc/os-release
		if [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = "$SUPPORTED_UBUNTU" ]; then
			ok "Ubuntu ${VERSION:-$VERSION_ID}"
		elif [ "${ID:-}" = ubuntu ]; then
			warn "Ubuntu ${VERSION_ID:-?} detected; this installer targets $SUPPORTED_UBUNTU LTS"
		else
			fail "unsupported OS '${PRETTY_NAME:-unknown}' — Ubuntu $SUPPORTED_UBUNTU LTS required"
		fi
	fi

	case "$(uname -m)" in
	x86_64 | aarch64) ok "architecture $(uname -m)" ;;
	*) fail "unsupported architecture $(uname -m) (need x86_64 or aarch64)" ;;
	esac

	local mem_mb disk_gb need_disk=20
	mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
	disk_gb=$(df -Pk / | awk 'NR==2 {print int($4/1024/1024)}')
	[ "$MODE" = development ] && need_disk=15
	need_disk="${VICHAR_MIN_DISK_GB:-$need_disk}"
	if [ "$mem_mb" -lt 3800 ]; then
		warn "${mem_mb}MB RAM — 4GB+ recommended (a swap file is added for builds)"
	else
		ok "${mem_mb}MB RAM"
	fi
	if [ "$disk_gb" -lt "$need_disk" ]; then
		fail "${disk_gb}GB free on / — need at least ${need_disk}GB"
	else
		ok "${disk_gb}GB free disk"
	fi
}

check_env() {
	step "Checking $ENV_FILE ($MODE mode)"
	case "$MODE" in
	production | development) ok "DEPLOY_MODE=$MODE" ;;
	*) fail "DEPLOY_MODE must be 'production' or 'development' (got '$MODE')" ;;
	esac

	local perms
	perms=$(stat -c '%a' "$ENV_FILE")
	[ "$perms" = 600 ] || [ "$perms" = 400 ] || warn ".env is mode $perms — it holds secrets; install sets it to 600"

	local key
	for key in BASE_DOMAIN DATABASE_URL ADMIN_EMAILS; do
		[ -n "$(cfg "$key")" ] || fail "$key is required"
	done

	local d
	for d in "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_DOMAIN" "$DOCS_DOMAIN" "$BASE_DOMAIN"; do
		[ -n "$d" ] || continue
		if [[ ! "$d" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then
			fail "'$d' is not a valid lowercase domain name"
		elif [[ "$d" =~ (^|\.)example\.(com|org)$ ]]; then
			fail "'$d' is still the example placeholder"
		elif [ "$d" != "$BASE_DOMAIN" ] && [[ "$d" != *".$BASE_DOMAIN" ]]; then
			fail "'$d' is not under BASE_DOMAIN ($BASE_DOMAIN) — cookies are shared across subdomains of it"
		fi
	done

	if is_true "$ENABLE_TLS"; then
		if [[ ! "$LETSENCRYPT_EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || [[ "$LETSENCRYPT_EMAIL" == *"@example."* ]]; then
			fail "certificate email '$LETSENCRYPT_EMAIL' is not valid — set ADMIN_EMAILS (or LETSENCRYPT_EMAIL)"
		else
			ok "HTTPS: automatic Let's Encrypt certificate for $APP_DOMAIN, $API_DOMAIN, $ADMIN_DOMAIN, $DOCS_DOMAIN"
		fi
	fi

	local admins
	admins="$(cfg ADMIN_EMAILS)"
	if [[ "$admins" == *"@example."* ]]; then
		fail "ADMIN_EMAILS still contains an example address"
	fi

	check_database_url

	local secret
	for secret in AUTH_SECRET GATEWAY_API_KEY_HASH_SECRET REDIS_PASSWORD; do
		local v
		v="$(cfg "$secret")"
		if [ -z "$v" ] || [ "$v" = __GENERATE__ ]; then
			info "$secret is empty — it will be generated"
		elif [ "${#v}" -lt 16 ]; then
			fail "$secret is too short (${#v} chars, need 16+)"
		fi
	done
	local rp
	rp="$(cfg REDIS_PASSWORD)"
	if [[ "$rp" =~ [[:space:]\"\'\\] ]]; then
		fail "REDIS_PASSWORD must not contain spaces, quotes or backslashes"
	fi

	if [ -z "$(cfg LLM_OPENROUTER_API_KEY)$(cfg LLM_CLOUDFLARE_API_KEY)$(cfg LLM_AWS_BEDROCK_API_KEY)$(cfg LLM_OPENAI_API_KEY)$(cfg LLM_ANTHROPIC_API_KEY)" ]; then
		warn "no LLM provider key set — the gateway will have nothing to route to"
	fi

	if grep -qE "^[A-Za-z_][A-Za-z0-9_]*=[^'\"].*\\$" "$ENV_FILE"; then
		warn "an unquoted value contains '\$' — wrap it in single quotes so Docker does not expand it"
	fi
	if [ "$ERRORS" -eq 0 ]; then ok "configuration values look valid"; fi
}

check_database_url() {
	local url
	url="$(cfg DATABASE_URL)"
	[ -n "$url" ] || return 0
	if [[ "${url#*://}" == *@*@* ]]; then
		fail "DATABASE_URL has more than one '@' — URL-encode '@' in the password as %40"
		return 0
	fi
	if [[ ! "$url" =~ ^postgres(ql)?://([^:/@]+)(:([^@]*))?@([^:/?@]+)(:([0-9]+))?/([^?]+)(\?.*)?$ ]]; then
		fail "DATABASE_URL must look like postgres://USER:PASSWORD@HOST:5432/DBNAME?sslmode=verify-full"
		return 0
	fi
	DB_HOST="${BASH_REMATCH[5]}"
	DB_NAME="${BASH_REMATCH[8]}"
	local password="${BASH_REMATCH[4]}" query="${BASH_REMATCH[9]}"
	if [[ "$url" == *CHANGE_ME* ]] || [[ "$DB_HOST" == *xxxxxxxx* ]]; then
		fail "DATABASE_URL is still the example placeholder"
	fi
	if [[ "$password" =~ [@/#?] ]]; then
		fail "DATABASE_URL password has unencoded special characters — URL-encode them (@ -> %40, / -> %2F)"
	fi
	if [[ "$DB_HOST" =~ (localhost|127\.0\.0\.1) ]] && [ "$MODE" = production ]; then
		fail "DATABASE_URL points at localhost, which is the app container itself in production — use the RDS endpoint"
	fi
	if [[ "$DB_HOST" == *.rds.amazonaws.com ]] && [[ "$query" != *sslmode=* ]]; then
		warn "RDS DATABASE_URL has no sslmode — add ?sslmode=verify-full"
	fi
}

check_dns() {
	step "Checking DNS"
	local d resolved missing=()
	PUBLIC_IP="$(curl -fsS --max-time 5 https://checkip.amazonaws.com 2>/dev/null | tr -d '[:space:]' || true)"
	[ -n "$PUBLIC_IP" ] && info "public IP of this server: $PUBLIC_IP"
	DNS_READY=1
	for d in "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_DOMAIN" "$DOCS_DOMAIN"; do
		resolved="$(getent ahostsv4 "$d" 2>/dev/null | awk 'NR==1 {print $1}' || true)"
		if [ -n "$resolved" ] && { [ -z "$PUBLIC_IP" ] || [ "$resolved" = "$PUBLIC_IP" ]; }; then
			ok "$d -> $resolved"
		else
			DNS_READY=0
			missing+=("$d")
			if [ -z "$resolved" ]; then
				warn "$d does not resolve yet"
			else
				warn "$d resolves to $resolved, not this server"
			fi
		fi
	done
	if [ "$DNS_READY" -eq 0 ]; then
		info "Create these DNS records (HTTPS is issued automatically once they resolve):"
		for d in "${missing[@]}"; do info "  A  $d  ->  ${PUBLIC_IP:-<server public IP>}"; done
		info "  (or one wildcard record: A  *.$BASE_DOMAIN  ->  ${PUBLIC_IP:-<server public IP>})"
	fi
}

pg_client() { # run psql against DATABASE_URL (or $2 override) via Docker
	local url="${PG_URL_OVERRIDE:-$(cfg DATABASE_URL)}"
	docker run --rm -i --network host \
		-e PGSSLROOTCERT=/certs/rds.pem -e PGCONNECT_TIMEOUT=10 \
		-v "$CONFIG_DIR/rds-global-bundle.pem:/certs/rds.pem:ro" \
		"$PG_CLIENT_IMAGE" psql "$url" -v ON_ERROR_STOP=1 -tA "$@"
}

check_database() {
	step "Checking database connectivity"
	if ! docker info >/dev/null 2>&1; then
		info "skipped — Docker is not installed yet (run 'install' to check it)"
		return 0
	fi
	ensure_rds_bundle
	docker image inspect "$PG_CLIENT_IMAGE" >/dev/null 2>&1 || docker pull -q "$PG_CLIENT_IMAGE" >/dev/null

	local out
	if out="$(pg_client -c 'select version()' 2>&1)"; then
		ok "connected: $(head -c 80 <<<"$out")"
	elif [[ "$out" == *"does not exist"* ]] && [[ "$out" == *database* ]]; then
		if [ "${1:-}" = create ]; then
			create_database
		else
			warn "database '$DB_NAME' does not exist yet — 'install' will create it"
		fi
	else
		fail "cannot connect to DATABASE_URL: $(tail -n 2 <<<"$out" | tr '\n' ' ')"
		info "check the RDS security group allows this server's IP on port 5432, the credentials and sslmode"
		return 0
	fi

	local major
	major="$(pg_client -c 'show server_version_num' 2>/dev/null | head -c 2 || true)"
	if [[ "$major" =~ ^[0-9]+$ ]] && [ "$major" -lt 14 ]; then
		fail "PostgreSQL $major is too old — use 14 or newer"
	fi
}

create_database() {
	local admin_url
	admin_url="$(sed -E "s#^(postgres(ql)?://[^/]+)/[^?]+#\1/postgres#" <<<"$(cfg DATABASE_URL)")"
	info "creating database '$DB_NAME'"
	PG_URL_OVERRIDE="$admin_url" pg_client -c "create database \"$DB_NAME\"" >/dev/null ||
		die "could not create database '$DB_NAME' — create it in RDS or grant CREATEDB"
	ok "database '$DB_NAME' created"
}

check_ports() { # check_ports [fix] — fix stops other web servers holding 80/443
	local port holder
	for port in 80 443; do
		holder="$(ss -Hltnp "sport = :$port" 2>/dev/null | grep -oE 'users:\(\("[^"]+' | head -1 | cut -d'"' -f2 || true)"
		[ -z "$holder" ] || [ "$holder" = nginx ] && continue
		if [ "${1:-}" = fix ] && [[ "$holder" =~ ^(apache2|httpd|caddy|lighttpd)$ ]] && has_systemd; then
			warn "port $port was held by $holder — stopping and disabling it so nginx can serve the domains"
			systemctl disable --now "$holder" >>"$LOG_FILE" 2>&1 || fail "could not stop $holder"
		elif [[ "$holder" =~ ^(apache2|httpd|caddy|lighttpd)$ ]]; then
			warn "port $port is held by $holder — install will stop and disable it"
		else
			fail "port $port is used by '$holder' — stop it so nginx can serve the domains"
		fi
	done
}

run_checks() {
	ERRORS=0
	WARNINGS=0
	check_host
	check_env
	check_ports
	check_dns
	check_database
	echo
	if [ "$ERRORS" -gt 0 ]; then
		die "$ERRORS problem(s) found — fix them in $ENV_FILE and re-run"
	fi
	ok "checks passed ($WARNINGS warning(s))"
}

# --------------------------------------------------------------------------
# System packages
# --------------------------------------------------------------------------
apt_install() {
	DEBIAN_FRONTEND=noninteractive apt-get install -y -q --no-install-recommends "$@" >>"$LOG_FILE" 2>&1
}

install_base_packages() {
	step "Installing system packages"
	DEBIAN_FRONTEND=noninteractive apt-get update -q >>"$LOG_FILE" 2>&1
	apt_install ca-certificates curl gnupg openssl git jq iproute2 \
		nginx certbot python3-certbot-nginx ufw
	ok "base packages, nginx and certbot"
}

install_docker() {
	step "Installing Docker"
	if docker info >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && docker buildx version >/dev/null 2>&1; then
		ok "Docker already installed ($(docker --version | cut -d, -f1))"
		return 0
	fi
	# shellcheck disable=SC1091
	. /etc/os-release
	local arch keyring=/etc/apt/keyrings/docker.asc
	arch="$(dpkg --print-architecture)"
	install -m 0755 -d /etc/apt/keyrings
	if curl -fsSL --max-time 20 "https://download.docker.com/linux/ubuntu/dists/${VERSION_CODENAME}/Release" >/dev/null 2>&1; then
		curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$keyring"
		chmod a+r "$keyring"
		echo "deb [arch=$arch signed-by=$keyring] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
			>/etc/apt/sources.list.d/docker.list
		apt-get update -q >>"$LOG_FILE" 2>&1
		apt_install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
	else
		warn "Docker's repository has no '${VERSION_CODENAME}' release — using Ubuntu's docker.io"
		apt_install docker.io docker-compose-v2 docker-buildx
	fi
	if has_systemd; then
		systemctl enable --now docker >>"$LOG_FILE" 2>&1
	fi
	docker info >/dev/null 2>&1 || die "Docker is installed but the daemon is not running"
	ok "$(docker --version | cut -d, -f1), $(docker compose version --short 2>/dev/null | sed 's/^/compose /')"
}

tune_system() {
	step "Tuning the system"
	cat >/etc/sysctl.d/90-vichar.conf <<-'EOF'
		# Redis: allow background saves to fork without failing under memory pressure.
		vm.overcommit_memory = 1
		net.core.somaxconn = 1024
	EOF
	sysctl -q -p /etc/sysctl.d/90-vichar.conf >/dev/null 2>&1 || warn "could not apply sysctl settings (container?)"

	local mem_mb swap_mb
	mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
	swap_mb=$(awk '/SwapTotal/ {print int($2/1024)}' /proc/meminfo)
	if [ "$mem_mb" -lt 6000 ] && [ "$swap_mb" -lt 1024 ] && [ ! -f /swapfile ]; then
		if fallocate -l 4G /swapfile 2>/dev/null && chmod 600 /swapfile && mkswap /swapfile >/dev/null 2>&1 && swapon /swapfile 2>/dev/null; then
			grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
			ok "added a 4GB swap file (builds need more than ${mem_mb}MB RAM)"
		else
			rm -f /swapfile
			warn "could not add swap — builds may run out of memory on ${mem_mb}MB RAM"
		fi
	else
		ok "memory/swap sufficient"
	fi
}

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
generate_secrets() {
	step "Preparing secrets"
	local key value
	for key in AUTH_SECRET GATEWAY_API_KEY_HASH_SECRET; do
		value="$(cfg "$key")"
		if [ -z "$value" ] || [ "$value" = __GENERATE__ ]; then
			set_env_value "$key" "$(openssl rand -base64 32 | tr -d '\n')"
			ok "generated $key (saved to .env)"
		fi
	done
	value="$(cfg REDIS_PASSWORD)"
	if [ -z "$value" ] || [ "$value" = __GENERATE__ ]; then
		set_env_value REDIS_PASSWORD "$(openssl rand -hex 32)"
		ok "generated REDIS_PASSWORD (saved to .env)"
	fi
	chmod 600 "$ENV_FILE"
	if [ -n "${SUDO_USER:-}" ]; then chown "$SUDO_USER" "$ENV_FILE"; fi
	ok ".env secured (mode 600)"
}

ensure_rds_bundle() {
	install -d -m 0755 "$CONFIG_DIR"
	if [ ! -s "$CONFIG_DIR/rds-global-bundle.pem" ]; then
		curl -fsSL --max-time 30 "$RDS_BUNDLE_URL" -o "$CONFIG_DIR/rds-global-bundle.pem.tmp" ||
			die "could not download the AWS RDS CA bundle from $RDS_BUNDLE_URL"
		mv "$CONFIG_DIR/rds-global-bundle.pem.tmp" "$CONFIG_DIR/rds-global-bundle.pem"
		chmod 644 "$CONFIG_DIR/rds-global-bundle.pem"
	fi
}

write_redis_config() {
	install -d -m 0755 "$CONFIG_DIR"
	umask 077
	cat >"$CONFIG_DIR/redis.conf" <<-EOF
		# Generated by install.sh from .env — re-run install to change.
		bind 0.0.0.0
		protected-mode yes
		port 6379
		requirepass $(cfg REDIS_PASSWORD)
		dir /data
		appendonly yes
		appendfsync everysec
		save 3600 1 300 100 60 10000
		maxmemory $(cfg REDIS_MAXMEMORY 1gb)
		maxmemory-policy noeviction
	EOF
	umask 022
	# The redis image drops to uid 999 before reading the config.
	chown 999:999 "$CONFIG_DIR/redis.conf"
	chmod 600 "$CONFIG_DIR/redis.conf"
	ok "Redis config with password ($CONFIG_DIR/redis.conf)"
}

write_runtime_env() {
	# Derived values the client did not set explicitly. Loaded after .env, so
	# only keys missing from .env are written here.
	local app="$SCHEME://$APP_DOMAIN" api="$SCHEME://$API_DOMAIN"
	local admin="$SCHEME://$ADMIN_DOMAIN" docs="$SCHEME://$DOCS_DOMAIN"
	local -A derived=(
		[UI_URL]="$app" [APP_URL]="$app" [API_URL]="$api" [GATEWAY_URL]="$api"
		[DOCS_URL]="$docs" [ADMIN_URL]="$admin"
		[ORIGIN_URLS]="$app,$admin,$docs"
		[GATEWAY_CORS_ORIGINS]="$app"
		[COOKIE_DOMAIN]=".$BASE_DOMAIN"
		[PASSKEY_RP_ID]="$BASE_DOMAIN"
		[API_BACKEND_URL]="http://localhost:4002"
		[RUN_MIGRATIONS]="true"
		[APP_VERSION]="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo local)"
	)
	if [ "$MODE" = development ]; then
		derived[NODE_ENV]=development
		derived[API_BACKEND_URL]="http://localhost:$API_PORT"
		derived[REDIS_HOST]=localhost
		derived[REDIS_PORT]="$REDIS_HOST_PORT"
		derived[NODE_EXTRA_CA_CERTS]="$CONFIG_DIR/rds-global-bundle.pem"
		local key
		for key in UI_PORT DOCS_PORT GATEWAY_PORT API_PORT ADMIN_PORT METRICS_PORT; do
			derived[$key]="${!key}"
		done
	fi
	{
		echo "# Generated by install.sh — derived from .env; do not edit."
		local key
		for key in $(printf '%s\n' "${!derived[@]}" | sort); do
			[ -n "$(cfg "$key")" ] && continue
			printf '%s=%s\n' "$key" "${derived[$key]}"
		done
	} >"$RUNTIME_ENV_FILE"
	chmod 600 "$RUNTIME_ENV_FILE"
	if [ -n "${SUDO_USER:-}" ]; then chown "$SUDO_USER" "$RUNTIME_ENV_FILE"; fi
	ok "derived settings written to .env.runtime ($SCHEME:// URLs)"
}

# --------------------------------------------------------------------------
# Stack
# --------------------------------------------------------------------------
compose() {
	local files=(-f "$COMPOSE_DIR/docker-compose.yml")
	[ "$MODE" = development ] && files+=(-f "$COMPOSE_DIR/docker-compose.dev.yml")
	STACK_NAME="$STACK_NAME" VICHAR_CONFIG_DIR="$CONFIG_DIR" \
		VICHAR_ENV_FILE="$ENV_FILE" VICHAR_RUNTIME_ENV_FILE="$RUNTIME_ENV_FILE" \
		HOST_UI_PORT="$UI_PORT" HOST_DOCS_PORT="$DOCS_PORT" HOST_GATEWAY_PORT="$GATEWAY_PORT" \
		HOST_API_PORT="$API_PORT" HOST_ADMIN_PORT="$ADMIN_PORT" REDIS_HOST_PORT="$REDIS_HOST_PORT" \
		APP_VERSION="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo local)" \
		docker compose --project-directory "$COMPOSE_DIR" "${files[@]}" "$@"
}

wait_http() { # wait_http URL expected-regex timeout-seconds [Host header]
	local url="$1" want="$2" t="$3" host="${4:-}" code
	local args=(-s -o /dev/null -w '%{http_code}' --max-time 5)
	[ -n "$host" ] && args+=(-H "Host: $host")
	while [ "$t" -gt 0 ]; do
		code="$(curl "${args[@]}" "$url" 2>/dev/null || true)"
		[[ "$code" =~ $want ]] && return 0
		sleep 3
		t=$((t - 3))
	done
	return 1
}

start_production() {
	step "Building images (first build takes 15-30 minutes)"
	info "build output: $LOG_FILE"
	compose build --pull app admin >>"$LOG_FILE" 2>&1 || die "image build failed — see $LOG_FILE"
	ok "images built"

	step "Starting containers"
	compose up -d --remove-orphans >>"$LOG_FILE" 2>&1 || die "could not start containers — see $LOG_FILE"
	ok "redis, app (ui, docs, api, gateway, worker) and admin started"
	if has_systemd; then
		systemctl enable docker >/dev/null 2>&1 || true
	fi
}

install_node() {
	local want pnpm_version arch current=""
	want="$(awk '$1=="nodejs" {print $2}' "$REPO_DIR/.tool-versions")"
	pnpm_version="$(jq -r '.packageManager' "$REPO_DIR/package.json" | sed 's/^pnpm@//')"
	command -v node >/dev/null 2>&1 && current="$(node -v | sed 's/^v//')"
	if [ "$current" != "$want" ]; then
		arch="$(uname -m)"
		[ "$arch" = x86_64 ] && arch=x64
		[ "$arch" = aarch64 ] && arch=arm64
		info "installing Node.js $want"
		curl -fsSL "https://nodejs.org/dist/v$want/node-v$want-linux-$arch.tar.xz" -o /tmp/node.tar.xz
		tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE
		rm -f /tmp/node.tar.xz
	fi
	if [ "$(pnpm -v 2>/dev/null || true)" != "$pnpm_version" ]; then
		npm install -g --silent "pnpm@$pnpm_version" >>"$LOG_FILE" 2>&1
	fi
	ok "Node.js $(node -v), pnpm $(pnpm -v)"
}

as_dev_user() {
	if [ "$DEV_USER" = root ]; then
		bash -c "$1"
	else
		sudo -u "$DEV_USER" -H bash -c "$1"
	fi
}

start_development() {
	step "Installing the development toolchain"
	install_node
	id "$DEV_USER" >/dev/null 2>&1 || die "DEV_USER '$DEV_USER' does not exist"
	[ "$DEV_USER" = root ] || chown -R "$DEV_USER" "$REPO_DIR"

	step "Starting Redis"
	compose up -d redis >>"$LOG_FILE" 2>&1 || die "could not start Redis — see $LOG_FILE"
	ok "Redis on 127.0.0.1:$REDIS_HOST_PORT"

	step "Installing dependencies and building packages"
	as_dev_user "cd '$REPO_DIR' && pnpm install --frozen-lockfile" >>"$LOG_FILE" 2>&1 ||
		die "pnpm install failed — see $LOG_FILE"
	as_dev_user "cd '$REPO_DIR' && pnpm exec turbo run build --filter='./packages/*'" >>"$LOG_FILE" 2>&1 ||
		die "package build failed — see $LOG_FILE"
	ok "dependencies installed"

	step "Applying database migrations"
	as_dev_user "cd '$REPO_DIR' && set -a && . '$RUNTIME_ENV_FILE' && export DATABASE_URL='$(cfg DATABASE_URL)' && pnpm migrate" >>"$LOG_FILE" 2>&1 ||
		die "migrations failed — see $LOG_FILE"
	ok "migrations applied"

	step "Installing the $DEV_SERVICE service (pnpm dev with hot reload)"
	cat >"/etc/systemd/system/$DEV_SERVICE.service" <<-EOF
		[Unit]
		Description=Vichar development servers (pnpm dev)
		After=network-online.target docker.service
		Wants=network-online.target

		[Service]
		Type=simple
		User=$DEV_USER
		WorkingDirectory=$REPO_DIR
		EnvironmentFile=$ENV_FILE
		EnvironmentFile=$RUNTIME_ENV_FILE
		Environment=PATH=/usr/local/bin:/usr/bin:/bin
		ExecStart=/usr/local/bin/pnpm exec turbo run dev --filter=!web
		Restart=on-failure
		RestartSec=5

		[Install]
		WantedBy=multi-user.target
	EOF
	if has_systemd; then
		systemctl daemon-reload
		systemctl enable "$DEV_SERVICE" >/dev/null 2>&1
		systemctl restart "$DEV_SERVICE"
		ok "$DEV_SERVICE started (logs: journalctl -u $DEV_SERVICE -f)"
	else
		warn "systemd not available — start manually: cd $REPO_DIR && pnpm exec turbo run dev --filter=!web"
	fi
}

configure_nginx() {
	step "Configuring nginx"
	install -d /etc/nginx/snippets
	install -m 0644 "$REPO_DIR/infra/nginx-snippets/vichar-security-headers.conf" /etc/nginx/snippets/
	install -m 0644 "$COMPOSE_DIR/vichar-proxy.conf" /etc/nginx/snippets/
	sed -e "s/__APP_DOMAIN__/$APP_DOMAIN/g" -e "s/__API_DOMAIN__/$API_DOMAIN/g" \
		-e "s/__ADMIN_DOMAIN__/$ADMIN_DOMAIN/g" -e "s/__DOCS_DOMAIN__/$DOCS_DOMAIN/g" \
		-e "s/__UI_PORT__/$UI_PORT/g" -e "s/__DOCS_PORT__/$DOCS_PORT/g" \
		-e "s/__GATEWAY_PORT__/$GATEWAY_PORT/g" -e "s/__API_PORT__/$API_PORT/g" \
		-e "s/__ADMIN_PORT__/$ADMIN_PORT/g" \
		"$COMPOSE_DIR/nginx.conf.tmpl" >"$NGINX_SITE.new"
	# Keep certbot's TLS edits: only replace the site when the template output
	# changed, then let certbot re-apply certificates below.
	if [ -f "$NGINX_SITE" ] && [ -f "$NGINX_SITE.template" ] && cmp -s "$NGINX_SITE.new" "$NGINX_SITE.template"; then
		rm -f "$NGINX_SITE.new"
		info "nginx site unchanged"
	else
		cp "$NGINX_SITE.new" "$NGINX_SITE.template"
		mv "$NGINX_SITE.new" "$NGINX_SITE"
	fi
	ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/vichar.conf
	rm -f /etc/nginx/sites-enabled/default
	nginx -t >>"$LOG_FILE" 2>&1 || die "nginx config test failed — see $LOG_FILE"
	reload_nginx
	ok "nginx serves $APP_DOMAIN, $API_DOMAIN, $ADMIN_DOMAIN, $DOCS_DOMAIN"
}

reload_nginx() {
	if has_systemd; then
		systemctl enable nginx >/dev/null 2>&1 || true
		systemctl reload-or-restart nginx
	elif pgrep -x nginx >/dev/null 2>&1; then
		nginx -s reload
	else
		nginx
	fi
}

obtain_certificate() {
	local args=() d
	for d in "$APP_DOMAIN" "$API_DOMAIN" "$ADMIN_DOMAIN" "$DOCS_DOMAIN"; do args+=(-d "$d"); done
	certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring --expand \
		--cert-name "$CERT_NAME" --email "$LETSENCRYPT_EMAIL" "${args[@]}" >>"$LOG_FILE" 2>&1
}

setup_tls() {
	if ! is_true "$ENABLE_TLS"; then
		SCHEME=http
		info "HTTPS disabled (ENABLE_TLS=false)"
		return 0
	fi
	step "Setting up HTTPS (Let's Encrypt)"
	if [ "${DNS_READY:-1}" -eq 0 ] && ! cert_present; then
		info "DNS does not point here yet — skipping the request for now"
	elif obtain_certificate; then
		SCHEME=https
		disable_tls_retry
		ok "certificate for all four domains installed; renewal is automatic"
		return 0
	else
		warn "certificate request failed — details in $LOG_FILE"
	fi
	SCHEME=http
	schedule_tls_retry
}

schedule_tls_retry() {
	if ! has_systemd; then
		info "re-run 'sudo ./install.sh tls' once DNS resolves to enable HTTPS"
		return 0
	fi
	cat >"/etc/systemd/system/$TLS_UNIT.service" <<-EOF
		[Unit]
		Description=Vichar: obtain the HTTPS certificate once DNS resolves
		After=network-online.target nginx.service

		[Service]
		Type=oneshot
		Environment=VICHAR_ENV_FILE=$ENV_FILE VICHAR_CONFIG_DIR=$CONFIG_DIR
		ExecStart=$REPO_DIR/install.sh tls
	EOF
	cat >"/etc/systemd/system/$TLS_UNIT.timer" <<-EOF
		[Unit]
		Description=Retry Vichar HTTPS setup every 10 minutes until it succeeds

		[Timer]
		OnBootSec=2min
		OnUnitActiveSec=10min

		[Install]
		WantedBy=timers.target
	EOF
	systemctl daemon-reload
	systemctl enable --now "$TLS_UNIT.timer" >/dev/null 2>&1
	info "serving HTTP for now; HTTPS is retried every 10 minutes and switches on automatically"
}

disable_tls_retry() {
	if has_systemd && [ -f "/etc/systemd/system/$TLS_UNIT.timer" ]; then
		systemctl disable --now "$TLS_UNIT.timer" >/dev/null 2>&1 || true
		rm -f "/etc/systemd/system/$TLS_UNIT.timer" "/etc/systemd/system/$TLS_UNIT.service"
		systemctl daemon-reload
	fi
}

apply_runtime_env() { # restart the apps so they pick up .env.runtime
	if [ "$MODE" = production ]; then
		compose up -d --force-recreate app admin >>"$LOG_FILE" 2>&1
	elif has_systemd; then
		systemctl restart "$DEV_SERVICE"
	fi
}

configure_firewall() {
	is_true "$CONFIGURE_FIREWALL" || return 0
	step "Configuring the firewall (ufw)"
	if ufw allow OpenSSH >>"$LOG_FILE" 2>&1 && ufw allow 'Nginx Full' >>"$LOG_FILE" 2>&1 &&
		ufw --force enable >>"$LOG_FILE" 2>&1; then
		ok "only SSH, HTTP and HTTPS are open"
	else
		warn "could not configure ufw — open only ports 22, 80 and 443 in your cloud firewall"
	fi
}

redis_ping() {
	docker exec "$STACK_NAME-redis" sh -c 'redis-cli --no-auth-warning -a "$(sed -n "s/^requirepass //p" /usr/local/etc/redis/redis.conf)" ping' 2>/dev/null | grep -q PONG
}

health_check() { # health_check [first-timeout-seconds]
	step "Health checks"
	local failed=0 timeout="${1:-600}"
	[ $# -eq 0 ] && [ "$MODE" = development ] && timeout=900
	if redis_ping; then ok "redis answers with the password"; else
		fail "redis is not answering"
		failed=1
	fi
	local name url want
	while read -r name url want; do
		if wait_http "$url" "$want" "$timeout"; then ok "$name ($url)"; else
			fail "$name not healthy at $url"
			failed=1
		fi
		if [ "$timeout" -gt 60 ]; then timeout=60; fi
	done <<-EOF
		api http://127.0.0.1:$API_PORT/ ^200$
		gateway http://127.0.0.1:$GATEWAY_PORT/ ^200$
		ui http://127.0.0.1:$UI_PORT/ ^(200|30[0-9])$
		admin http://127.0.0.1:$ADMIN_PORT/login ^200$
		docs http://127.0.0.1:$DOCS_PORT/ ^(200|30[0-9])$
	EOF
	if wait_http "http://127.0.0.1/" '^(200|30[0-9])$' "$timeout" "$API_DOMAIN"; then
		ok "nginx routes $API_DOMAIN"
	else
		fail "nginx does not route $API_DOMAIN"
		failed=1
	fi
	if [ "$failed" -ne 0 ]; then
		if [ "$MODE" = production ]; then
			info "inspect with: sudo ./install.sh logs app"
		else
			info "inspect with: journalctl -u $DEV_SERVICE -n 200"
		fi
		return 1
	fi
}

# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------
cmd_install() {
	install -d -m 0755 "$(dirname "$LOG_FILE")"
	echo "=== install $(date -u +%FT%TZ) mode=$MODE ===" >>"$LOG_FILE"
	check_host
	check_env
	[ "$ERRORS" -eq 0 ] || die "$ERRORS problem(s) found in .env or on the server — fix them and re-run"

	install_base_packages
	check_ports fix
	[ "$ERRORS" -eq 0 ] || die "ports 80/443 are not available"
	install_docker
	tune_system
	check_dns
	generate_secrets
	ensure_rds_bundle
	allocate_ports
	write_redis_config
	check_database create
	[ "$ERRORS" -eq 0 ] || die "database check failed — fix DATABASE_URL or network access and re-run"

	configure_nginx
	configure_firewall
	setup_tls
	write_runtime_env
	if [ "$MODE" = production ]; then
		start_production
	else
		start_development
	fi
	health_check || die "installation finished but some services are unhealthy"
	summary
}

cmd_tls() { # also run by the vichar-tls timer until it succeeds
	echo "=== tls $(date -u +%FT%TZ) ===" >>"$LOG_FILE"
	is_true "$ENABLE_TLS" || die "ENABLE_TLS is false"
	local had_cert=0
	cert_present && had_cert=1
	check_dns
	if [ "$had_cert" -eq 0 ] && [ "$DNS_READY" -eq 0 ]; then
		die "DNS does not point here yet — will retry"
	fi
	obtain_certificate || die "certificate request failed — see $LOG_FILE"
	SCHEME=https
	disable_tls_retry
	write_runtime_env
	apply_runtime_env
	reload_nginx
	ok "HTTPS enabled: $SCHEME://$APP_DOMAIN"
}


summary() {
	cat <<-EOF

		${C_GRN}Vichar is running in $MODE mode.${C_RST}

		  Dashboard   $SCHEME://$APP_DOMAIN
		  API         $SCHEME://$API_DOMAIN
		  Admin       $SCHEME://$ADMIN_DOMAIN
		  Docs        $SCHEME://$DOCS_DOMAIN

		Next steps:
		  1. Sign up at $SCHEME://$APP_DOMAIN with an ADMIN_EMAILS address.
		  2. sudo ./install.sh verify-admin <that email>
		  3. Log in at $SCHEME://$ADMIN_DOMAIN.

		$([ "$SCHEME" = http ] && is_true "$ENABLE_TLS" && echo "HTTPS is pending DNS — it switches on automatically once the records resolve.")
		Back up $ENV_FILE — it holds the generated secrets.
		Manage: sudo ./install.sh status | logs | restart | update
	EOF
}

cmd_update() {
	step "Updating the checkout"
	if git -C "$REPO_DIR" rev-parse --git-dir >/dev/null 2>&1; then
		if [ -n "$(git -C "$REPO_DIR" status --porcelain --untracked-files=no)" ]; then
			die "the checkout has local changes — commit or discard them first"
		fi
		if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != root ]; then
			sudo -u "$SUDO_USER" git -C "$REPO_DIR" pull --ff-only
		else
			git -C "$REPO_DIR" pull --ff-only
		fi
	else
		info "not a git checkout — rebuilding the current files"
	fi
	cmd_install
}

cmd_status() {
	if [ "$MODE" = production ]; then
		compose ps
	else
		compose ps redis
		has_systemd && systemctl --no-pager status "$DEV_SERVICE" | head -n 12
	fi
	ERRORS=0
	health_check 5 || true
}

cmd_logs() {
	if [ "$MODE" = production ]; then
		compose logs -f --tail=200 "$@"
	else
		journalctl -u "$DEV_SERVICE" -f -n 200
	fi
}

cmd_restart() {
	if [ "$MODE" = production ]; then
		compose up -d
		compose restart
	else
		compose up -d redis
		systemctl restart "$DEV_SERVICE"
	fi
	reload_nginx
	ok "restarted"
}

cmd_stop() {
	if [ "$MODE" = development ] && has_systemd; then
		systemctl stop "$DEV_SERVICE"
	fi
	compose stop
	ok "stopped (data is kept; start again with: sudo ./install.sh restart)"
}

cmd_verify_admin() {
	local email="${1:-}"
	[ -n "$email" ] || die "usage: sudo ./install.sh verify-admin <email>"
	email="${email,,}"
	if [[ ! ",$(cfg ADMIN_EMAILS | tr -d ' ' | tr '[:upper:]' '[:lower:]')," == *",$email,"* ]]; then
		die "$email is not listed in ADMIN_EMAILS"
	fi
	check_database_url
	ensure_rds_bundle
	local out
	out="$(pg_client -c "update \"user\" set email_verified = true where lower(email) = '${email//\'/\'\'}' returning id" 2>&1)" ||
		die "database update failed: $out"
	if [ -z "$(tr -d '[:space:]' <<<"$out")" ]; then
		die "no account with $email — sign up at the dashboard first"
	fi
	ok "$email verified — log in at $SCHEME://$ADMIN_DOMAIN"
}

main() {
	local cmd="${1:-install}"
	[ $# -gt 0 ] && shift
	case "$cmd" in
	help | -h | --help)
		usage
		return 0
		;;
	esac
	[ "$(id -u)" -eq 0 ] || die "run as root: sudo ./install.sh $cmd $*"
	load_config
	case "$cmd" in
	install) cmd_install ;;
	tls) cmd_tls ;;
	check) run_checks ;;
	update) cmd_update ;;
	status) cmd_status ;;
	logs) cmd_logs "$@" ;;
	restart) cmd_restart ;;
	stop) cmd_stop ;;
	verify-admin) cmd_verify_admin "$@" ;;
	*)
		usage
		die "unknown command '$cmd'"
		;;
	esac
}

main "$@"
