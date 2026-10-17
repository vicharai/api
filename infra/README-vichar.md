# Vichar deployment runbook

Single all-in-one container (postgres + redis + supervisord: ui, docs, api,
gateway, worker) serving `https://app.vichar.io` (UI),
`https://api.vichar.io` (path-split gateway/api) and `https://docs.vichar.io`
(docs). Host nginx terminates TLS; all container ports are loopback-only.

## Files

| File                                      | Purpose                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| `infra/unified.vichar.dockerfile`         | Local build (NOT the ghcr image)                                              |
| `infra/supervisord.vichar.conf`           | postgresql, redis, ui(:3002), docs(:3005), api(:4002), gateway(:4001), worker |
| `infra/mock-openai.supervisord.conf`      | Staging-only mock-upstream program (drop-in via `[include]`)                  |
| `infra/docker-compose.vichar-staging.yml` | Staging overlay: mock provider + offset ports + separate volumes              |
| `infra/docker-compose.vichar.yml`         | Standalone stack `vichar`                                                     |
| `infra/nginx-vichar.conf`                 | Edge vhost config — installed on host by operator (see file header)           |
| `.env.vichar.example`                     | Env template → copy to `.env.vichar` (repo root)                              |

## Setup

```bash
cd /root/llmgateway-upstream
cp .env.vichar.example .env.vichar
chmod 600 .env.vichar        # gitignored — never commit
$EDITOR .env.vichar          # fill AUTH_SECRET, GATEWAY_API_KEY_HASH_SECRET,
                             # LLM_AWS_BEDROCK_* on the server
```

Generate secrets: `openssl rand -base64 32`.

## Build / up / down

```bash
docker compose -f infra/docker-compose.vichar.yml build
docker compose -f infra/docker-compose.vichar.yml up -d
docker compose -f infra/docker-compose.vichar.yml down
docker compose -f infra/docker-compose.vichar.yml logs -f vichar
```

The image is always built locally from this branch — never pull
`ghcr.io/theopenco/llmgateway-unified` (it lacks our code changes).

## Port map (all bound to 127.0.0.1)

| Host | Container | Service  | Exposed as                                         |
| ---- | --------- | -------- | -------------------------------------------------- |
| 3302 | 3002      | ui       | https://app.vichar.io                              |
| 3305 | 3005      | docs     | https://docs.vichar.io                             |
| 4301 | 4001      | gateway  | https://api.vichar.io (LLM prefixes)               |
| 4302 | 4002      | api      | https://api.vichar.io (catch-all)                  |
| 3306 | 3006      | admin    | https://admin.vichar.io (own container)            |
| —    | 5432      | postgres | not mapped — inspect via `docker exec vichar psql` |
| 8381 | 6379      | redis    | inspection only                                    |

Chosen to avoid existing stacks (3001/5432/5433/6379; 5532/7379/7479/3102-3107/
4101-4102/9190/4499; llmgateway-demo 3202-3207/4201/4202/5632/8379).

## Seeding policy

**Never run `pnpm seed` / `pnpm seed-demo` against this deployment.** The demo
seed inserts well-known API keys — they are unsafe for a public deployment.
Migrations run automatically on container start (`RUN_MIGRATIONS=true`).

## Admin panel (admin.vichar.io)

`apps/admin` runs as its own container (`ghcr.io/vicharai/api-admin`,
`infra/vichar-admin.dockerfile`) on host port 3306 (blue) / 3316 (green),
switched together with the app colour. It calls the api from the browser at
`API_URL` and server-side at `API_BACKEND_URL=http://vichar-app-<colour>:4002`
on the `vichar` network. What each role can do: `apps/admin/README.md`.

One-time setup:

1. DNS: an `A` record `admin.vichar.io` → the host IP.
2. `.env.vichar`: `ADMIN_URL=https://admin.vichar.io` and
   `ORIGIN_URLS=https://app.vichar.io,https://admin.vichar.io` (CORS,
   better-auth trusted origins, passkey origin). `COOKIE_DOMAIN=.vichar.io`
   and `PASSKEY_RP_ID=vichar.io` already cover the subdomain.
3. Certificate: `certbot --nginx -d admin.vichar.io` (or `certonly`, see the
   header of `infra/nginx-vichar.conf`).
4. Deploy once so `/etc/nginx/vichar-upstreams.conf` gains `vichar_admin`,
   then install the updated `infra/nginx-vichar.conf` and
   `nginx -t && systemctl reload nginx`.
