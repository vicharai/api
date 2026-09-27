# Vichar deployment runbook

Single all-in-one container (postgres + redis + supervisord: ui, code, api,
gateway, worker) serving `https://app.vichar.io` (UI) and
`https://api.vichar.io` (path-split gateway/api). Host nginx terminates TLS;
all container ports are loopback-only.

## Files

| File                                      | Purpose                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `infra/unified.vichar.dockerfile`         | Local build (NOT the ghcr image) — skips playground/docs/admin/airside/mobile      |
| `infra/supervisord.vichar.conf`           | Only postgresql, redis, ui(:3002), code(:3004), api(:4002), gateway(:4001), worker |
| `infra/mock-openai.supervisord.conf`      | Staging-only mock-upstream program (drop-in via `[include]`)                       |
| `infra/docker-compose.vichar-staging.yml` | Staging overlay: mock provider + offset ports + separate volumes                   |
| `infra/docker-compose.vichar.yml`         | Standalone stack `vichar`                                                          |
| `infra/nginx-vichar.conf`                 | Edge vhost config — installed on host by operator (see file header)                |
| `.env.vichar.example`                     | Env template → copy to `.env.vichar` (repo root)                                   |

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
| 3304 | 3004      | code     | internal only                                      |
| 4301 | 4001      | gateway  | https://api.vichar.io (LLM prefixes)               |
| 4302 | 4002      | api      | https://api.vichar.io (catch-all)                  |
| —    | 5432      | postgres | not mapped — inspect via `docker exec vichar psql` |
| 8381 | 6379      | redis    | inspection only                                    |

Chosen to avoid existing stacks (3001/5432/5433/6379; 5532/7379/7479/3102-3107/
4101-4102/9190/4499; llmgateway-demo 3202-3207/4201/4202/5632/8379).

## Seeding policy

**Never run `pnpm seed` / `pnpm seed-demo` against this deployment.** The demo
seed inserts well-known API keys — they are unsafe for a public deployment.
Migrations run automatically on container start (`RUN_MIGRATIONS=true`).

## Assigning a plan to an org

`POST https://api.vichar.io/admin/organizations/{id}/dev-plan` with an admin
session (cookie auth; the email must be listed in `ADMIN_EMAILS` and already
registered+verified — see .env.vichar.example). psql fallback:

```bash
docker exec -it vichar psql -U postgres -d llmgateway
-- then UPDATE the org row's plan/credit columns directly
```

## Staging stack (failover testing)

`infra/docker-compose.vichar-staging.yml` is a compose overlay for a second
container (`vichar-staging`, offset ports 3312/3314/4311/4312/8391, separate
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
docker exec vichar supervisorctl status                            # all programs RUNNING
```
