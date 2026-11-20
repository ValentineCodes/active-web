# Production scheduling and operations (OV-01)

Database migrations define **callable** maintenance RPCs; they do **not** install pg_cron jobs. Production must invoke scheduled work explicitly.

## Required RPCs (service role)

| Job | Function | Purpose |
|-----|----------|---------|
| Request auto-complete | `auto_complete_due_requests(p_limit)` | Completes `completion_pending` requests after `completion_confirm_by` (single-pay path). |
| Project funding evaluation | `evaluate_due_project_funding(p_limit)` | Evaluates funding status when `funding_deadline_at` has passed. |

Both are granted to **`service_role` only** (not authenticated clients).

## Recommended invoker

Edge Function: `operational-scheduler` (`supabase/functions/operational-scheduler`).

Schedule via Supabase Dashboard → Edge Functions → Cron, or an external cron (GitHub Actions, Fly.io, etc.) hitting:

```http
POST https://<project-ref>.supabase.co/functions/v1/operational-scheduler?limit=100
x-operational-cron-secret: <OPERATIONAL_CRON_SECRET>
```

## Environment variables (server / Edge only — never commit)

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` | Edge Functions (auto-injected in hosted Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | `operational-scheduler` (auto-injected) |
| `OPERATIONAL_CRON_SECRET` | Shared secret header for cron caller |
| `PAYSTACK_SECRET_KEY` | `paystack-*` functions |
| `NIN_ENCRYPTION_KEY` / `NIN_FINGERPRINT_KEY` | Identity functions |

Set `OPERATIONAL_CRON_SECRET` in the Supabase project secrets for Edge Functions. Rotate if leaked; never log the value.

## Local development

1. Set `OPERATIONAL_CRON_SECRET` in the repo root `.env` (see `.env.example`).
2. `pnpm db:start` and `pnpm db:serve` (restart serve after changing `.env` or `supabase/config.toml`).
3. Smoke test:

```bash
curl -sS -X POST "http://127.0.0.1:54321/functions/v1/operational-scheduler?limit=100" \
  -H "x-operational-cron-secret: $OPERATIONAL_CRON_SECRET"
```

`operational-scheduler` uses `verify_jwt = false` locally; auth is the shared secret header only.

## Manual / admin recovery

Until cron is live, support can:

- Use **Operational issues** in `apps/admin` for eligible single-request `auto_complete_request` recovery (`admin_execute_operational_recovery`).
- Run batch jobs via `service_role` SQL or the `operational-scheduler` function from a secure ops runner.

## Monitoring gaps (documented)

- Paystack webhook failures and push delivery are **not** durably queued in Postgres (`admin_operational_issues` lists known gaps).
- No in-repo CI pipeline (OV-02); run `pnpm validate`, `pnpm db:test`, `pnpm functions:test`, `pnpm pwa:test` before release.

## Production readiness blockers

Do **not** claim full production readiness while:

- **UD-19** — contributor refund allocation unset.
- **UD-04 / UD-05** — project financial closure rules unset.
- **OV-01** — no scheduled invoker for `auto_complete_due_requests` / `evaluate_due_project_funding`.