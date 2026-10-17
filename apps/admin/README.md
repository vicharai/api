# Vichar admin panel (`apps/admin`)

Staff console for Vichar, served at `https://admin.vichar.io` from its own
container (`infra/vichar-admin.dockerfile`). Clean-room AGPL code; it shares
nothing with upstream's commercially licensed `ee/admin`.

The panel is a thin client: every action calls an `/admin/*` endpoint of
`apps/api`, which enforces the session, the admin role and the permission
policy (`apps/api/src/middleware/admin.ts`) and records every mutating request
in the admin audit log. The UI hides or disables controls a role cannot use,
but the API is the boundary.

## Running locally

```bash
pnpm dev                                   # admin on :3006 (ADMIN_PORT)
turbo run build --filter=admin             # production build
```

Env: `API_URL` (browser → api), `API_BACKEND_URL` (server → api, defaults to
`API_URL`), `UI_URL`. The api must list the admin origin in `ORIGIN_URLS` and
`ADMIN_URL`. Sign in with a verified account whose email is in `ADMIN_EMAILS`
(owner) or that holds an admin role.

## Roles

| Role      | Granted by                      | Summary                                                          |
| --------- | ------------------------------- | ---------------------------------------------------------------- |
| Owner     | `ADMIN_EMAILS` (verified email) | Full `admin`; cannot be demoted or removed from the panel        |
| `admin`   | Team page                       | Everything                                                       |
| `support` | Team page                       | Read everything except revenue; customer-support actions (below) |
| `viewer`  | Team page                       | Read everything except revenue                                   |

Revenue and staff data (`/admin/metrics*`, `/admin/global-stats*`,
`/admin/team*`) are admin-only, so support and viewers see the Overview's
"needs attention" tiles but not the revenue KPIs, and have no Usage or Team
page.

## Capability matrix

✓ = allowed, — = not allowed. "Read" covers every list, detail and chart on
the page.

