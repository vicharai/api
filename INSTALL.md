# Installing Vichar on a server

`install.sh` sets up the whole stack on **Ubuntu 26.04 LTS**. PostgreSQL is external (for example AWS RDS). Everything else is installed on the server: Docker, Redis (password-protected), nginx and Let's Encrypt, plus Node.js in development mode.

## Before you start

- A server with at least 4 GB RAM (8 GB recommended), 20 GB free disk, `x86_64` or `arm64`.
- A PostgreSQL 14+ database (e.g. AWS RDS) whose security group allows this server on port 5432.
- DNS for your domain. Point `app.`, `api.`, `admin.` and `docs.<your domain>` at the server, or add a single `*.<your domain>` wildcard record.

## Install

```bash
git clone https://github.com/vicharai/api.git vichar && cd vichar
cp .env.install.example .env && chmod 600 .env
nano .env                 # BASE_DOMAIN, DATABASE_URL, ADMIN_EMAILS, a provider key
sudo ./install.sh check   # optional: validate before installing
sudo ./install.sh         # install
```

Then sign up on the dashboard with an `ADMIN_EMAILS` address and run:

```bash
sudo ./install.sh verify-admin you@yourdomain.com
```

## What is automatic

- **Subdomains:** `app.`, `api.`, `admin.` and `docs.` are derived from `BASE_DOMAIN`. So are every URL, the CORS origins, the cookie domain and the passkey RP ID.
- **HTTPS:** one Let's Encrypt certificate covers all four subdomains, with HTTP→HTTPS redirects and automatic renewal.
  - If DNS isn't pointing at the server yet, the site starts on HTTP. A `vichar-tls` timer retries every 10 minutes and switches everything to HTTPS once the records resolve.
  - The installer prints the exact DNS records it needs.
- **Ports:** the defaults are used when free, otherwise the next free port. The choice is kept in `/etc/vichar/ports.env`. All app ports are loopback-only behind nginx.
- **Secrets:** `AUTH_SECRET`, `GATEWAY_API_KEY_HASH_SECRET` and `REDIS_PASSWORD` are generated when empty and written back to `.env`.
- **Database:** created if it doesn't exist. Migrations run automatically. The AWS RDS CA bundle is installed and trusted, so `sslmode=verify-full` works.
- **Web servers:** Apache or Caddy holding port 80/443 is stopped and disabled.

## Modes (`DEPLOY_MODE` in `.env`)

|            | production                                           | development                                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Apps       | Docker images built from this checkout, auto-restart | native `pnpm dev` with hot reload (systemd unit `vichar-dev`) |
| Redis      | Docker, password from `.env`, internal network only  | Docker, password from `.env`, loopback port                   |
| nginx      | all four subdomains, automatic HTTPS                 | all four subdomains, automatic HTTPS                          |
| Firewall   | ufw: SSH, 80, 443 (default on)                       | off by default                                                |
| Migrations | applied by the api on start                          | `pnpm migrate` during install/update                          |

## Managing the server

```bash
sudo ./install.sh status          # services and health
sudo ./install.sh logs [app]      # follow logs
sudo ./install.sh restart | stop
sudo ./install.sh update          # git pull + rebuild + restart
sudo ./install.sh tls             # request HTTPS now instead of waiting for the retry
```

Re-running `install` is safe. Run it again after editing `.env`. Back up `.env`: changing `GATEWAY_API_KEY_HASH_SECRET` invalidates every API key. The install log is at `/var/log/vichar-install.log`.

## Settings

Most business settings (rate limits, top-up limits and fees, company and email details, retention, content filtering and more) live in the admin panel under **Settings** and apply without a restart. Matching `.env` values are only a fallback for keys never set there. Secrets (database URL, `AUTH_SECRET`, provider and payment API keys) stay in `.env`.