5. Owners come from `ADMIN_EMAILS` and need a verified email. Admin accounts
   are NOT auto-verified at signup (that would let anyone claim an
   unregistered `ADMIN_EMAILS` address). After signing up, verify once:

```bash
docker exec -it vichar-postgres psql -U postgres -d vichar \
  -c "UPDATE \"user\" SET email_verified = true WHERE email = 'admin@example.com'"
```

Owners grant further staff the `admin`, `support` or `viewer` role on the
panel's Team page. Plans, limits and credits are managed on an organization's
page in the panel (backed by `PATCH /admin/organizations/{id}/manage` and the
other `/admin` endpoints).

Manual run without the deploy scripts:
`docker compose --env-file .env.vichar -f infra/docker-compose.vichar.yml --profile manual up -d admin`.

## Backups

`infra/backup-vichar.sh` runs `pg_dump` inside the `vichar` container, gzips the
result to `/var/backups/vichar/vichar-<timestamp>.sql.gz` (mode 600), and keeps
the newest 3 dumps. It refuses to rotate if the dump fails or is <1 MB, and
skips entirely when free disk is below 5G.

```bash
# install the daily job (03:17 UTC)
cp infra/cron.vichar-backup /etc/cron.d/vichar-backup

# or run a manual backup now
infra/backup-vichar.sh
```

Restore:

```bash
# stop the app services so nobody writes during the restore
docker exec vichar supervisorctl stop api gateway worker ui

gunzip -c /var/backups/vichar/vichar-YYYYMMDD-HHMM.sql.gz | \
  docker exec -i vichar psql -U postgres -d vichar

docker exec vichar supervisorctl start api gateway worker ui
```

## Staging stack (failover testing)

`infra/docker-compose.vichar-staging.yml` is a compose overlay for a second
container (`vichar-staging`, offset ports 3312/4311/4312/8391, separate
volumes) that additionally runs the mock OpenAI upstream on in-container :4499
and sets `LLM_OPENAI_*` pointing at it. Use it to exercise cross-provider
fallback — the fake provider must never run in production.

```bash
docker compose -f infra/docker-compose.vichar.yml \
               -f infra/docker-compose.vichar-staging.yml up -d
```

## Logs

```bash
docker logs -f vichar                        # all supervisord program stdout
docker exec -it vichar tail -f /var/log/supervisor/supervisord.log
docker exec -it vichar tail -f /var/log/postgresql.log
```

## Persistence & restarts

Named volumes `vichar_postgres` (`/var/lib/postgresql/data`) and
`vichar_redis` (`/var/lib/redis`) survive `down`/`up` and image rebuilds.
`restart: unless-stopped` brings the container back after host/docker restarts.
`down -v` destroys all data — do not run it.

## Healthchecks

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4302/   # api
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4301/   # gateway
curl -sS http://127.0.0.1:4301/v1/models | head                    # model list
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3302/   # ui
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3305/   # docs
docker exec vichar supervisorctl status                            # all programs RUNNING
```

## Licensing (ee/ dependencies)

Vichar's production image builds and executes code under `ee/`, which is
covered by the separate **LLMGateway Enterprise License** (`ee/LICENSE`), not
AGPL. Production use requires a valid enterprise license.

| Package                                  | Imported by                                                                                                | Runtime behavior                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@llmgateway/audit` (ee/audit)           | 26 `apps/api` files (orgs, teams, keys, dev-plans, payments, `admin-dev-plan`)                             | `logAuditEvent` writes `audit_log` rows on every mutating API call — unconditional                                |
| `@llmgateway/guardrails` (ee/guardrails) | `apps/api/src/routes/guardrails.ts`, `apps/gateway/src/chat/chat.ts`, `apps/gateway/src/lib/compliance.ts` | Guardrail checks run only for enterprise-flagged orgs (inert today), but the code ships and executes in the image |

**Permission required:** a valid LLMGateway Enterprise license covering this
hosted deployment and the applicable seat count, per `ee/LICENSE` and
https://llmgateway.io/terms. `LLMGATEWAY_ENTERPRISE_LICENSE` is unset; the
license-check library reports `status: "missing"`, which keeps enterprise
_features_ disabled but does not satisfy the license for shipping ee/ code.

**Alternatives if no license is purchased:** replace `@llmgateway/audit` with a
clean-room internal writer for the `audit_log` table (schema lives in
`packages/db`, outside ee/), and gate/remove the `@llmgateway/guardrails`
imports. Do not copy ee/ code.

