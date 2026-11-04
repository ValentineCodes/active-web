# Active operations dashboard

## Run locally

1. Apply migrations: `pnpm db:migrate` (or `pnpm db:reset`).
2. Copy root `.env` and set Supabase URL + anon key (`EXPO_PUBLIC_*` or `NEXT_PUBLIC_*`; see root `.env.example`). The admin app loads the repo root `.env` automatically; optional override: `ln -sf ../../.env apps/admin/.env`.
3. Seed a local Super Admin (idempotent): `pnpm db:seed-admin`  
   **Email:** `admin@active.local` · **Password:** `active-admin`  
   (Also runs automatically on `pnpm db:reset`.)
4. `pnpm admin:dev` → http://localhost:3001

If sign-in returns `email_provider_disabled`, restart the local stack so Auth picks up `supabase/config.toml`: `pnpm db:start` (or `supabase stop && supabase start`).

## Provision the first Super Admin

There is **no** self-service admin registration. Ordinary app users (phone OTP) are not administrators until provisioned.

For local dev, use the seeded account above. On other environments:

1. Create a **staff** user in Supabase Auth with email + password (Dashboard → Authentication → Users → Add user, or invite). Do not reuse consumer test phones for production staff.
2. Note the user UUID.
3. As a privileged database role (`postgres` / `service_role`), call:

```sql
SELECT public.admin_provision_member(
  '<auth-user-uuid>'::uuid,
  'super_admin'::public.admin_role
);
```

Local example after `pnpm db:start`:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c \
  "SELECT public.admin_provision_member('<uuid>'::uuid, 'super_admin'::public.admin_role);"
```

Subsequent members can be granted by a signed-in Super Admin via `admin_grant_member` (Settings UI planned).

## Roles

| Role            | Access                                                 |
| --------------- | ------------------------------------------------------ |
| `super_admin`   | All sections including audit logs and settings         |
| `support_admin` | Overview, users, requests, reports, operational issues |
| `finance_admin` | Overview, transactions, wallets, withdrawals           |

Authorization is enforced in middleware (route access) and `get_my_admin_permissions()` (database). The `admin_members` table has no policies for `authenticated`; rows cannot be read or written from the client API except through these RPCs.

## Reports (service problems)

User-facing **Report** flow writes to `service_problems` (not a separate admin report table). Dashboard RPCs:

| RPC                                 | Purpose                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `admin_list_reports`                | Searchable queue with investigation filters                                   |
| `admin_get_report`                  | Detail, parties, chat, financial slice, evidence paths (view audited)         |
| `admin_assign_report`               | Assign support administrator (open reports only)                              |
| `admin_update_report_investigation` | Internal queue status: `triage`, `under_review`, `awaiting_info`, `escalated` |
| `admin_add_report_note`             | Private notes on `admin_service_problem_notes`                                |
| `admin_resolve_report`              | Permission-checked wrapper around `admin_resolve_service_problem`             |

**Schema notes**

- User report lifecycle status remains `open` \| `resolved` on `service_problems`. Queue labels (new, under review, awaiting counterparty, etc.) are derived from `service_problem_investigations` plus `respond_by` for meet-up reports.
- There is **no** user-facing cancellation workflow. Counterparties may **contest** certain reports via `contest_service_problem` (mobile), which auto-resolves with `resolution = contested` — not an admin action.
- Financial outcomes (`refund_requester`, `pay_provider`, `resume_service`) use the existing `admin_resolve_service_problem` implementation and are only available through `admin_resolve_report` with findings text and idempotency key.
- Evidence photos live in the private `request-media` bucket. Administrators with `reports` permission can read paths referenced on open reports; `admin_get_report` writes a `report_view` audit event.

## Finance (transactions, wallets, withdrawals)

Finance admins (`finance_admin`, `super_admin`) use RPCs backed by `wallet_transactions`, `deposit_transactions`, `payment_locks`, and `wallets` (kobo integers, NGN only).

| RPC                                       | Permission                             | Purpose                                                    |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `admin_list_transactions`                 | `transactions`                         | Ledger search with type group and status filters           |
| `admin_get_transaction`                   | `transactions`                         | Ledger row + request, lock, deposit link                   |
| `admin_list_deposits`                     | `transactions`                         | Paystack deposit lifecycle                                 |
| `admin_get_deposit`                       | `transactions`                         | Deposit detail                                             |
| `admin_list_wallets` / `admin_get_wallet` | `wallets`                              | Balances, locks, ledger slice                              |
| `admin_list_withdrawals`                  | `withdrawals`                          | Withdrawal-type ledger rows (read-only)                    |
| `admin_get_finance_summary`               | `transactions`                         | Commission / volume metrics (same definitions as overview) |
| `admin_financial_exceptions`              | `transactions` or `operational_issues` | Read-only reconciliation checks                            |

## Operational issues & audit

| RPC                                                 | Permission                             | Purpose                                              |
| --------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| `admin_operational_issues`                          | `operational_issues` or `transactions` | Prioritized diagnostic queue                         |
| `admin_execute_operational_recovery`                | `operational_issues`                   | `auto_complete_request` when eligibility checks pass |
| `admin_list_audit_events` / `admin_get_audit_event` | `audit_logs` (super admin)             | Searchable audit trail with redacted metadata        |
| `admin_list_members`                                | `settings`                             | Dashboard member directory                           |
| `admin_grant_member` / `admin_revoke_member`        | super admin caller                     | Role changes with audit rows                         |

`admin_audit_events` has no RLS policies for clients; rows are append-only via `admin_record_audit_event` and readable only through audit RPCs.

**Read-only / not in schema**

- Manual balance edits (no admin adjustment RPC).
- Marking withdrawals successful from the dashboard (`wallet_withdraw` is disabled for users; payout state must follow Paystack/backend settlement).
- Offline / cash payments (not modeled).
- Paystack processing fees and net platform revenue (see `unavailable_metrics` on overview/summary).

**Not supported yet**

- Dedicated admin-to-user “request information” channel (use request chat between participants).
- Finance-only report queue without `reports` permission (finance admins see wallet data on a report only when `transactions` is true).
- Automatic engagement changes when assigning or changing investigation queue status.
