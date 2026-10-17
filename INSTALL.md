# Installing Vichar on a server

`install.sh` sets up the whole stack on **Ubuntu 26.04 LTS**. PostgreSQL is external (for example AWS RDS). Everything else is installed on the server: Docker, Redis (password-protected), nginx and Let's Encrypt, plus Node.js in development mode.

## Before you start

- A server with at least 4 GB RAM (8 GB recommended) and 20 GB free disk. `x86_64` or `arm64`.
- A PostgreSQL 14+ database, such as AWS RDS. Its security group must allow this server's IP on port 5432.
- DNS A records pointing at the server for the app, api, admin and docs domains.

## Install

```bash
git clone https://github.com/vicharai/api.git vichar && cd vichar
cp .env.install.example .env && chmod 600 .env
nano .env                 # fill in the values marked REQUIRED
sudo ./install.sh check   # optional: validate before installing
sudo ./install.sh         # install
```

Then sign up on the dashboard with an `ADMIN_EMAILS` address and run:

```bash
sudo ./install.sh verify-admin you@yourdomain.com
```

## Modes (`DEPLOY_MODE` in `.env`)

|            | production                                           | development                                                   |
| ---------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Apps       | Docker images built from this checkout, auto-restart | native `pnpm dev` with hot reload (systemd unit `vichar-dev`) |
| Redis      | Docker, password from `.env`, internal network only  | Docker, password from `.env`, `127.0.0.1:6379`                |
| nginx      | all four domains                                     | all four domains                                              |
| TLS        | Let's Encrypt (default on)                           | optional (`ENABLE_TLS=true`)                                  |
| Firewall   | ufw: SSH, 80, 443 (default on)                       | off by default                                                |
| Migrations | applied by the api on start                          | `pnpm migrate` during install/update                          |

## Managing the server

```bash
sudo ./install.sh status          # services and health
sudo ./install.sh logs [app]      # follow logs
sudo ./install.sh restart | stop
sudo ./install.sh update          # git pull + rebuild + restart
```

Re-running `install` is safe. Use it after editing `.env`.

## Notes

- `install` writes generated secrets (`AUTH_SECRET`, `GATEWAY_API_KEY_HASH_SECRET`, `REDIS_PASSWORD`) back into `.env`. Back it up. Changing `GATEWAY_API_KEY_HASH_SECRET` later invalidates every API key.
- RDS TLS: use `?sslmode=verify-full`. The AWS RDS CA bundle is installed to `/etc/vichar/rds-global-bundle.pem` and trusted by the apps.
- URLs, CORS origins, the cookie domain and the passkey RP ID are derived from the domains into `.env.runtime`. Set any of them in `.env` to override.
- Install log: `/var/log/vichar-install.log`.