**AGPL note:** the rest of the codebase is AGPLv3 — serving a modified build on
`api.vichar.io` obligates us to offer the corresponding source (keep a public
fork or source link available).

## Split architecture (Phase 1) and backups (Phase 2)

Postgres and Redis run as separate compose services (`vichar-postgres`,
`vichar-redis`); the app image (`vichar-app`) contains only ui, docs, api,
gateway, worker. `VICHAR_WORKER_AUTOSTART=false` keeps background jobs off one
colour during blue/green deploys.

New files:

| File                                | Purpose                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `infra/vichar-postgres.dockerfile`  | postgres:17-bookworm + pinned WAL-G                            |
| `infra/postgres/*`                  | wal-push wrapper, conf drop-in, entrypoint (env mapping)       |
| `infra/vichar-app.dockerfile`       | app image without postgres/redis                               |
| `infra/vichar-admin.dockerfile`     | admin panel image (`apps/admin`, Next.js standalone on :3006)  |
| `infra/supervisord.vichar-app.conf` | ui/docs/api/gateway/worker only                                |
| `infra/cutover-vichar.sh`           | idempotent go-live script (parameterized for staging)          |
| `infra/backup/*`                    | base backup, restore drill, monitor, key generator             |
| `infra/backup-vichar.sh`            | nightly dump + optional encrypted R2 upload                    |
| `infra/cron.vichar-backup`          | install instructions in file header (not installed by default) |

### Runbook

Point-in-time restore (WAL + base backups, once R2 creds exist):

```bash
docker compose --env-file ../.env.vichar -f infra/docker-compose.vichar.yml up -d postgres
docker exec vichar-postgres sh -c 'rm -rf /var/lib/postgresql/data/*'
docker exec vichar-postgres wal-g backup-fetch /var/lib/postgresql/data LATEST
docker exec vichar-postgres sh -c \
  'touch /var/lib/postgresql/data/recovery.signal &&
   printf "restore_command=%s\n" "/usr/local/bin/wal-g wal-fetch %%f %%p" >> /var/lib/postgresql/data/postgresql.auto.conf'
docker restart vichar-postgres
```

Restore from an encrypted dump:

```bash
export VICHAR_BACKUP_KEY=...          # owner-managed, stored off-server
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:VICHAR_BACKUP_KEY \
  -in /var/backups/vichar/vichar-YYYYmmdd-HHMM.sql.gz.enc | gunzip \
  | docker exec -i vichar-postgres psql -U postgres -d vichar
```

Full rebuild on a new server:

```bash
git clone <repo> && cd llmgateway-upstream
# create .env.vichar (copy keys incl. POSTGRES_PASSWORD + VICHAR_BACKUP_KEY)
docker compose --env-file .env.vichar -f infra/docker-compose.vichar.yml up -d postgres redis
# fetch newest dump from R2 (or WAL-G base-backup path above), restore, then:
docker compose --env-file .env.vichar -f infra/docker-compose.vichar.yml --profile manual up -d app
```

### R2 bucket setup (owner, at go-live)

- Bucket e.g. `vichar-backups`, scoped token placed in `.env.vichar` as
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`.
- Lifecycle rules: expire `dumps/daily/` after 7 days, `dumps/weekly/` after
  35 days, `dumps/monthly/` after 370 days.
- Bucket lock: lock `dumps/` for 7 days. Do NOT lock `walg/` (WAL-G's
  `delete retain` must be able to prune).
- Store `VICHAR_BACKUP_KEY` off-server (password manager) — it encrypts both
  the WAL archive and the R2 dumps; losing it makes all backups unrecoverable.

## CI/CD (Phase 3)

Two extra workflows in `.github/workflows/`, both gated with
`if: github.repository == 'vicharai/api'` so they never run on upstream:

```
push/PR ──▶ vichar-ci:      checks (pnpm build, pnpm lint)
                            unit-tests (pg/redis services, push-test, test:unit)
push main ─▶ vichar-deploy: image  (docker build → ghcr.io/vicharai/api-app
                                    and ghcr.io/vicharai/api-admin:
                                    sha-<short> + :latest)
                            deploy (SSH deploy@host → sudo vichar-deploy <sha>)