| Area                  | Capability                                                                 | Viewer | Support | Admin |
| --------------------- | -------------------------------------------------------------------------- | :----: | :-----: | :---: |
| Overview              | Needs-attention counters                                                   |   ✓    |    ✓    |   ✓   |
| Overview              | Revenue, signups, usage and cost-by-model KPIs and charts                  |   —    |    —    |   ✓   |
| Users                 | Search users; profile, orgs, sessions, sign-in methods                     |   ✓    |    ✓    |   ✓   |
| Users                 | Mark email verified                                                        |   —    |    ✓    |   ✓   |
| Users                 | Approve a risk flag                                                        |   —    |    ✓    |   ✓   |
| Users                 | Block / unblock, force logout (never self or staff)                        |   —    |    —    |   ✓   |
| Users                 | Send email to a user                                                       |   —    |    ✓    |   ✓   |
| Flagged accounts      | Read                                                                       |   ✓    |    ✓    |   ✓   |
| Flagged accounts      | Approve, archive / restore                                                 |   —    |    ✓    |   ✓   |
| Organizations         | List, sort, filter, CSV export; detail tabs (read)                         |   ✓    |    ✓    |   ✓   |
| Organizations         | Bulk block with preview                                                    |   —    |    —    |   ✓   |
| Org · actions         | Adjust credits (±), gift credits, record manual payment                    |   —    |    —    |   ✓   |
| Org · actions         | Block / unblock (optionally reactivating members), set status, risk flag   |   —    |    —    |   ✓   |
| Org · actions         | Disable auto top-up                                                        |   —    |    —    |   ✓   |
| Org · manage          | Name, plan, seat/key/project limits, trust and content-filter tier, terms  |   —    |    —    |   ✓   |
| Org · manage          | Referral bonus                                                             |   —    |    —    |   ✓   |
| Org · members         | Members and teams; email a member                                          |  read  |    ✓    |   ✓   |
| Org · projects        | Project metrics, model/provider stats, cost timeseries, project logs       |   ✓    |    ✓    |   ✓   |
| Org · API keys        | List keys (BYOK provider keys read-only)                                   |   ✓    |    ✓    |   ✓   |
| Org · API keys        | Revoke / reactivate a key                                                  |   —    |    —    |   ✓   |
| Org · transactions    | History                                                                    |   ✓    |    ✓    |   ✓   |
| Org · transactions    | Refund a payment                                                           |   —    |    ✓    |   ✓   |
| Org · transactions    | Record / edit enterprise deals                                             |   —    |    —    |   ✓   |
| Org · logs            | Request logs with filters and payload detail                               |   ✓    |    ✓    |   ✓   |
| Org · limits          | Rate limits, limit hits, discounts (read)                                  |   ✓    |    ✓    |   ✓   |
| Org · limits          | Create / edit / delete rate limits and discounts                           |   —    |    —    |   ✓   |
| Org · provider access | Read                                                                       |   ✓    |    ✓    |   ✓   |
| Org · provider access | Set allow / deny lists of providers, models, mappings                      |   —    |    —    |   ✓   |
| Org · safety          | Content filter activity, guardrail config and violations                   |   ✓    |    ✓    |   ✓   |
| Org · settings        | Settings snapshot, payment methods, SSO / SCIM                             |   ✓    |    ✓    |   ✓   |
| Org · settings        | Release a DevPass card fingerprint                                         |   —    |    —    |   ✓   |
| Org · audit           | Per-org audit log                                                          |   ✓    |    ✓    |   ✓   |
| CRM                   | Pipeline board, table, KPIs, account detail, tasks, CSV export             |   ✓    |    ✓    |   ✓   |
| CRM                   | Log, complete and delete activities                                        |   —    |    ✓    |   ✓   |
| CRM                   | Create / edit / delete accounts, change stage, contacts, linked orgs       |   —    |    —    |   ✓   |
| Issues                | Unstable mappings and error samples, payment failures, limit hits, content |   ✓    |    ✓    |   ✓   |
| Issues                | Add / remove ignored-error rules                                           |   —    |    —    |   ✓   |
| Support               | Chats, contact submissions, provider listing requests (read)               |   ✓    |    ✓    |   ✓   |
| Support               | Reply, mark read, archive chats and submissions; send email                |   —    |    ✓    |   ✓   |
| Support               | Delete chats / submissions / listing requests; bulk delete                 |   —    |    —    |   ✓   |
| Load                  | Gateway load by model, provider, org, project or key; CSV                  |   ✓    |    ✓    |   ✓   |
| Usage                 | Global usage stats and provider-key breakdown                              |   —    |    —    |   ✓   |
| Providers             | Health, provider and mapping detail, incidents, credential spend           |   ✓    |    ✓    |   ✓   |
| Providers             | Add / edit / disable / delete / reorder credentials, self-test, verify     |   —    |    —    |   ✓   |
| Models                | Model and mapping stats, verifications (read)                              |   ✓    |    ✓    |   ✓   |
| Models                | Queue / cancel verifications                                               |   —    |    —    |   ✓   |
| Routing               | Routing analytics                                                          |   ✓    |    ✓    |   ✓   |
| Routing               | Score multipliers and global rate limits (CRUD)                            |  read  |  read   |   ✓   |
| Safety                | Content filter settings and violations (read)                              |   ✓    |    ✓    |   ✓   |
| Safety                | Change content filter settings                                             |   —    |    —    |   ✓   |
| Benchmarks            | Runs and results                                                           |   ✓    |    ✓    |   ✓   |
| Benchmarks            | Start / cancel runs                                                        |   —    |    —    |   ✓   |
| Billing               | Discounts, orgs with discounts, credit-purchase switch, payment failures   |  read  |  read   |   ✓   |
| Settings              | Banner, blocked countries / email domains, error-rate alerts, license      |  read  |  read   |   ✓   |
| Audit log             | Global admin action feed with filters                                      |   ✓    |    ✓    |   ✓   |
| Team                  | List staff, grant / change / revoke roles                                  |   —    |    —    |   ✓   |

Every destructive action asks for confirmation, and most ask for a reason
that is sent to the API (where the endpoint takes one) and recorded in the
audit log.

## Code layout

- `src/app/(auth)/login` — sign-in (email/password, passkey)
- `src/app/(dashboard)/…` — pages; the layout redirects to `/login` without an
  admin session
- `src/components/<section>/…` — page components
- `src/lib/fetch-client.ts` — typed `useApi()` / `useFetchClient()`
- `src/lib/api/pending-paths.ts` — contract types for admin endpoints missing
  from the generated OpenAPI types; generated definitions take precedence
- `src/lib/permissions.ts` — client mirror of the API role policy (UI hints only)