```

The deploy job depends on the image job, runs under `concurrency:
deploy-production` with `cancel-in-progress: false` (a killed deploy could
leave nginx half-switched), and uses `environment: production`.

Host-side (installed to `/usr/local/sbin` by `infra/deploy/setup-deploy-user.sh`):

- `vichar-deploy <sha>` — disk check, pre-deploy `pg_dump` via
  `infra/backup-vichar.sh` (fail-closed when the script exists), pull both images, start idle colour
  (`vichar-app-blue`/`vichar-app-green` on port sets 3302/3305/4301/4302 and
  3312/3315/4311/4312), health-check all four surfaces, then start
  `vichar-admin-<colour>` (3306 / 3316) and check its `/login`, rewrite
  `/etc/nginx/vichar-upstreams.conf`, `nginx -t && reload`, `supervisorctl
start worker` on the new colour, stop the old one, write
  `/var/lib/vichar/deploy-state`, prune old `sha-*` images (keeps current +
  2 previous), post to Discord.
- `vichar-rollback <sha>` — restarts the parked other-colour container (or
  re-pulls its image) and switches back.
- Dry-run: `VICHAR_DEPLOY_DRY_RUN=1 vichar-deploy <sha>` prints every mutating
  step without executing. `VICHAR_SKIP_NGINX=1` / `VICHAR_SKIP_WORKER=1` are
  test hooks for stub containers.
- Failure rule: anything before the nginx switch auto-cleans the new colour
  and exits non-zero; a failure after the switch keeps the new colour live
  and pages loudly — manual call, no auto-rollback.

The worker runs on exactly one colour: the idle colour starts with
`VICHAR_WORKER_AUTOSTART=false` (supervisord `%(ENV_...)s`), and deploy
starts it via `supervisorctl` only after the switch.

### GitHub-side setup (owner, once)

- Create environment `production` on `vicharai/api`.
- Secrets: `DEPLOY_SSH_KEY` (private key generated by setup-deploy-user.sh),
  `DEPLOY_HOST` (161.202.178.203), `DEPLOY_USER` (`deploy`), optional
  `VICHAR_OPS_DISCORD_WEBHOOK`. Host pulls ghcr via a `read:packages` PAT —
  `docker login ghcr.io` once as root (setup script prints the command).
- Same webhook var can also live in `.env.vichar` so the host-side scripts
  post status themselves.
- Disable the inherited upstream workflows:
  `gh workflow disable ci.yml pr.yml publish.yml images.yml e2e.yml
image-actions.yml image-tests.yml run.yml test-playwright.yml
test-unit.yml autofix.yml traffic-report.yml weekly-release.yml`
- Branch protection on `main`: require `vichar-ci` checks + `vichar-deploy`
  build green. Deploy secrets are never exposed to fork PRs (pull_request
  gets no secrets; deploy only triggers on push to main).

### Go-live order on the host

1. `infra/deploy/setup-deploy-user.sh` (as root) — deploy user, sudoers
   drop-in, keypair, installs scripts, seeds `/etc/nginx/vichar-upstreams.conf`
   with the blue ports.
2. Install the updated `infra/nginx-vichar.conf` (upstream names) to
   `/etc/nginx/llmgateway-demo/vichar.conf`, then `nginx -t && systemctl
reload nginx`. The upstreams file must exist first — step 1 does that.
3. `docker login ghcr.io` with the PAT.
4. If legacy `vichar` is still live, seed
   `/var/lib/vichar/deploy-state` (the setup script prints the exact
   `printf`); otherwise the first deploy detects it from the blue ports.
5. First `vichar-deploy <sha>` lands on green and stops `vichar`.

### Migration rule (expand → contract)

Blue and green share `vichar-postgres`, and the new colour runs migrations
at boot (`RUN_MIGRATIONS=true` in `apps/api/src/serve.ts`) while the old
colour still serves. Additive changes (new tables/columns, nullable) ship in
one release; drops/renames/type changes ship in a later release after every
colour of the previous version is gone.

### Manual deploy / rollback

```bash
sudo vichar-deploy 0c23e66            # deploy ghcr tag sha-0c23e66
sudo vichar-rollback 3c9225c          # switch back to the other colour
cat /var/lib/vichar/deploy-state      # live colour + sha + timestamp
```

### Note: staging overlay port overlap

Green's port set (3312/3315/4311/4312) is the same range the old
`docker-compose.vichar-staging.yml` overlay used. Do not run the staging
overlay and a green deploy at the same time — retire or re-port staging.
